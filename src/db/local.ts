import Dexie, { type EntityTable } from 'dexie'
import type { Label, Note, Task, Workspace } from './types'

/*
 * The local database is the source of truth for the UI.
 * Everything is read from and written to it; the network works separately and
 * asynchronously. The app is fully usable with no connection at all.
 */

/** Flag for "row changed locally and has not reached the server yet". */
export type Dirty = 0 | 1

export type Local<T> = T & { _dirty: Dirty }

export interface Meta {
  key: string
  value: string
}

export class DandoriDB extends Dexie {
  workspaces!: EntityTable<Local<Workspace>, 'id'>
  labels!: EntityTable<Local<Label>, 'id'>
  tasks!: EntityTable<Local<Task>, 'id'>
  notes!: EntityTable<Local<Note>, 'id'>
  meta!: EntityTable<Meta, 'key'>

  constructor() {
    super('dandori')
    // Indexes match exactly the queries we actually make: pick one workspace,
    // collect the dirty rows for a push, and read by id. Sorting happens in
    // memory — a workspace holds hundreds of tasks, not millions.
    this.version(1).stores({
      workspaces: 'id, position, _dirty',
      labels: 'id, workspace_id, _dirty',
      tasks: 'id, workspace_id, _dirty',
      notes: 'id, workspace_id, _dirty',
      meta: 'key',
    })
  }
}

export const db = new DandoriDB()

export async function getMeta(key: string): Promise<string | null> {
  const row = await db.meta.get(key)
  return row?.value ?? null
}

export async function setMeta(key: string, value: string): Promise<void> {
  await db.meta.put({ key, value })
}

/** Wipes all local data — used on sign-out. */
export async function wipeLocal(): Promise<void> {
  await db.transaction('rw', db.workspaces, db.labels, db.tasks, db.notes, db.meta, async () => {
    await Promise.all([
      db.workspaces.clear(),
      db.labels.clear(),
      db.tasks.clear(),
      db.notes.clear(),
      db.meta.clear(),
    ])
  })
}
