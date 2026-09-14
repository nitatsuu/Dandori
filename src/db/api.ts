import { db, stripLocal, type Local } from './local'
import { requestPush } from '../sync/sync'
import { translate } from '../i18n'
import { taskDate } from './types'
import type {
  GcalConfig,
  GcalSetting,
  ID,
  ISODate,
  Label,
  LabelColor,
  Note,
  NoteKind,
  Task,
  Workspace,
} from './types'

/*
 * The only way the UI touches data.
 * Everything is written to the local database right away; the push to the
 * server happens in the background.
 * Components must never talk to Supabase directly.
 *
 * A row created without a name takes a default one out of the dictionary and
 * keeps it: the name is the thing's own from then on, and switching the
 * interface to the other language does not rename what is already there.
 */

const now = () => new Date().toISOString()
const uid = () => crypto.randomUUID()

/** Marks a local row dirty and queues it for the next push. */
function touch<T extends { updated_at: string }>(row: T): Local<T> {
  return { ...row, updated_at: now(), _dirty: 1 as const }
}

function queue() {
  void requestPush()
}

/** Position step: there is always room left between neighbours. */
const POS_STEP = 1000

// ---------------------------------------------------------------- workspaces

export async function listWorkspaces(): Promise<Workspace[]> {
  const rows = await db.workspaces.orderBy('position').toArray()
  return rows.filter((w) => !w.deleted)
}

export async function createWorkspace(name: string): Promise<ID> {
  const existing = await listWorkspaces()
  const ts = now()
  const row: Local<Workspace> = {
    id: uid(),
    name: name.trim() || translate('common.untitled'),
    gcal_sync: false,
    gcal: null,
    position: (existing.at(-1)?.position ?? 0) + POS_STEP,
    created_at: ts,
    updated_at: ts,
    deleted: false,
    _dirty: 1,
  }
  await db.workspaces.add(row)
  queue()
  return row.id
}

/*
 * Every edit below reads its row and writes it back inside one transaction.
 * Closing the task card saves the title and the description at the same moment;
 * each read the row before either wrote, and the second put back the title the
 * first had just changed.
 */
export async function renameWorkspace(id: ID, name: string): Promise<void> {
  await db.transaction('rw', db.workspaces, async () => {
    const row = await db.workspaces.get(id)
    if (!row) return
    await db.workspaces.put(touch({ ...row, name: name.trim() || row.name }))
  })
  queue()
}

/** Deleting a workspace soft-deletes its content too, or the orphans stay out of reach. */
export async function deleteWorkspace(id: ID): Promise<void> {
  await db.transaction('rw', db.workspaces, db.labels, db.tasks, db.notes, async () => {
    const ws = await db.workspaces.get(id)
    if (ws) await db.workspaces.put(touch({ ...ws, deleted: true }))

    for (const table of [db.labels, db.tasks, db.notes]) {
      const rows = await table.where('workspace_id').equals(id).toArray()
      for (const row of rows) {
        if (!row.deleted) await table.put(touch({ ...row, deleted: true }) as never)
      }
    }
  })
  queue()
}

// -------------------------------------------------------------------- labels

export async function listLabels(workspaceId: ID): Promise<Label[]> {
  const rows = await db.labels.where('workspace_id').equals(workspaceId).toArray()
  return rows.filter((l) => !l.deleted).sort((a, b) => a.position - b.position)
}

export async function createLabel(
  workspaceId: ID,
  name: string,
  color: LabelColor,
): Promise<ID> {
  const existing = await listLabels(workspaceId)
  const ts = now()
  const row: Local<Label> = {
    id: uid(),
    workspace_id: workspaceId,
    name: name.trim(),
    color,
    position: (existing.at(-1)?.position ?? 0) + POS_STEP,
    created_at: ts,
    updated_at: ts,
    deleted: false,
    _dirty: 1,
  }
  await db.labels.add(row)
  queue()
  return row.id
}

export async function updateLabel(
  id: ID,
  patch: Partial<Pick<Label, 'name' | 'color'>>,
): Promise<void> {
  await db.transaction('rw', db.labels, async () => {
    const row = await db.labels.get(id)
    if (!row) return
    await db.labels.put(touch({ ...row, ...patch }))
  })
  queue()
}

/** The label is stripped from every task, otherwise dangling ids are left behind. */
export async function deleteLabel(id: ID): Promise<void> {
  await db.transaction('rw', db.labels, db.tasks, async () => {
    const label = await db.labels.get(id)
    if (!label) return
    await db.labels.put(touch({ ...label, deleted: true }))

    const tasks = await db.tasks.where('workspace_id').equals(label.workspace_id).toArray()
    for (const task of tasks) {
      if (!task.label_ids.includes(id)) continue
      await db.tasks.put(touch({ ...task, label_ids: task.label_ids.filter((l) => l !== id) }))
    }
  })
  queue()
}

// --------------------------------------------------------------------- tasks

export async function listTasks(workspaceId: ID): Promise<Task[]> {
  const rows = await db.tasks.where('workspace_id').equals(workspaceId).toArray()
  return rows.filter((t) => !t.deleted)
}

export interface NewTask {
  title: string
  due_date?: ISODate | null
  start_date?: ISODate | null
  description?: string
  label_ids?: ID[]
}

export async function createTask(workspaceId: ID, input: NewTask): Promise<ID> {
  const due = input.due_date ?? null
  const start = input.start_date ?? null
  const ts = now()
  const row: Local<Task> = {
    id: uid(),
    workspace_id: workspaceId,
    title: input.title.trim() || translate('common.untitled'),
    description: input.description ?? '',
    start_date: start,
    due_date: due,
    start_time: null,
    end_time: null,
    done: false,
    remind_days_before: null,
    muted: false,
    note_id: null,
    position: await nextTaskPosition(workspaceId, due ?? start),
    label_ids: input.label_ids ?? [],
    custom_fields: [],
    gcal: null,
    gcal_placed: null,
    created_at: ts,
    updated_at: ts,
    deleted: false,
    _dirty: 1,
  }
  await db.tasks.add(row)
  queue()
  return row.id
}

/** The end of the day column — the column a task stands in is the one of `taskDate`. */
async function nextTaskPosition(workspaceId: ID, date: ISODate | null): Promise<number> {
  const column = (await listTasks(workspaceId)).filter((t) => taskDate(t) === date)
  return Math.max(0, ...column.map((t) => t.position)) + POS_STEP
}

export type TaskPatch = Partial<
  Pick<
    Task,
    | 'title'
    | 'description'
    | 'start_date'
    | 'due_date'
    | 'start_time'
    | 'end_time'
    | 'done'
    | 'remind_days_before'
    | 'muted'
    | 'note_id'
    | 'label_ids'
    | 'custom_fields'
  >
>

export async function updateTask(id: ID, patch: TaskPatch): Promise<void> {
  await db.transaction('rw', db.tasks, async () => {
    const row = await db.tasks.get(id)
    if (!row) return
    const next = { ...row, ...patch }
    // Changing the day means changing the column, so the task goes to its end.
    // Read through `taskDate`: a start date moves a task that has no deadline
    // just as a deadline moves one that has.
    const day = taskDate(next)
    if (day !== taskDate(row)) {
      next.position = await nextTaskPosition(row.workspace_id, day)
    }
    await db.tasks.put(touch(next))
  })
  queue()
}

export async function toggleTaskDone(id: ID): Promise<void> {
  await db.transaction('rw', db.tasks, async () => {
    const row = await db.tasks.get(id)
    if (!row) return
    await db.tasks.put(touch({ ...row, done: !row.done }))
  })
  queue()
}

/*
 * Google Calendar.
 *
 * Only the wish is written here — which task should have an event and how it
 * should look. Whether the calendar has caught up is `src/gcal/` business, and
 * it works it out by looking, so nothing on this side has to be told twice.
 */

/** Turns the calendar on for one task, or off again with `null`. */
export async function setTaskGcal(id: ID, cfg: GcalSetting | null): Promise<void> {
  await db.transaction('rw', db.tasks, async () => {
    const row = await db.tasks.get(id)
    if (!row) return
    await db.tasks.put(touch({ ...row, gcal: cfg }))
  })
  queue()
}

export async function setWorkspaceGcal(
  id: ID,
  patch: { gcal_sync?: boolean; gcal?: GcalConfig | null },
): Promise<void> {
  await db.transaction('rw', db.workspaces, async () => {
    const row = await db.workspaces.get(id)
    if (!row) return
    await db.workspaces.put(touch({ ...row, ...patch }))
  })
  queue()
}

export async function deleteTask(id: ID): Promise<void> {
  await db.transaction('rw', db.tasks, async () => {
    const row = await db.tasks.get(id)
    if (!row) return
    await db.tasks.put(touch({ ...row, deleted: true }))
  })
  queue()
}

/**
 * Moves a task into a day column, in front of task `beforeId`; `null` puts it at the end.
 * `date` = null is the "no date" column.
 *
 * The slot is given by a neighbour, not by an index: the board can have a label
 * filter on, and an index in the filtered list is not the index in the whole column.
 *
 * The whole column is renumbered: a day holds a handful of tasks, there is nothing to save.
 */
export async function moveTask(id: ID, date: ISODate | null, beforeId: ID | null): Promise<void> {
  await db.transaction('rw', db.tasks, async () => {
    const moved = await db.tasks.get(id)
    if (!moved) return

    /*
     * The drag moves the date the card was placed by, and invents no other: a
     * task standing on its start date keeps standing on a start date, and no
     * deadline is made up for it. With neither date it is given a deadline, as
     * the column it came from says nothing either way.
     *
     * «Без даты» is the exception, and it takes both: a task carrying a start
     * date as well as a deadline would otherwise lose the deadline and land in
     * its start date's column — anywhere but the column it was dropped on, which
     * is the one promise the board makes.
     */
    const byStart = moved.due_date === null && moved.start_date !== null
    const next =
      date === null
        ? { ...moved, start_date: null, due_date: null }
        : byStart
          ? { ...moved, start_date: date }
          : { ...moved, due_date: date }

    const column = (await db.tasks.where('workspace_id').equals(moved.workspace_id).toArray())
      .filter((t) => !t.deleted && taskDate(t) === date && t.id !== id)
      .sort((a, b) => a.position - b.position)

    const found = beforeId ? column.findIndex((t) => t.id === beforeId) : -1
    const at = found >= 0 ? found : column.length
    column.splice(at, 0, next)

    for (const [i, task] of column.entries()) {
      const position = (i + 1) * POS_STEP
      if (task.id === id) {
        await db.tasks.put(touch({ ...next, position }))
      } else if (task.position !== position) {
        await db.tasks.put(touch({ ...task, position }))
      }
    }
  })
  queue()
}

// --------------------------------------------------------------------- notes

export async function listNotes(workspaceId: ID): Promise<Note[]> {
  const rows = await db.notes.where('workspace_id').equals(workspaceId).toArray()
  return rows.filter((n) => !n.deleted).sort((a, b) => a.position - b.position)
}

export async function createNote(
  workspaceId: ID,
  kind: NoteKind,
  parentId: ID | null,
  name: string,
): Promise<ID> {
  const siblings = (await listNotes(workspaceId)).filter((n) => n.parent_id === parentId)
  const ts = now()
  const row: Local<Note> = {
    id: uid(),
    workspace_id: workspaceId,
    parent_id: parentId,
    kind,
    name: name.trim() || translate(kind === 'folder' ? 'notes.newFolder' : 'notes.newFile'),
    content: '',
    position: (siblings.at(-1)?.position ?? 0) + POS_STEP,
    created_at: ts,
    updated_at: ts,
    deleted: false,
    _dirty: 1,
  }
  await db.notes.add(row)
  queue()
  return row.id
}

export async function updateNote(
  id: ID,
  patch: Partial<Pick<Note, 'name' | 'content' | 'parent_id'>>,
): Promise<void> {
  await db.transaction('rw', db.notes, async () => {
    const row = await db.notes.get(id)
    if (!row) return
    await db.notes.put(touch({ ...row, ...patch }))
  })
  queue()
}

/**
 * Moves a note under `parentId` — `null` is the root of the tree — in front of
 * sibling `beforeId`; `null` puts it last.
 *
 * The slot is named by the neighbour that will follow, not by an index, and the
 * whole level is renumbered: a level of a note tree holds a handful of rows.
 *
 * The level is counted in the order the tree draws it — folders first, then by
 * position — and laid back down in that same order. Counted by position alone,
 * a slot named «in front of this file» put the row in front of the folders that
 * are drawn above it, which is not the place the neighbour stands in.
 *
 * Two moves are refused rather than corrected. Only a folder holds children, so
 * nothing is dropped into a file; and a folder put inside itself, or inside
 * anything it already holds, would cut its whole subtree out of the tree — the
 * rows would stay in the table with no path to the root and nowhere to be drawn.
 */
export async function moveNote(id: ID, parentId: ID | null, beforeId: ID | null): Promise<void> {
  await db.transaction('rw', db.notes, async () => {
    const moved = await db.notes.get(id)
    if (!moved) return

    const all = (await db.notes.where('workspace_id').equals(moved.workspace_id).toArray()).filter(
      (n) => !n.deleted,
    )

    if (parentId !== null) {
      const byId = new Map(all.map((n) => [n.id, n]))
      if (byId.get(parentId)?.kind !== 'folder') return

      // Walking up stops on a repeat as well: a chain that already loops back on
      // itself is not a reason to spin here.
      const seen = new Set<ID>()
      let up: ID | null = parentId
      while (up && !seen.has(up)) {
        if (up === id) return
        seen.add(up)
        up = byId.get(up)?.parent_id ?? null
      }
    }

    /*
     * A note whose folder has not arrived yet counts as standing at the root —
     * which is where the tree draws it. Counted by `parent_id` alone, the level
     * here and the level on the screen were two different lists, and the slot
     * the line promised was not the slot that got written.
     */
    const live = new Set(all.map((n) => n.id))
    const levelOf = (n: Note) => (n.parent_id && live.has(n.parent_id) ? n.parent_id : null)

    const level = all
      .filter((n) => levelOf(n) === parentId && n.id !== id)
      .sort((a, b) =>
        a.kind === b.kind ? a.position - b.position : a.kind === 'folder' ? -1 : 1,
      )

    const found = beforeId ? level.findIndex((n) => n.id === beforeId) : -1
    const at = found >= 0 ? found : level.length
    const next = { ...moved, parent_id: parentId }
    level.splice(at, 0, next)

    for (const [i, note] of level.entries()) {
      const position = (i + 1) * POS_STEP
      if (note.id === id) {
        await db.notes.put(touch({ ...next, position }))
      } else if (note.position !== position) {
        await db.notes.put(touch({ ...note, position }))
      }
    }
  })
  queue()
}

/** A folder goes away together with its whole subtree. */
export async function deleteNote(id: ID): Promise<void> {
  await db.transaction('rw', db.notes, db.tasks, async () => {
    const root = await db.notes.get(id)
    if (!root) return

    const all = await db.notes.where('workspace_id').equals(root.workspace_id).toArray()
    const doomed = new Set<ID>([id])
    let grew = true
    while (grew) {
      grew = false
      for (const n of all) {
        if (n.parent_id && doomed.has(n.parent_id) && !doomed.has(n.id)) {
          doomed.add(n.id)
          grew = true
        }
      }
    }

    for (const n of all) {
      if (doomed.has(n.id) && !n.deleted) await db.notes.put(touch({ ...n, deleted: true }))
    }

    // A task pointing at a deleted note would keep offering a dead link.
    const tasks = await db.tasks.where('workspace_id').equals(root.workspace_id).toArray()
    for (const task of tasks) {
      if (task.note_id && doomed.has(task.note_id)) {
        await db.tasks.put(touch({ ...task, note_id: null }))
      }
    }
  })
  queue()
}

// -------------------------------------------------------------------- export

/** Dumps everything into one file: insurance in case we ever leave Supabase. */
export async function exportAll(): Promise<string> {
  const strip = <T extends { deleted: boolean }>(rows: Local<T>[]) =>
    rows.filter((r) => !r.deleted).map(stripLocal)

  const labels = strip(await db.labels.toArray())
  const notes = strip(await db.notes.toArray())

  /*
   * Ids of labels and notes that no longer exist are dropped as the file is
   * written: a task edited offline can come back from a conflict still carrying
   * the label deleted on the other device, and though no view ever draws it,
   * the export is the one place it would be read. Only the copy is cleaned —
   * rewriting the rows would be an edit of this device's own, and sync would
   * carry it over to the other one.
   */
  const liveLabels = new Set(labels.map((l) => l.id))
  const liveNotes = new Set(notes.map((n) => n.id))
  const tasks = strip(await db.tasks.toArray()).map((task) => ({
    ...task,
    label_ids: task.label_ids.filter((id) => liveLabels.has(id)),
    note_id: task.note_id !== null && liveNotes.has(task.note_id) ? task.note_id : null,
  }))

  const data = {
    format: 'dandori-export',
    version: 1,
    exported_at: now(),
    workspaces: strip(await db.workspaces.toArray()),
    labels,
    tasks,
    notes,
  }
  return JSON.stringify(data, null, 2)
}
