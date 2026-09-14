import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { listCalendars, type Calendar } from '../gcal/api'
import { connect, disconnect, getGcalState, onGcalState, type GcalState } from '../gcal/client'
import { reconcile } from '../gcal/sync'
import { setTaskGcal, setWorkspaceGcal, updateTask } from '../db/api'
import { SAVE_DELAY } from '../lib/useAutosave'
import { useEscape } from '../lib/useEscape'
import type { T } from '../i18n'
import type { TextKey } from '../i18n/dict'
import type { GcalConfig, GcalReminder, Task, Workspace } from '../db/types'
import './Gcal.css'

/*
 * Everything the owner clicks to get a reminder out of Google Calendar: the
 * account row, the four fields of an event, the window the task card opens and
 * the section the settings window carries.
 *
 * One form, two places. The event's settings and the workspace's defaults are
 * the same four fields by decision, and writing them twice would let the two
 * drift apart.
 */

/** What a first tick gets when the workspace has no defaults of its own. */
const FALLBACK: GcalConfig = {
  time: '10:00',
  end: null,
  calendar_id: 'primary',
  color_id: null,
  reminders: [{ method: 'popup', minutes: 1440 }],
}

function defaultsOf(workspace: Workspace | null): GcalConfig {
  return workspace?.gcal ?? FALLBACK
}

/**
 * Two sets of terms, field by field and reminder by reminder in their order. It
 * answers one question — was anything in the form actually moved — and that is
 * what decides whether a task keeps following its workspace.
 *
 * The task's own frame is not one of the fields and never will be. A frame is
 * the task's data rather than its terms: setting one in the window below moves
 * the event's hours and nothing else, and it must not take the task out from
 * under its workspace's switch the way altering the terms does.
 */
function same(a: GcalConfig, b: GcalConfig): boolean {
  return (
    a.time === b.time &&
    (a.end ?? null) === (b.end ?? null) &&
    a.calendar_id === b.calendar_id &&
    a.color_id === b.color_id &&
    a.reminders.length === b.reminders.length &&
    a.reminders.every(
      (r, i) => r.method === b.reminders[i].method && r.minutes === b.reminders[i].minutes,
    )
  )
}

/*
 * Google's own event palette. The ids and the colours are theirs; the names are
 * the ones its own interface uses in each language, so that a colour called one
 * thing here is called the same thing there.
 */
const COLORS: { id: string; name: TextKey; hex: string }[] = [
  { id: '1', name: 'gcal.color.1', hex: '#7986cb' },
  { id: '2', name: 'gcal.color.2', hex: '#33b679' },
  { id: '3', name: 'gcal.color.3', hex: '#8e24aa' },
  { id: '4', name: 'gcal.color.4', hex: '#e67c73' },
  { id: '5', name: 'gcal.color.5', hex: '#f6bf26' },
  { id: '6', name: 'gcal.color.6', hex: '#f4511e' },
  { id: '7', name: 'gcal.color.7', hex: '#039be5' },
  { id: '8', name: 'gcal.color.8', hex: '#616161' },
  { id: '9', name: 'gcal.color.9', hex: '#3f51b5' },
  { id: '10', name: 'gcal.color.10', hex: '#0b8043' },
  { id: '11', name: 'gcal.color.11', hex: '#d50000' },
]

/** How long before the event a reminder can fire, in minutes. */
const OFFSETS = [0, 10, 30, 60, 120, 1440, 2880]

/** Google takes five; the owner asked for three. */
const MAX_REMINDERS = 3

function offsetLabel(t: T, minutes: number): string {
  if (minutes === 0) return t('gcal.atTime')
  if (minutes < 60) return t.n('gcal.beforeMinutes', minutes)
  if (minutes < 1440) return t.n('gcal.beforeHours', minutes / 60)
  return t.n('task.remindBefore', minutes / 1440)
}

// --------------------------------------------------------------- the account

/** What the section says about the account, one line per state. */
const NOTES = {
  unconfigured: 'gcal.unconfigured',
  'signed-out': 'gcal.signedOut',
  'needs-consent': 'gcal.needsConsent',
  ready: 'gcal.ready',
} as const

/** The account state, watched: connecting in one window redraws the other. */
function useGcalState(): GcalState {
  return useSyncExternalStore(onGcalState, getGcalState)
}

/**
 * Which of the four states the account is in, and the one control that state
 * deserves. `unconfigured` gets no button at all: there is nothing behind it.
 */
function GcalAccount({ state, t }: { state: GcalState; t: T }) {
  const [busy, setBusy] = useState(false)

  async function begin() {
    setBusy(true)
    try {
      await connect()
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="gacc">
      <span className="gacc__note">{t(NOTES[state])}</span>

      {state === 'signed-out' && (
        <button className="btn btn--primary" disabled={busy} onClick={() => void begin()}>
          {busy ? t('gcal.connecting') : t('gcal.connect')}
        </button>
      )}
      {state === 'needs-consent' && (
        <button className="btn btn--primary" disabled={busy} onClick={() => void begin()}>
          {busy ? t('gcal.connecting') : t('gcal.reconnect')}
        </button>
      )}
      {state === 'ready' && (
        <button className="btn" onClick={() => void disconnect()}>
          {t('gcal.disconnect')}
        </button>
      )}
    </div>
  )
}

// ------------------------------------------------------------------ the form

/**
 * The owner's calendars. `null` while the answer is on its way; an empty list
 * when Google would not give one, and then the picker falls back to the
 * calendar already chosen.
 */
function useCalendars(): Calendar[] | null {
  const [calendars, setCalendars] = useState<Calendar[] | null>(null)

  useEffect(() => {
    let alive = true
    listCalendars().then(
      (list) => alive && setCalendars(list),
      (err: unknown) => {
        console.error('[gcal] calendars', err)
        if (alive) setCalendars([])
      },
    )
    return () => {
      alive = false
    }
  }, [])

  return calendars
}

/**
 * The four things an event is: the hours it runs, a calendar, a colour and its
 * reminders.
 *
 * The hours come in and go out on their own, apart from the terms around them.
 * The two places this form stands keep them in different homes — the workspace
 * writes its defaults, a task writes its own frame — and one clock has to reach
 * whichever of the two is holding it.
 */
function GcalForm({
  value,
  onChange,
  times,
  onTimes,
  t,
}: {
  value: GcalConfig
  onChange: (next: GcalConfig) => void
  /** The hours as the form shows them; an empty end is none at all. */
  times: { start: string; end: string }
  onTimes: (start: string, end: string) => void
  t: T
}) {
  const calendars = useCalendars()
  const list = calendars ?? []
  // Terms saved before the main calendar was called `primary` name it by the
  // account's address. It is the same calendar, so it is shown as that one
  // entry rather than as a second, unnamed one beside it.
  const chosen = list.find((c) => c.listedAs === value.calendar_id)?.id ?? value.calendar_id
  // A calendar Google did not list — it is still what the event is set to, and
  // drawing the picker without it would quietly move the event somewhere else.
  const missing = !list.some((c) => c.id === chosen)

  function setReminder(i: number, patch: Partial<GcalReminder>) {
    onChange({
      ...value,
      reminders: value.reminders.map((r, j) => (i === j ? { ...r, ...patch } : r)),
    })
  }

  return (
    <div className="gform">
      <div className="gform__pair">
        <div className="gform__field">
          <span className="gform__label">{t('gcal.time')}</span>
          <div className="gform__times">
            <input
              className="field"
              type="time"
              aria-label={t('task.timeStart')}
              value={times.start}
              // An end is measured from the start, so it goes when the start does.
              onChange={(e) => {
                const start = e.target.value.slice(0, 5)
                onTimes(start, start === '' ? '' : times.end)
              }}
            />
            <input
              className="field"
              type="time"
              aria-label={t('task.timeEnd')}
              value={times.end}
              disabled={times.start === ''}
              onChange={(e) => onTimes(times.start, e.target.value.slice(0, 5))}
            />
          </div>
        </div>

        <label className="gform__field">
          <span className="gform__label">{t('gcal.calendar')}</span>
          <select
            className="field"
            value={chosen}
            onChange={(e) => onChange({ ...value, calendar_id: e.target.value })}
          >
            {missing && (
              <option value={chosen}>
                {chosen === 'primary' ? t('gcal.calendarPrimary') : chosen}
              </option>
            )}
            {list.map((c) => (
              <option key={c.id} value={c.id}>
                {/* Google names the main calendar after the account's address.
                    It is the one this app writes to unless it is told otherwise,
                    and it is called the same here wherever it is drawn from. */}
                {c.primary ? t('gcal.calendarPrimary') : c.summary}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="gform__field">
        <span className="gform__label">{t('gcal.color')}</span>
        <div className="gform__colors">
          <button
            className={`gform__swatch gform__swatch--none${
              value.color_id === null ? ' gform__swatch--on' : ''
            }`}
            onClick={() => onChange({ ...value, color_id: null })}
            aria-label={t('gcal.colorDefault')}
            title={t('gcal.colorDefault')}
          />
          {COLORS.map((c) => (
            <button
              key={c.id}
              className={`gform__swatch${value.color_id === c.id ? ' gform__swatch--on' : ''}`}
              style={{ background: c.hex }}
              onClick={() => onChange({ ...value, color_id: c.id })}
              aria-label={t(c.name)}
              title={t(c.name)}
            />
          ))}
        </div>
      </div>

      <div className="gform__field">
        <span className="gform__label">{t('gcal.reminders')}</span>

        {value.reminders.map((r, i) => (
          <div key={i} className="gform__rem">
            <select
              className="field"
              value={r.minutes}
              onChange={(e) => setReminder(i, { minutes: Number(e.target.value) })}
            >
              {/* A value some other client wrote still has to be shown as it is. */}
              {[...new Set([...OFFSETS, r.minutes])]
                .sort((a, b) => a - b)
                .map((m) => (
                  <option key={m} value={m}>
                    {offsetLabel(t, m)}
                  </option>
                ))}
            </select>

            <select
              className="field"
              value={r.method}
              onChange={(e) =>
                setReminder(i, { method: e.target.value as GcalReminder['method'] })
              }
            >
              <option value="popup">{t('gcal.popup')}</option>
              <option value="email">{t('gcal.email')}</option>
            </select>

            <button
              className="btn btn--quiet gform__del"
              onClick={() =>
                onChange({ ...value, reminders: value.reminders.filter((_, j) => j !== i) })
              }
              aria-label={t('gcal.removeReminder')}
            >
              ✕
            </button>
          </div>
        ))}

        {value.reminders.length < MAX_REMINDERS && (
          <button
            className="btn btn--quiet gform__add"
            onClick={() => {
              const fresh: GcalReminder = { method: 'popup', minutes: 30 }
              onChange({ ...value, reminders: [...value.reminders, fresh] })
            }}
          >
            {t('gcal.addReminder')}
          </button>
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------- the window

/**
 * The event's settings, over the task card. Nothing is written until he saves:
 * an event made by a stray click is a notification nobody asked for.
 *
 * With no account there is no form to show, so the connect button stands where
 * it would have been — a tick has to lead somewhere.
 */
export function GcalEventDialog({
  task,
  current,
  following,
  workspace,
  onClose,
  t,
}: {
  task: Task
  current: GcalConfig | null
  /** The task has no terms of its own and rides the workspace's whole sync. */
  following: boolean
  workspace: Workspace | null
  onClose: () => void
  t: T
}) {
  const state = useGcalState()
  // A first tick starts from the workspace's own terms, if it has any.
  const terms = current ?? defaultsOf(workspace)
  const [draft, setDraft] = useState<GcalConfig>(terms)
  // The terms the form opened on, kept to tell an edit from a look.
  const seeded = useRef(draft)
  /*
   * The hours the window opens on are the hours the event actually stands at:
   * the task's own frame where it has one, and the terms' default where it has
   * none. The pair writes the task, not the terms — the same frame the card
   * sets from the other side, and there is one of it.
   */
  const [frame, setFrame] = useState(() => ({
    start: task.start_time ?? terms.time,
    end: task.start_time !== null ? (task.end_time ?? '') : (terms.end ?? ''),
  }))
  const seededFrame = useRef(frame)
  useEscape(onClose)

  async function save() {
    const framed =
      frame.start !== seededFrame.current.start || frame.end !== seededFrame.current.end
    /*
     * A task riding the workspace's switch is shown the workspace's terms and
     * owns none of them. Writing them back as they stood would hand it a copy,
     * and a copy stops hearing the workspace — silently, and for good. So a look
     * closes and only a real difference is written.
     */
    const termed = !(following && same(draft, seeded.current))
    if (!framed && !termed) return onClose()
    /*
     * A window opened and closed writes no frame: the hours it showed are the
     * ones the task would have kept anyway, and it goes on taking them from
     * wherever it was taking them.
     *
     * A clock the owner did move hands the task the whole frame, its start
     * included — moving only the end writes the start as the window showed it,
     * which is the terms' hour. Half a frame is not one: an end alone is never
     * written, so an end given to a task is the pair, and from that moment the
     * hours are the task's own, said under its title on the card. A frame is
     * the task's data and not its terms, though, so writing one leaves it under
     * the workspace's switch — `same` above knows nothing of these two fields.
     */
    if (framed) {
      await updateTask(task.id, {
        /*
         * Emptying the start here is how a frame comes off a task again: the
         * pair goes, and the event falls back to the hour the terms carry — the
         * hour the window shows in the field when it is opened next. This is
         * where a task parts from the defaults below, which guard their empty
         * start as someone mid-edit: terms have to name an hour for the tasks
         * that carry no frame, a task has nothing to name one for.
         */
        start_time: frame.start === '' ? null : frame.start,
        end_time: frame.start === '' || frame.end === '' ? null : frame.end,
      })
    }
    if (termed) await setTaskGcal(task.id, draft)
    // The reconciler would get there within the minute; he is looking now.
    void reconcile()
    onClose()
  }

  return (
    <div className="gwin__scrim" onMouseDown={onClose}>
      <div className="gwin" onMouseDown={(e) => e.stopPropagation()}>
        <div className="gwin__head">
          <span className="gwin__title">{t('gcal.event')}</span>
          <button className="btn btn--quiet gwin__close" onClick={onClose}>
            ✕
          </button>
        </div>

        {state === 'ready' ? (
          <>
            <GcalForm
              value={draft}
              onChange={setDraft}
              times={frame}
              onTimes={(start, end) => setFrame({ start, end })}
              t={t}
            />
            <div className="gwin__foot">
              <button className="btn btn--primary" onClick={() => void save()}>
                {t('common.save')}
              </button>
            </div>
          </>
        ) : (
          <GcalAccount state={state} t={t} />
        )}
      </div>
    </div>
  )
}

// --------------------------------------------------------------- the section

/**
 * The settings window's section: the account, then the defaults this workspace
 * hands out. They belong to the workspace and not to the app, so the section
 * says which workspace it is configuring — the window opens over any of them.
 */
export function GcalSection({ workspace, t }: { workspace: Workspace | null; t: T }) {
  const state = useGcalState()

  return (
    <div className="gsec">
      <GcalAccount state={state} t={t} />

      {state === 'ready' && workspace && (
        /*
         * Keyed by the workspace: the defaults are held as a draft, and the
         * remount is what hands the one left behind its last edit before the
         * next one's fields are drawn.
         */
        <GcalDefaults key={workspace.id} workspace={workspace} t={t} />
      )}
    </div>
  )
}

/**
 * The defaults one workspace hands out, and the switch that puts all its tasks
 * on them.
 *
 * The form holds a draft of its own, exactly as the event's window does. Drawn
 * straight from the stored value while the write waits out its pause, every key
 * was taken back before the next one landed: «Время» could not be typed into at
 * all, and two clicks within half a second added one reminder.
 */
function GcalDefaults({ workspace, t }: { workspace: Workspace; t: T }) {
  const stored = defaultsOf(workspace)
  const [draft, setDraft] = useState<GcalConfig>(stored)
  const current = useRef(draft)
  const synced = useRef(stored)
  const dirty = useRef(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  /*
   * The pause before a write, so that one setting of an hour is one dirty row
   * and one push rather than a handful of each — the same half second every
   * other field in the app takes.
   */
  const flush = useCallback(() => {
    if (timer.current !== null) {
      clearTimeout(timer.current)
      timer.current = null
    }
    if (!dirty.current) return
    dirty.current = false
    synced.current = current.current
    void setWorkspaceGcal(workspace.id, { gcal: current.current })
  }, [workspace.id])

  function edit(next: GcalConfig) {
    current.current = next
    setDraft(next)
    dirty.current = true
    if (timer.current !== null) clearTimeout(timer.current)
    timer.current = setTimeout(flush, SAVE_DELAY)
  }

  // An edit arriving from the other device is taken only while nothing local is
  // waiting to be written; otherwise it would pull the field out from under him.
  useEffect(() => {
    if (stored === synced.current) return
    synced.current = stored
    if (dirty.current) return
    current.current = stored
    setDraft(stored)
  }, [stored])

  // Leaving the section, or closing the window, within the pause: the edit goes
  // in rather than away with the form.
  useEffect(() => flush, [flush])

  async function syncWhole(on: boolean) {
    // The switch is not a draft: whatever the form is holding goes in with it.
    if (timer.current !== null) {
      clearTimeout(timer.current)
      timer.current = null
    }
    dirty.current = false
    synced.current = current.current
    // The defaults go in with the switch: they are the terms every task it
    // touches is put into the calendar on, so they cannot stay unwritten.
    await setWorkspaceGcal(workspace.id, { gcal_sync: on, gcal: current.current })
    // The tick itself is the answer. Counting what it caught would be a third
    // indicator, and one that speaks before the calendar has been told anything.
    void reconcile()
  }

  return (
    <>
      <div className="gsec__for">{t('gcal.defaults', { name: workspace.name })}</div>

      <GcalForm
        value={draft}
        onChange={edit}
        times={{ start: draft.time, end: draft.end ?? '' }}
        onTimes={(start, end) => {
          // An empty start is someone mid-edit, not a wish for no time at all:
          // these terms have to name an hour, since a task carrying no frame of
          // its own is put into the calendar at it.
          if (start === '') return
          edit({ ...draft, time: start, end: end === '' ? null : end })
        }}
        t={t}
      />

      <label className="gsec__whole">
        <input
          type="checkbox"
          checked={workspace.gcal_sync === true}
          onChange={(e) => void syncWhole(e.target.checked)}
        />
        <span>{t('gcal.workspaceSync')}</span>
      </label>
    </>
  )
}
