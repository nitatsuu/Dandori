/*
 * Keeping the calendar in step with the tasks.
 *
 * Nothing here hooks the places a task is written. The same reconciliation runs
 * over everything on a tick: work out what each task's event should be, compare
 * it with what was last sent, and send the difference. A card dragged to another
 * day, a title edited on the phone, a task ticked off — all of them are the same
 * question asked again, and none of them needs its own call site.
 *
 * What was last sent lives in the local `meta` table, not on the task: it is
 * this device's memory of its own traffic. Syncing it would only teach the phone
 * to skip work the laptop had already done, and that work is one idempotent
 * write it can well afford to repeat.
 */
import { db, setMeta } from '../db/local'
import { setTaskGcal } from '../db/api'
import { currentSession, requestPush } from '../sync/sync'
import {
  currentZone,
  deletedSince,
  deleteEvent,
  eventIdOf,
  eventWindow,
  GcalError,
  putEvent,
} from './api'
import { getToken, isConnected } from './client'
import {
  GCAL_COLOR_OF,
  gcalConfigOf,
  taskDate,
  type GcalConfig,
  type ID,
  type Label,
  type Task,
  type Workspace,
} from '../db/types'

/** How often the whole set is looked over, when nothing else prompts it. */
const TICK_MS = 60_000
/** After a refusal that is not the owner's fault, wait before trying again. */
const BACKOFF_MS = 5 * 60_000

const KEY_PREFIX = 'gcal:'
const sentKey = (taskId: ID) => `${KEY_PREFIX}${taskId}`
/*
 * When each calendar was last asked what had gone from it. A prefix of its own,
 * outside the one the sent notes are read by: these rows are a time, not a note,
 * and a reader that took them for one would have to guess which is which.
 */
const SEEN_PREFIX = 'gcal-seen:'
const seenKey = (calendarId: string) => `${SEEN_PREFIX}${calendarId}`
/** A minute of overlap on every question, so a clock slightly out misses nothing. */
const SEEN_MARGIN_MS = 60_000
/*
 * How far back the first question about a calendar reaches. A device that has
 * never asked knows nothing about what was deleted while it was shut, and the
 * answer carries each event's state as it stands now — so an event deleted and
 * since rewritten comes back confirmed, and only a deletion still standing is
 * read as one. Before this the first sight of a calendar was spent learning
 * where to read from next time, and a month of the app being closed was a month
 * of deletions nobody ever heard about.
 *
 * How far back a calendar will answer is its own affair, and a month is past it
 * on some: Google refuses the question outright rather than answering it short.
 * A refusal is not an error, then — it is the calendar saying it does not
 * remember, and the only thing to do with it is to start remembering from here.
 */
const FIRST_LOOK_MS = 30 * 24 * 60 * 60_000
/** What Google calls a window reaching further back than the calendar keeps. */
const TOO_LONG_AGO = 'updatedMinTooLongAgo'

/*
 * The parts of the signature are joined on a NUL rather than a space: a title
 * can hold anything, and two fields running together must not be able to look
 * like one. Written as an escape — a raw NUL in the source turns the file
 * binary, and git stops diffing it while grep stops searching it, silently.
 */
const SEP = '\u0000'

/** What this device last put in the calendar for one task. */
interface Sent {
  /**
   * The calendar it went into. The task carries that as well, and the task's is
   * the record that travels between devices; this copy is what the pass falls
   * back on when the task's has been lost — see `placed`.
   */
  cal: string
  /** Everything about the event that could change, flattened into one string. */
  sig: string
}

/** This device's memory of its own traffic, read once for the whole pass. */
async function sentNotes(): Promise<Map<ID, Sent>> {
  const notes = new Map<ID, Sent>()
  for (const row of await db.meta.toArray()) {
    if (!row.key.startsWith(KEY_PREFIX)) continue
    try {
      notes.set(row.key.slice(KEY_PREFIX.length), JSON.parse(row.value) as Sent)
    } catch {
      // Unreadable: this pass simply does not know about that one, and the
      // task's own record still does.
    }
  }
  return notes
}

function signature(task: Task, cfg: GcalConfig): string {
  const reminders = cfg.reminders.map((r) => `${r.method}:${r.minutes}`).join(',')
  const { start, end } = eventWindow(task, cfg)
  return [
    task.title,
    task.description,
    // The two ends of the event as they will be written, rather than the dates
    // and times they are worked out from. Everything that can move them reaches
    // the calendar through these two — a card dragged to another day, a frame
    // set on the task, a default end changed in the terms — and the day among
    // them is `taskDate`'s, so a task moved by its start date is rewritten onto
    // the day it moved to instead of keeping the one it was first given.
    start,
    end,
    cfg.color_id ?? '',
    reminders,
    // The event is written in the zone of whichever device wrote it. Leave it
    // out of the signature and it freezes at that device's while every other
    // field goes on being brought up to date.
    currentZone(),
  ].join(SEP)
}

/*
 * How a task's event should be made, or `null` if it should not exist.
 *
 * A task's own settings always win. Failing that, the workspace's switch stands
 * for every dated task in it — a standing arrangement rather than a one-off
 * stamp on each row: a task made tomorrow joins without being told, changing
 * the defaults changes them all, and turning the switch off takes the events
 * away again. A task the owner configured himself is never overwritten by it.
 */
function configFor(
  task: Task,
  workspace: Workspace | undefined,
  labels: Map<ID, Label>,
): GcalConfig | null {
  if (task.deleted || task.done || taskDate(task) === null) return null
  const own = task.gcal ? gcalConfigOf(task.gcal) : null
  const cfg = task.gcal ? own : workspace?.gcal_sync && workspace.gcal ? workspace.gcal : null
  if (!cfg) return null
  const color = colorOf(task, labels)
  return color === null ? cfg : { ...cfg, color_id: color }
}

/*
 * The colour the event takes: the task's first label's, in Google's palette.
 * The first is the one the card draws first, so a calendar and a board hold the
 * same colours in the same order. With no label the colour chosen in the window
 * stands — a workspace synced whole would otherwise arrive as one colour, which
 * is the one thing a calendar full of events cannot be read by.
 */
function colorOf(task: Task, labels: Map<ID, Label>): string | null {
  for (const id of task.label_ids) {
    const label = labels.get(id)
    // A colour from outside the palette — a row from a build that knew one this
    // one does not — leaves the event the colour that was picked for it.
    if (label) return GCAL_COLOR_OF[label.color] ?? null
  }
  return null
}

/*
 * Records which calendar the task's event stands in, `null` for none.
 *
 * Bookkeeping, not an edit: `updated_at` stays exactly where the owner's last
 * edit left it, so this row can never win a conflict against an edit made on
 * another device while it waited in the queue. And it asks to be sent at once
 * instead of waiting for the next cycle — until it lands it is the only record
 * that the event exists at all, and a sign-out here would take it away with the
 * cache.
 */
async function placed(taskId: ID, calendar: string | null): Promise<void> {
  // Read and written as one step, or an edit saved in between is put back.
  const changed = await db.transaction('rw', db.tasks, async () => {
    const row = await db.tasks.get(taskId)
    if (!row || row.gcal_placed === calendar) return false
    await db.tasks.put({ ...row, gcal_placed: calendar, _dirty: 1 })
    return true
  })
  if (changed) requestPush()
}

/*
 * The pass outlives a sign-out otherwise. Google answers slowly enough that a
 * pass started before it went on creating events after it — events whose
 * placement then had no row left to be written to — and wrote its notes, the
 * titles in them, into the database the next account opens. Checked before
 * every call to Google and every local write, like the sync's own exchange.
 */
class SignedOut extends Error {}

function still(mine: number): void {
  if (mine !== currentSession()) throw new SignedOut()
}

async function reconcileTask(
  task: Task,
  cfg: GcalConfig | null,
  sent: Sent | null,
  mine: number,
): Promise<void> {
  /*
   * Where the event stands, whoever put it there. Carrying no stamp of its own,
   * the record is refused by the server when another device has edited the task
   * in the meantime, and the pull that follows brings back that device's row —
   * which has never heard of the event. The local note is what the pass falls
   * back on then, and writing the record again from it is how that heals.
   */
  const standing = task.gcal_placed ?? sent?.cal ?? null

  if (!cfg) {
    still(mine)
    if (standing) await deleteEvent(standing, task.id)
    still(mine)
    if (sent) await db.meta.delete(sentKey(task.id))
    still(mine)
    if (standing) await placed(task.id, null)
    return
  }

  const sig = signature(task, cfg)
  // The task's own record, not the fallback: while that one is missing there is
  // a placement to write, however little else has changed.
  if (task.gcal_placed === cfg.calendar_id && sent?.sig === sig) return

  // Moved to another calendar. Google keeps events per calendar, so the old copy
  // has to go before the new one is written, or both would stand there.
  still(mine)
  if (standing && standing !== cfg.calendar_id) await deleteEvent(standing, task.id)

  still(mine)
  await putEvent(task, cfg, standing === cfg.calendar_id)
  still(mine)
  await setMeta(sentKey(task.id), JSON.stringify({ cal: cfg.calendar_id, sig }))
  still(mine)
  await placed(task.id, cfg.calendar_id)
}

/*
 * Whether a refusal is about the account rather than about the one task.
 * Google answers a spent quota with 429 — and also with a 403 that looks exactly
 * like the 403 for a calendar the owner may only read. The reason it names is
 * the only thing that tells those two apart.
 */
const SPENT = new Set(['rateLimitExceeded', 'userRateLimitExceeded', 'quotaExceeded'])

function spent(err: GcalError): boolean {
  return err.status === 429 || (err.reason !== null && SPENT.has(err.reason))
}

let running = false
let until = 0
/** The pass in hand, for a sign-out to wait on. */
let current: Promise<void> | null = null
/** Set while a sign-out is on its way: no new task is started. */
let held = false

/*
 * Lets a sign-out wait for the pass instead of cutting it off.
 *
 * Checking the session stops a pass at the next step, but a call to Google
 * already on the wire cannot be recalled: the event it makes lands after the
 * wipe, with nowhere left to record where it stands, and nothing can ever take
 * it away again. So the pass is stopped between two tasks and the one in hand
 * is finished — its event, and the record of it — before the queue goes out.
 * Returns the way to let it run again, for a sign-out that does not happen.
 */
export async function holdGcal(): Promise<() => void> {
  held = true
  await current
  return () => {
    held = false
  }
}

/** One pass over every task that has an event or wants one. */
export async function reconcile(): Promise<void> {
  if (held || running || Date.now() < until) return
  if (!isConnected()) return
  if ((await getToken()) === null) return

  running = true
  current = pass()
  try {
    await current
  } finally {
    current = null
    running = false
  }
}

/*
 * The one thing read back out of Google: an event that is gone.
 *
 * Deleting the event is the gesture that comes to hand for "not this one, not
 * in the calendar", and until now it held only until the next edit of the task
 * put the event back. So a deletion unticks the task's checkbox — written as
 * the task's own refusal, which is what keeps a whole-synced workspace from
 * handing it straight back.
 *
 * Only tasks that still want their event are asked about. One this device
 * deleted itself is gone from Google too, and would otherwise read as the
 * owner's doing and turn off a task he never touched. The same goes for the
 * old copy after a move between calendars: the task is listed under the
 * calendar it stands in now, and the cancellation arrives for the other one.
 *
 * What it turns off goes into `turned` as it goes, rather than coming back at
 * the end: the pass below is holding rows that no longer say what the database
 * does, and a sweep cut short halfway has already written some of them.
 */
async function sweep(
  tasks: Task[],
  spaces: Map<ID, Workspace>,
  labels: Map<ID, Label>,
  mine: number,
  turned: Set<ID>,
): Promise<void> {
  const byCalendar = new Map<string, Map<string, Task>>()
  for (const task of tasks) {
    const cal = task.gcal_placed
    if (cal === null) continue
    if (configFor(task, spaces.get(task.workspace_id), labels) === null) continue
    const events = byCalendar.get(cal) ?? new Map<string, Task>()
    events.set(eventIdOf(task.id), task)
    byCalendar.set(cal, events)
  }

  for (const [cal, events] of byCalendar) {
    const key = seenKey(cal)
    const seen = (await db.meta.get(key))?.value ?? null
    // Stamped from before the question, not after: an event deleted while it
    // was in flight falls inside the next window instead of between the two.
    const asked = new Date(Date.now() - SEEN_MARGIN_MS).toISOString()
    const from = seen ?? new Date(Date.now() - FIRST_LOOK_MS).toISOString()
    still(mine)

    let gone: string[]
    try {
      gone = await deletedSince(cal, from)
    } catch (err) {
      if (!(err instanceof GcalError) || err.reason !== TOO_LONG_AGO) throw err
      // Everything before now is beyond this calendar's memory. The mark is set
      // all the same, or every pass would ask the same refused question again.
      still(mine)
      await setMeta(key, asked)
      continue
    }
    // The one thing this reads is invisible until it acts, and it acts by
    // unticking a checkbox somewhere else. Said once, when there is something
    // to say, so a deletion that never arrives can be told from one that did.
    if (gone.length > 0) console.info('[gcal] gone in', cal, gone.length)
    still(mine)
    for (const id of gone) {
      const task = events.get(id)
      if (!task) continue
      await setTaskGcal(task.id, { off: true })
      turned.add(task.id)
      still(mine)
    }
    await setMeta(key, asked)
  }
}

async function pass(): Promise<void> {
  const mine = currentSession()
  const spaces = new Map((await db.workspaces.toArray()).map((w) => [w.id, w]))
  const labels = new Map(
    (await db.labels.toArray()).filter((l) => !l.deleted).map((l) => [l.id, l]),
  )
  const notes = await sentNotes()
  let tasks = await db.tasks.toArray()

  /*
   * Before a single write, so that a task whose event was deleted leaves the
   * sync before anything can rewrite it. The other way round, a task with any
   * other change pending would have its event created again a moment before
   * the app learned it had been thrown away.
   */
  const turned = new Set<ID>()
  try {
    await sweep(tasks, spaces, labels, mine, turned)
  } catch (err) {
    if (err instanceof SignedOut) return
    if (err instanceof GcalError && spent(err)) {
      until = Date.now() + BACKOFF_MS
      console.error('[gcal] backing off', err.message)
      return
    }
    // Unreadable for some reason of its own: the pass still has work to do,
    // and the mark is left where it was, so nothing is missed — only late.
    console.error('[gcal] deletions not read', err)
  }
  if (turned.size > 0) tasks = await db.tasks.toArray()

  for (const task of tasks) {
    if (held) return
    const cfg = configFor(task, spaces.get(task.workspace_id), labels)
    const sent = notes.get(task.id) ?? null
    // Nothing wanted and nothing standing: the overwhelming majority of rows.
    if (!cfg && task.gcal_placed === null && !sent) continue
    try {
      await reconcileTask(task, cfg, sent, mine)
    } catch (err) {
      if (err instanceof SignedOut) return
      if (err instanceof GcalError && spent(err)) {
        // Out of quota: every other task would collect the same answer, so the
        // pass stops rather than spend the rest of itself on it.
        until = Date.now() + BACKOFF_MS
        console.error('[gcal] backing off', err.message)
        return
      }
      // One task refused — a calendar gone read-only, say. That is this task's
      // own trouble: dropping the whole pass over it would leave every task
      // after it unwritten, and the order never changes, so for good.
      console.error('[gcal] task failed', task.id, err)
    }
  }
}

export interface GcalHandle {
  stop: () => void
}

/** Runs the reconciliation for as long as the app is open. */
export function startGcal(): GcalHandle {
  // A new sign-in: whatever the last sign-out was waiting on is over.
  held = false
  let stopped = false
  const tick = () => {
    if (!stopped) void reconcile()
  }
  const onVisible = () => {
    if (document.visibilityState === 'visible') tick()
  }

  window.addEventListener('online', tick)
  document.addEventListener('visibilitychange', onVisible)
  const timer = setInterval(tick, TICK_MS)
  tick()

  return {
    stop: () => {
      stopped = true
      clearInterval(timer)
      window.removeEventListener('online', tick)
      document.removeEventListener('visibilitychange', onVisible)
    },
  }
}
