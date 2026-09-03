import Dexie, { type EntityTable } from 'dexie'
import type { Label, Note, Task, Workspace } from './types'

/*
 * Локальная база — источник правды для интерфейса.
 * Всё читается и пишется сюда, сеть работает отдельно и асинхронно.
 * Приложение полностью функционально без соединения.
 */

/** Флаг «строка изменена локально и ещё не уехала на сервер». */
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
    this.version(1).stores({
      workspaces: 'id, position, _dirty',
      labels: 'id, workspace_id, position, _dirty',
      tasks: 'id, workspace_id, due_date, [workspace_id+due_date], position, _dirty',
      notes: 'id, workspace_id, parent_id, [workspace_id+parent_id], position, _dirty',
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

/** Полная очистка локальных данных — при выходе из аккаунта. */
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
