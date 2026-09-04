import { db, type Local } from './local'
import { requestPush } from '../sync/sync'
import type {
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
    name: name.trim() || 'Без названия',
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

export async function renameWorkspace(id: ID, name: string): Promise<void> {
  const row = await db.workspaces.get(id)
  if (!row) return
  await db.workspaces.put(touch({ ...row, name: name.trim() || row.name }))
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
    name: name.trim() || 'Метка',
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
  const row = await db.labels.get(id)
  if (!row) return
  await db.labels.put(touch({ ...row, ...patch }))
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
  const ts = now()
  const row: Local<Task> = {
    id: uid(),
    workspace_id: workspaceId,
    title: input.title.trim() || 'Без названия',
    description: input.description ?? '',
    start_date: input.start_date ?? null,
    due_date: due,
    done: false,
    remind_days_before: null,
    muted: false,
    note_id: null,
    position: await nextTaskPosition(workspaceId, due),
    label_ids: input.label_ids ?? [],
    custom_fields: [],
    created_at: ts,
    updated_at: ts,
    deleted: false,
    _dirty: 1,
  }
  await db.tasks.add(row)
  queue()
  return row.id
}

async function nextTaskPosition(workspaceId: ID, due: ISODate | null): Promise<number> {
  const column = (await listTasks(workspaceId)).filter((t) => t.due_date === due)
  return Math.max(0, ...column.map((t) => t.position)) + POS_STEP
}

export type TaskPatch = Partial<
  Pick<
    Task,
    | 'title'
    | 'description'
    | 'start_date'
    | 'due_date'
    | 'done'
    | 'remind_days_before'
    | 'muted'
    | 'note_id'
    | 'label_ids'
    | 'custom_fields'
  >
>

export async function updateTask(id: ID, patch: TaskPatch): Promise<void> {
  const row = await db.tasks.get(id)
  if (!row) return
  const next = { ...row, ...patch }
  // Changing the day means changing the column, so the task goes to its end.
  if (patch.due_date !== undefined && patch.due_date !== row.due_date) {
    next.position = await nextTaskPosition(row.workspace_id, patch.due_date)
  }
  await db.tasks.put(touch(next))
  queue()
}

export async function toggleTaskDone(id: ID): Promise<void> {
  const row = await db.tasks.get(id)
  if (!row) return
  await db.tasks.put(touch({ ...row, done: !row.done }))
  queue()
}

export async function deleteTask(id: ID): Promise<void> {
  const row = await db.tasks.get(id)
  if (!row) return
  await db.tasks.put(touch({ ...row, deleted: true }))
  queue()
}

/**
 * Moves a task into a day column, in front of task `beforeId`; `null` puts it at the end.
 * `due` = null is the "no date" column.
 *
 * The slot is given by a neighbour, not by an index: the board can have a label
 * filter on, and an index in the filtered list is not the index in the whole column.
 *
 * The whole column is renumbered: a day holds a handful of tasks, there is nothing to save.
 */
export async function moveTask(id: ID, due: ISODate | null, beforeId: ID | null): Promise<void> {
  await db.transaction('rw', db.tasks, async () => {
    const moved = await db.tasks.get(id)
    if (!moved) return

    const column = (await db.tasks.where('workspace_id').equals(moved.workspace_id).toArray())
      .filter((t) => !t.deleted && t.due_date === due && t.id !== id)
      .sort((a, b) => a.position - b.position)

    const found = beforeId ? column.findIndex((t) => t.id === beforeId) : -1
    const at = found >= 0 ? found : column.length
    column.splice(at, 0, { ...moved, due_date: due })

    for (const [i, task] of column.entries()) {
      const position = (i + 1) * POS_STEP
      if (task.id === id) {
        await db.tasks.put(touch({ ...moved, due_date: due, position }))
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
    name: name.trim() || (kind === 'folder' ? 'Новая папка' : 'Новая заметка'),
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
  const row = await db.notes.get(id)
  if (!row) return
  await db.notes.put(touch({ ...row, ...patch }))
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
  const strip = <T extends object>(rows: Local<T>[]) =>
    rows.filter((r) => !(r as { deleted?: boolean }).deleted).map(({ _dirty, ...rest }) => rest)

  const data = {
    format: 'dandori-export',
    version: 1,
    exported_at: now(),
    workspaces: strip(await db.workspaces.toArray()),
    labels: strip(await db.labels.toArray()),
    tasks: strip(await db.tasks.toArray()),
    notes: strip(await db.notes.toArray()),
  }
  return JSON.stringify(data, null, 2)
}
