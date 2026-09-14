import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { renderMarkdown } from '../lib/markdown'
import { SAVE_DELAY, useAutosave } from '../lib/useAutosave'
import { useEscape } from '../lib/useEscape'
import { useWhole, wholeDate, wholeTime } from '../lib/useWhole'
import { Confirm } from './Confirm'
import {
  createLabel,
  createNote,
  deleteLabel,
  deleteTask,
  setTaskGcal,
  updateLabel,
  updateTask,
} from '../db/api'
import { useNotes, useTask } from '../db/hooks'
import { reconcile } from '../gcal/sync'
import { GcalEventDialog } from './Gcal'
import { useT, type T } from '../i18n'
import {
  gcalConfigOf,
  LABEL_COLORS,
  taskDate,
  type CustomField,
  type ID,
  type Label,
  type LabelColor,
  type Note,
  type Task,
  type Workspace,
} from '../db/types'
import './TaskDialog.css'

interface Props {
  taskId: ID
  workspaceId: ID
  /** The workspace the task belongs to — it carries the calendar defaults. */
  workspace: Workspace | null
  labels: Label[]
  /** Switches to the notes tab and opens the attached note. */
  onOpenNote: (id: ID) => void
  onClose: () => void
}

/** The whole task card: title, description, dates, labels, custom fields. */
export function TaskDialog({
  taskId,
  workspaceId,
  workspace,
  labels,
  onOpenNote,
  onClose,
}: Props) {
  const task = useTask(taskId)
  const [preview, setPreview] = useState(false)
  const [eventOpen, setEventOpen] = useState(false)

  /*
   * Escape belongs to the topmost window. With the event's settings open it is
   * theirs, and the card stays where it is — but the settings are drawn only
   * while the task has a date at all, and a date cleared on the other device
   * would otherwise leave Escape answering a window that is no longer there.
   */
  const eventShown = eventOpen && task != null && taskDate(task) !== null
  useEscape(
    useCallback(() => {
      if (!eventShown) onClose()
    }, [eventShown, onClose]),
  )

  // The task may have been deleted on another device while this dialog was open.
  // `undefined` means the database has not answered yet, `null` means it is really gone.
  useEffect(() => {
    if (task === null) onClose()
  }, [task, onClose])

  if (!task) return null

  return (
    <div className="dialog__scrim" onMouseDown={onClose}>
      <div className="dialog" onMouseDown={(e) => e.stopPropagation()}>
        <Body
          key={task.id}
          task={task}
          workspaceId={workspaceId}
          workspace={workspace}
          labels={labels}
          preview={preview}
          onSetPreview={setPreview}
          eventOpen={eventOpen}
          onSetEventOpen={setEventOpen}
          onOpenNote={onOpenNote}
          onClose={onClose}
        />
      </div>
    </div>
  )
}

function Body({
  task,
  workspaceId,
  workspace,
  labels,
  preview,
  onSetPreview,
  eventOpen,
  onSetEventOpen,
  onOpenNote,
  onClose,
}: {
  task: NonNullable<ReturnType<typeof useTask>>
  workspaceId: ID
  workspace: Workspace | null
  labels: Label[]
  preview: boolean
  onSetPreview: (v: boolean) => void
  eventOpen: boolean
  onSetEventOpen: (v: boolean) => void
  onOpenNote: (id: ID) => void
  onClose: () => void
}) {
  const id = task.id
  const t = useT()
  const patch = useCallback(
    (p: Parameters<typeof updateTask>[1]) => void updateTask(id, p),
    [id],
  )

  // Title and description are saved on a delay: writing on every keystroke lost
  // characters — the field value comes back from the database asynchronously and
  // would roll back what had already been typed.
  const [title, setTitle] = useAutosave(task.title, (v) => patch({ title: v }))
  const [description, setDescription] = useAutosave(task.description, (v) =>
    patch({ description: v }),
  )

  const [asking, setAsking] = useState(false)

  const html = useMemo(() => (preview ? renderMarkdown(description) : ''), [preview, description])

  /*
   * The four fields that are typed into segment by segment. They hold their own
   * text and hand the task a date or an hour only once it is whole — see
   * useWhole — so a half-typed value never travels out and comes back.
   */
  const startDate = useWhole(task.start_date ?? '', wholeDate, (v) => patch({ start_date: v }))
  const dueDate = useWhole(task.due_date ?? '', wholeDate, (v) => patch({ due_date: v }))
  const startTime = useWhole(task.start_time ?? '', wholeTime, (v) =>
    // An end is a length measured from the start. Clearing the start leaves
    // nothing to measure it from, so it goes with it.
    patch(v === null ? { start_time: null, end_time: null } : { start_time: v }),
  )
  const endTime = useWhole(task.end_time ?? '', wholeTime, (v) => patch({ end_time: v }))

  async function remove() {
    setAsking(false)
    await deleteTask(task.id)
    onClose()
  }

  /*
   * The title comes first: on the desk it leads the card it names, with the
   * close beside it and «Готово» under it. The phone draws the head row above
   * it instead, where the thumb reaches both — see TaskDialog.css.
   */
  return (
    <>
      <input
        className="dialog__title"
        value={title}
        placeholder={t('task.title')}
        onChange={(e) => setTitle(e.target.value)}
      />

      <div className="dialog__head">
        <label className="dialog__done">
          <input
            type="checkbox"
            checked={task.done}
            onChange={(e) => patch({ done: e.target.checked })}
          />
          <span>{t('common.done')}</span>
        </label>
        <button className="btn btn--quiet dialog__close" onClick={onClose}>
          ✕
        </button>
      </div>

      <div className="dialog__dates">
        <Field label={t('task.start')}>
          <input
            className="field"
            type="date"
            min="1970-01-01"
            max="2999-12-31"
            {...startDate}
          />
        </Field>
        <Field label={t('task.due')}>
          <input
            className="field"
            type="date"
            min="1970-01-01"
            max="2999-12-31"
            {...dueDate}
          />
        </Field>
        <Field label={t('task.remind')}>
          <select
            className="field"
            value={task.remind_days_before ?? ''}
            onChange={(e) =>
              patch({ remind_days_before: e.target.value === '' ? null : Number(e.target.value) })
            }
            disabled={!task.due_date && !task.start_date}
          >
            <option value="">{t('task.remindNever')}</option>
            {[1, 2, 3, 7, 14, 30].map((n) => (
              <option key={n} value={n}>
                {t.n('task.remindBefore', n)}
              </option>
            ))}
          </select>
        </Field>
      </div>

      {/*
        The hours beside the days, and under them. A day says which column the
        task stands in; the frame says how long that day's work runs, and the
        calendar event is made on it. The end waits for a start: it is measured
        from one, and on its own it says nothing.
      */}
      <Field label={t('task.time')}>
        <div className="dialog__time">
          <input
            className="field"
            type="time"
            aria-label={t('task.timeStart')}
            {...startTime}
          />
          <input
            className="field"
            type="time"
            aria-label={t('task.timeEnd')}
            disabled={task.start_time === null}
            {...endTime}
          />
        </div>
      </Field>

      {/*
        Separate from the select above. "Не напоминать" only drops the advance
        warning; a task due today or already overdue still shows up in the banner,
        because that is the whole point of a deadline tracker. This is the opt-out
        for the few tasks that should stay quiet regardless.
      */}
      <label className="dialog__mute">
        <input
          type="checkbox"
          checked={task.muted}
          onChange={(e) => patch({ muted: e.target.checked })}
        />
        <span>{t('task.mute')}</span>
      </label>

      <GcalRow
        task={task}
        workspace={workspace}
        open={eventOpen}
        onSetOpen={onSetEventOpen}
        t={t}
      />

      <NoteLink task={task} workspaceId={workspaceId} onOpenNote={onOpenNote} t={t} />

      <LabelPicker
        workspaceId={workspaceId}
        labels={labels}
        selected={task.label_ids}
        onChange={(label_ids) => patch({ label_ids })}
        t={t}
      />

      <Field
        label={t('task.description')}
        aside={
          <button className="dialog__link" onClick={() => onSetPreview(!preview)}>
            {preview ? t('md.edit') : t('md.preview')}
          </button>
        }
      >
        {preview ? (
          <div className="md dialog__markdown" dangerouslySetInnerHTML={{ __html: html }} />
        ) : (
          <textarea
            className="field dialog__textarea"
            value={description}
            placeholder={t('md.placeholder')}
            onChange={(e) => setDescription(e.target.value)}
          />
        )}
      </Field>

      <CustomFields
        fields={task.custom_fields}
        onChange={(custom_fields) => patch({ custom_fields })}
        t={t}
      />

      <div className="dialog__foot">
        <button className="btn btn--quiet btn--danger" onClick={() => setAsking(true)}>
          {t('task.delete')}
        </button>
      </div>

      {asking && (
        <Confirm
          question={t('task.confirmDelete', { name: task.title })}
          action={t('common.delete')}
          onCancel={() => setAsking(false)}
          onConfirm={() => void remove()}
        />
      )}
    </>
  )
}

function Field({
  label,
  aside,
  children,
}: {
  label: string
  aside?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <div className="dialog__field">
      <div className="dialog__field-head">
        <span className="dialog__field-label">{label}</span>
        {aside}
      </div>
      {children}
    </div>
  )
}

// ------------------------------------------------------------ google calendar

/**
 * The one way a task reaches the calendar. Ticking the box writes nothing — it
 * opens the event's settings, because an event made by a stray click is a
 * notification nobody asked for. Unticking takes the event away.
 *
 * An event is put on the deadline, so a task without one cannot have it. The
 * line says that in place of a switch that would quietly do nothing.
 */
function GcalRow({
  task,
  workspace,
  open,
  onSetOpen,
  t,
}: {
  task: Task
  workspace: Workspace | null
  open: boolean
  onSetOpen: (v: boolean) => void
  t: T
}) {
  // An event is made on the task's date — its deadline, or its start when it has
  // no deadline — so a task with neither has nothing to offer here. Nothing is
  // drawn rather than explained: the row appears the moment a date does.
  if (!taskDate(task)) return null

  /*
   * Ticked when this task has an event, whatever put it there. A workspace that
   * syncs whole covers its tasks without writing anything on them, so reading
   * the task's own settings alone showed an unticked box beside an event that
   * existed — and unticking it offered to make a second one.
   */
  const whole = workspace?.gcal_sync === true && workspace.gcal !== null
  const byWorkspace = task.gcal === null && whole
  const own = gcalConfigOf(task.gcal)
  const on = own !== null || byWorkspace

  const optedOut = whole && task.gcal !== null && own === null

  function toggle(next: boolean) {
    /*
     * Ticked again inside a workspace that syncs whole, a task that had been
     * taken out of it goes back under the workspace's terms rather than being
     * handed a copy of them: a copy stops hearing the workspace, and there would
     * be no way left to put the task back under it.
     */
    if (next && optedOut) return void setTaskGcal(task.id, null).then(reconcile)
    if (next) return onSetOpen(true)
    /*
     * Off is a decision, not a draft, so the event goes now rather than on the
     * next tick. Inside a workspace that syncs whole it has to be said out loud,
     * and by a task that had terms of its own just as much as by one that had
     * none: clearing terms only drops the task back under the workspace's, which
     * ticks the box again and rewrites the event on its terms.
     */
    void setTaskGcal(task.id, whole ? { off: true } : null).then(reconcile)
  }

  return (
    <>
      <div className="dialog__gcal">
        <label className="dialog__gcal-label">
          <input type="checkbox" checked={on} onChange={(e) => toggle(e.target.checked)} />
          <span>{t('gcal.sync')}</span>
        </label>
        {on && (
          <button className="dialog__link" onClick={() => onSetOpen(true)}>
            {t('gcal.edit')}
          </button>
        )}
      </div>

      {open && (
        <GcalEventDialog
          task={task}
          current={own}
          following={byWorkspace}
          workspace={workspace}
          onClose={() => onSetOpen(false)}
          t={t}
        />
      )}
    </>
  )
}

// ----------------------------------------------------------------------- note

/**
 * A note attached to the task. One-way: the task points at the note, the note
 * knows nothing about the task. Deleting the note clears the link rather than
 * leaving a dead one behind.
 */
function NoteLink({
  task,
  workspaceId,
  onOpenNote,
  t,
}: {
  task: { id: ID; title: string; note_id: ID | null }
  workspaceId: ID
  onOpenNote: (id: ID) => void
  t: T
}) {
  const notes = useNotes(workspaceId)
  const [picking, setPicking] = useState(false)

  // Folders hold no text, so only files can be attached.
  const files = (notes ?? []).filter((n: Note) => n.kind === 'file')
  const linked = task.note_id ? (files.find((n) => n.id === task.note_id) ?? null) : null

  async function create() {
    const id = await createNote(workspaceId, 'file', null, task.title)
    await updateTask(task.id, { note_id: id })
    setPicking(false)
  }

  return (
    <div className="dialog__field">
      <div className="dialog__field-head">
        <span className="dialog__field-label">{t('task.note')}</span>
        {linked && (
          <button
            className="dialog__link"
            onClick={() => void updateTask(task.id, { note_id: null })}
          >
            {t('task.noteUnlink')}
          </button>
        )}
      </div>

      {linked ? (
        <button className="notelink" onClick={() => onOpenNote(linked.id)}>
          <span className="notelink__icon">📄</span>
          <span className="notelink__name">{linked.name.trim() || t('common.untitled')}</span>
          <span className="dialog__link">{t('task.noteOpen')}</span>
        </button>
      ) : picking ? (
        <div className="notelink__pick">
          <select
            className="field"
            defaultValue=""
            autoFocus
            onChange={(e) => {
              if (!e.target.value) return
              void updateTask(task.id, { note_id: e.target.value })
              setPicking(false)
            }}
          >
            <option value="">{t('task.notePick')}</option>
            {files.map((n) => (
              <option key={n.id} value={n.id}>
                {n.name.trim() || t('common.untitled')}
              </option>
            ))}
          </select>
          <button className="btn" onClick={() => void create()}>
            {t('common.create')}
          </button>
          <button className="btn btn--quiet" onClick={() => setPicking(false)}>
            {t('common.cancel')}
          </button>
        </div>
      ) : (
        <button className="btn btn--quiet notelink__add" onClick={() => setPicking(true)}>
          {t('task.noteAttach')}
        </button>
      )}
    </div>
  )
}

// --------------------------------------------------------------------- labels

type LabelMode = 'pick' | 'new' | 'manage'

function LabelPicker({
  workspaceId,
  labels,
  selected,
  onChange,
  t,
}: {
  workspaceId: ID
  labels: Label[]
  selected: ID[]
  onChange: (ids: ID[]) => void
  t: T
}) {
  const [mode, setMode] = useState<LabelMode>('pick')
  const [name, setName] = useState('')
  const [color, setColor] = useState<LabelColor>('blue')

  async function add() {
    if (!name.trim()) return
    const id = await createLabel(workspaceId, name, color)
    onChange([...selected, id])
    setName('')
    setMode('pick')
  }

  function toggle(id: ID) {
    onChange(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id])
  }

  const [asking, setAsking] = useState<Label | null>(null)

  return (
    <div className="dialog__field">
      <div className="dialog__field-head">
        <span className="dialog__field-label">{t('label.plural')}</span>
        <span className="dialog__links">
          {labels.length > 0 && (
            <button
              className="dialog__link"
              onClick={() => setMode(mode === 'manage' ? 'pick' : 'manage')}
            >
              {mode === 'manage' ? t('common.done') : t('label.manage')}
            </button>
          )}
          <button
            className="dialog__link"
            onClick={() => setMode(mode === 'new' ? 'pick' : 'new')}
          >
            {mode === 'new' ? t('common.cancel') : t('label.new')}
          </button>
        </span>
      </div>

      {mode === 'manage' ? (
        <div className="labels__manage">
          {labels.map((label) => (
            <LabelRow key={label.id} label={label} onRemove={() => setAsking(label)} t={t} />
          ))}
        </div>
      ) : (
        <div className="labels">
          {labels.map((label) => (
            <button
              key={label.id}
              className={`labels__pill${selected.includes(label.id) ? ' labels__pill--on' : ''}`}
              style={{ '--pill': `var(--label-${label.color})` } as React.CSSProperties}
              onClick={() => toggle(label.id)}
            >
              {label.name}
            </button>
          ))}
        </div>
      )}

      {mode === 'new' && (
        <div className="labels__new">
          <ColorPicker value={color} onChange={setColor} />
          <input
            className="field"
            value={name}
            placeholder={t('label.name')}
            autoFocus
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && void add()}
          />
          <button className="btn btn--primary" onClick={() => void add()}>
            {t('common.add')}
          </button>
        </div>
      )}

      {asking && (
        <Confirm
          question={t('label.confirmDelete', { name: asking.name })}
          action={t('common.delete')}
          onCancel={() => setAsking(null)}
          onConfirm={() => {
            const id = asking.id
            setAsking(null)
            void deleteLabel(id)
          }}
        />
      )}
    </div>
  )
}

function LabelRow({ label, onRemove, t }: { label: Label; onRemove: () => void; t: T }) {
  const [name, setName] = useAutosave(label.name, (v) => {
    if (v.trim()) void updateLabel(label.id, { name: v.trim() })
  })

  return (
    <div className="labels__row">
      <ColorPicker
        value={label.color}
        onChange={(color) => void updateLabel(label.id, { color })}
      />
      <input className="field" value={name} onChange={(e) => setName(e.target.value)} />
      <button className="btn btn--quiet labels__del" onClick={onRemove} aria-label={t('label.delete')}>
        ✕
      </button>
    </div>
  )
}

function ColorPicker({
  value,
  onChange,
}: {
  value: LabelColor
  onChange: (c: LabelColor) => void
}) {
  return (
    <div className="labels__colors">
      {LABEL_COLORS.map((c) => (
        <button
          key={c}
          className={`labels__swatch${c === value ? ' labels__swatch--on' : ''}`}
          style={{ background: `var(--label-${c})` }}
          onClick={() => onChange(c)}
          aria-label={c}
        />
      ))}
    </div>
  )
}

// --------------------------------------------------------------- custom fields

/*
 * A custom field is a field of the card like «Начало» or «Дедлайн»: its name is
 * the small-caps label those carry, its value the same plain input. It used to
 * be a bordered box holding two inputs, which said the opposite — that the name
 * was a second thing to fill in, and the pair something bolted on beside the
 * real fields. The name turns back into an input only while it is being named.
 */

function CustomFields({
  fields,
  onChange,
  t,
}: {
  fields: CustomField[]
  onChange: (f: CustomField[]) => void
  t: T
}) {
  /*
   * Every row writes the whole list back, and each of them builds it from this
   * one copy rather than from the `fields` it was rendered with. Closing the
   * card flushes all the waiting rows in the same moment, before any of their
   * writes has come back around — each row rebuilt the list from the same stale
   * copy, and the last one put the others' text back to what it had been.
   */
  const latest = useRef(fields)
  useEffect(() => {
    latest.current = fields
  }, [fields])

  const write = useCallback(
    (next: CustomField[]) => {
      latest.current = next
      onChange(next)
    },
    [onChange],
  )

  // Rows written before ids existed get one now, so editing state cannot follow
  // the wrong row after a deletion.
  const missingIds = fields.some((f) => !f.id)
  useEffect(() => {
    if (missingIds) write(fields.map((f) => (f.id ? f : { ...f, id: crypto.randomUUID() })))
  }, [missingIds, fields, write])

  function add() {
    write([...latest.current, { id: crypto.randomUUID(), name: '', value: '' }])
  }

  return (
    <div className="dialog__field">
      <div className="dialog__field-head">
        <span className="dialog__field-label">{t('task.fields')}</span>
        <button className="dialog__link" onClick={add}>
          {t('common.add')}
        </button>
      </div>

      {fields.map((field, i) => (
        <CustomFieldRow
          key={field.id ?? i}
          field={field}
          autoFocus={field.name === '' && field.value === ''}
          onChange={(next) => write(latest.current.map((f, j) => (i === j ? next : f)))}
          onRemove={() => write(latest.current.filter((_, j) => j !== i))}
          t={t}
        />
      ))}
    </div>
  )
}

function CustomFieldRow({
  field,
  autoFocus,
  onChange,
  onRemove,
  t,
}: {
  field: CustomField
  autoFocus: boolean
  onChange: (f: CustomField) => void
  onRemove: () => void
  t: T
}) {
  const [draft, setDraft] = useState(field)
  const current = useRef(field)
  const synced = useRef(field)
  const dirty = useRef(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const changeRef = useRef(onChange)
  useEffect(() => {
    changeRef.current = onChange
  })

  /*
   * The whole row is written at once, not one input at a time.
   * Both inputs live in the same object, so two independent debounced writes
   * would each send a copy built from whatever they captured — and the later
   * one would put the other's field back to its old value.
   */
  const flush = useCallback(() => {
    if (timer.current !== null) {
      clearTimeout(timer.current)
      timer.current = null
    }
    if (!dirty.current) return
    dirty.current = false
    synced.current = current.current
    changeRef.current(current.current)
  }, [])

  function edit(part: Partial<CustomField>) {
    const next = { ...current.current, ...part }
    current.current = next
    setDraft(next)
    dirty.current = true
    if (timer.current !== null) clearTimeout(timer.current)
    timer.current = setTimeout(flush, SAVE_DELAY)
  }

  // An edit arriving from another device is taken only while nothing local is
  // waiting to be written; otherwise it would yank the text from under the caret.
  useEffect(() => {
    if (field.name === synced.current.name && field.value === synced.current.value) return
    synced.current = field
    if (dirty.current) return
    current.current = field
    setDraft(field)
  }, [field])

  useEffect(() => flush, [flush])

  /*
   * Removing the row unmounts it, and the unmount writes whatever was still
   * waiting in the debounce — through a callback the parent built before the
   * removal, which rebuilds the array with this row back in it. Dropping the
   * pending write first is what makes the removal stick.
   */
  function remove() {
    if (timer.current !== null) {
      clearTimeout(timer.current)
      timer.current = null
    }
    dirty.current = false
    onRemove()
  }

  /*
   * The name is a button carrying the label, so it can be reached with the
   * keyboard as well as with a click — a name that only a pointer can change is
   * a name a phone cannot fix. A field just added opens straight into naming:
   * an unnamed field says nothing about its value.
   */
  const [naming, setNaming] = useState(autoFocus)

  return (
    <div className="dialog__field">
      <div className="dialog__field-head">
        {naming ? (
          <input
            className="dialog__field-label cfield__name"
            value={draft.name}
            placeholder={t('task.fieldName')}
            autoFocus
            onChange={(e) => edit({ name: e.target.value })}
            onBlur={() => setNaming(false)}
            onKeyDown={(e) => e.key === 'Enter' && setNaming(false)}
          />
        ) : (
          <button className="dialog__field-label cfield__name" onClick={() => setNaming(true)}>
            {draft.name.trim() || t('task.fieldName')}
          </button>
        )}
        <button className="cfield__del" onClick={remove} aria-label={t('task.fieldDelete')}>
          ✕
        </button>
      </div>

      <input
        className="field"
        value={draft.value}
        placeholder={t('task.fieldValue')}
        onChange={(e) => edit({ value: e.target.value })}
      />
    </div>
  )
}
