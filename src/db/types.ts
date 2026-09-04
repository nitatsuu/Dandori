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

/** Fields shared by every synced row. */
export interface Synced {
  id: ID
  created_at: Timestamp
  updated_at: Timestamp
  /** Soft delete: a hard delete on the phone would never reach a laptop that is offline. */
  deleted: boolean
}

export interface Workspace extends Synced {
  name: string
  position: number
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
