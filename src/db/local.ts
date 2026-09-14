import Dexie, { type EntityTable } from 'dexie'
import { SYNCED_TABLES, type Label, type Note, type Task, type Workspace } from './types'

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

    /*
     * The calendar columns arrived after rows were already cached here, and a
     * row read back without them would be `undefined` where the type promises a
     * value — right up until the next pull happened to refresh it. The indexes
     * are unchanged; this version exists only to fill the gap in what is
     * already stored.
     */
    this.version(2).upgrade(async (tx) => {
      await tx
        .table('workspaces')
        .toCollection()
        .modify((w: Partial<Workspace>) => {
          w.gcal_sync ??= false
          w.gcal ??= null
        })
      await tx
        .table('tasks')
        .toCollection()
        .modify((t: Partial<Task>) => {
          t.gcal ??= null
          t.gcal_placed ??= null
        })
    })

    /*
     * The same gap for the hours a task may run. Left unfilled it is worse than
     * a hole in a view: the push sends every column of every dirty row in one
     * batch, and a row that has never heard of a column goes up with fewer keys
     * than the row beside it — which the server refuses over the whole batch,
     * so the table stops syncing until the gap happens to be pulled away.
     */
    this.version(3).upgrade(async (tx) => {
      await tx
        .table('tasks')
        .toCollection()
        .modify((t: Partial<Task>) => {
          t.start_time ??= null
          t.end_time ??= null
        })
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

/** Drops the fields that exist only here and mean nothing to the server. */
export function stripLocal<T extends object>(row: Local<T>): T {
  const { _dirty, ...rest } = row
  return rest as unknown as T
}

/** How many edits are still waiting to go out. */
export async function pendingCount(): Promise<number> {
  const counts = await Promise.all(SYNCED_TABLES.map((t) => db[t].where('_dirty').equals(1).count()))
  return counts.reduce((a, b) => a + b, 0)
}

/*
 * Whose rows these are.
 *
 * Signing out on one device ends the session on the other one too, and that
 * other device only finds out when its token expires: it shows the sign-in form
 * with a full cache still behind it. Whoever signs in next would have seen the
 * previous account's workspaces — and the queue would have pushed its unsent
 * edits up under the new account's name.
 *
 * A cache with no owner written on it is adopted rather than thrown away: it
 * was made by a build that predates this note, and there is only one account
 * it can belong to.
 */
export async function claimCache(userId: string): Promise<void> {
  // One transaction: the sign-in and the first push both claim, and a check
  // and a wipe from the two of them interleaved would each see the other's
  // half-done work.
  await db.transaction('rw', db.workspaces, db.labels, db.tasks, db.notes, db.meta, async () => {
    const owner = await getMeta('owner')
    if (owner === userId) return
    if (owner) await wipeLocal()
    await setMeta('owner', userId)
  })
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
