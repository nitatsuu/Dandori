/** Identifier — a uuid v4, generated on the client. */
export type ID = string

/** A date with no time of day, in `YYYY-MM-DD` format. */
export type ISODate = string

/** Internal timestamp, never shown in the UI. */
export type Timestamp = string

/** Label colors. The names are the user's, the code never sees them. */
export const LABEL_COLORS = [
  'red',
  'orange',
  'amber',
  'green',
  'teal',
  'blue',
  'violet',
  'pink',
  'slate',
] as const

export type LabelColor = (typeof LABEL_COLORS)[number]

/*
 * The same colour in Google's palette, for the event a task with this label
 * makes. Google's eleven and our nine meet one to one, so no two labels arrive
 * in the calendar looking alike.
 */
export const GCAL_COLOR_OF: Record<LabelColor, string> = {
  red: '11',
  orange: '6',
  amber: '5',
  green: '10',
  teal: '2',
  blue: '7',
  violet: '3',
  pink: '4',
  slate: '8',
}

/** Fields shared by every synced row. */
export interface Synced {
  id: ID
  created_at: Timestamp
  updated_at: Timestamp
  /** Soft delete: a hard delete on the phone would never reach a laptop that is offline. */
  deleted: boolean
}

/** How a task's event is made in Google Calendar. */
export interface GcalConfig {
  /**
   * When the event starts, `HH:MM`, for a task carrying no frame of its own. A
   * workspace synced whole has to put its events at some hour, and its tasks
   * are not going to be given one each by hand.
   */
  time: string
  /**
   * The default end beside it, `null` for none — then the event takes the same
   * half hour it takes with no end at all.
   *
   * Optional in the type and nowhere else: terms written before this field
   * existed carry nothing there, and they sit in stored jsonb on the server and
   * in every device's cache. Read it as `cfg.end ?? null`.
   */
  end?: string | null
  /** Which of the owner's calendars the event goes in. `primary` is the default one. */
  calendar_id: string
  /** Google's own palette, `1`–`11`; `null` leaves the calendar's colour. */
  color_id: string | null
  reminders: GcalReminder[]
}

/**
 * A task deliberately kept out of a workspace that syncs whole. Without it the
 * switch is all or nothing: clearing a task's own settings only drops it back
 * under the workspace's, and there is no way to say "this one, no".
 */
export interface GcalOff {
  off: true
}

export type GcalSetting = GcalConfig | GcalOff

/** The terms a task is synced on, or `null` if it has none of its own. */
export function gcalConfigOf(setting: GcalSetting | null | undefined): GcalConfig | null {
  return setting && !('off' in setting) ? setting : null
}

export interface GcalReminder {
  method: 'popup' | 'email'
  /** How long before the event it fires. */
  minutes: number
}

export interface Workspace extends Synced {
  name: string
  position: number
  /** Put every dated task of this workspace into the calendar, all alike. */
  gcal_sync: boolean
  /** The defaults that whole-workspace sync hands out. */
  gcal: GcalConfig | null
}

export interface Label extends Synced {
  workspace_id: ID
  name: string
  color: LabelColor
  position: number
}

/** Free-form card field: the user picks both the name and the value. */
export interface CustomField {
  /**
   * Stable key. Rows are edited in place, so identifying them by array index
   * would hand a deleted row's editing state to whoever shifts up into its slot.
   * Older rows predate this field, so it is filled in on first edit.
   */
  id?: string
  name: string
  value: string
}

export interface Task extends Synced {
  workspace_id: ID
  title: string
  description: string
  start_date: ISODate | null
  due_date: ISODate | null
  /**
   * The hours the task runs, `HH:MM`, or `null`. The one clock it has: the card
   * shows the frame and the calendar event is made on it. No view sorts, groups
   * or filters by it — a task stands on a day whatever hour its work starts at.
   *
   * An end alone is never written. It is a length measured from the start, and
   * with no start there is nothing to measure it from.
   */
  start_time: string | null
  end_time: string | null
  done: boolean
  /** How many days before the deadline to remind. `null` means no reminder. */
  remind_days_before: number | null
  /**
   * Keep the task out of the reminder banner entirely, even when it is due today
   * or already overdue. Separate from `remind_days_before`, which only controls
   * the advance warning and says nothing about the deadline itself.
   */
  muted: boolean
  /** A note attached to the task, if any. */
  note_id: ID | null
  /** Order within its own day column. */
  position: number
  label_ids: ID[]
  custom_fields: CustomField[]
  /**
   * The terms this task is synced on: its own, `{ off: true }` to stay out of a
   * workspace that syncs whole, or `null` to follow whatever the workspace says.
   *
   * The event's own id is not stored — it is the task's id with the dashes taken
   * out, so it is always at hand, and Google takes an id on insert: two devices
   * reaching for the calendar at once land on one event instead of two.
   */
  gcal: GcalSetting | null
  /**
   * The calendar an event was actually put in, or `null` if there is none.
   *
   * This is the only durable record that an event exists. Without it a device
   * that never created the event — a second one, or the same one after signing
   * out cleared its local notes — has no way to know there is anything to take
   * away, and turning the sync off would strand the events in the calendar for
   * good.
   */
  gcal_placed: string | null
}

/**
 * The one day a task stands on. One answer for the whole app: the column it
 * sits in, the point it takes on the timeline, the day its calendar event is
 * made on, and the day the banner counts from. Asked apart, the answers
 * disagreed: a task with only a start date was drawn on its day by the timeline
 * while the board kept it in «Без даты» and the calendar never heard of it.
 */
export function taskDate(task: Task): ISODate | null {
  return task.due_date ?? task.start_date
}

export type NoteKind = 'folder' | 'file'

export interface Note extends Synced {
  workspace_id: ID
  parent_id: ID | null
  kind: NoteKind
  name: string
  /** Empty for folders. */
  content: string
  position: number
}

/** Tables that take part in sync. */
/*
 * Sync order, and it matters: a row is pushed after everything it points at.
 * Tasks come last because a task can carry a note, and the server rejects the
 * whole batch with a foreign key error when that note has not landed yet.
 */
export const SYNCED_TABLES = ['workspaces', 'labels', 'notes', 'tasks'] as const
export type SyncedTable = (typeof SYNCED_TABLES)[number]

/** What a row of each table is. */
export interface SyncedRow {
  workspaces: Workspace
  labels: Label
  notes: Note
  tasks: Task
}

/** Every field of a row, named once. */
type ColumnsOf<T> = { readonly [K in keyof T]-?: true }

const OWN = { id: true, created_at: true, updated_at: true, deleted: true } as const
const IN_WORKSPACE = { ...OWN, workspace_id: true } as const

/*
 * The columns the server has, table by table.
 *
 * The push sends these and nothing else. A cache written by another build can
 * hold a field the table does not have, and one such field in one row came back
 * as an error over the whole batch — the same batch every cycle, for as long as
 * the row was there, so that table stopped syncing for good.
 *
 * The shape is checked against the row types above: a column missing here would
 * quietly stop being sent, and one that does not exist would break the push.
 */
export const SYNCED_COLUMNS = {
  workspaces: { ...OWN, name: true, position: true, gcal_sync: true, gcal: true },
  labels: { ...IN_WORKSPACE, name: true, color: true, position: true },
  notes: {
    ...IN_WORKSPACE,
    parent_id: true,
    kind: true,
    name: true,
    content: true,
    position: true,
  },
  tasks: {
    ...IN_WORKSPACE,
    title: true,
    description: true,
    start_date: true,
    due_date: true,
    start_time: true,
    end_time: true,
    done: true,
    remind_days_before: true,
    muted: true,
    note_id: true,
    position: true,
    label_ids: true,
    custom_fields: true,
    gcal: true,
    gcal_placed: true,
  },
} satisfies { [K in SyncedTable]: ColumnsOf<SyncedRow[K]> }
