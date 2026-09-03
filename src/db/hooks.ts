import { useLiveQuery } from 'dexie-react-hooks'
import { db } from './local'
import type { ID, Label, Note, Task, Workspace } from './types'

/*
 * Реактивное чтение из локальной базы.
 * Любая запись — своя или приехавшая с сервера — сама перерисует интерфейс.
 */

export function useWorkspaces(): Workspace[] | undefined {
  return useLiveQuery(async () => {
    const rows = await db.workspaces.orderBy('position').toArray()
    return rows.filter((w) => !w.deleted)
  }, [])
}

export function useWorkspace(id: ID | null): Workspace | undefined {
  return useLiveQuery(async () => {
    if (!id) return undefined
    const row = await db.workspaces.get(id)
    return row && !row.deleted ? row : undefined
  }, [id])
}

export function useLabels(workspaceId: ID | null): Label[] | undefined {
  return useLiveQuery(async () => {
    if (!workspaceId) return []
    const rows = await db.labels.where('workspace_id').equals(workspaceId).toArray()
    return rows.filter((l) => !l.deleted).sort((a, b) => a.position - b.position)
  }, [workspaceId])
}

export function useTasks(workspaceId: ID | null): Task[] | undefined {
  return useLiveQuery(async () => {
    if (!workspaceId) return []
    const rows = await db.tasks.where('workspace_id').equals(workspaceId).toArray()
    return rows.filter((t) => !t.deleted)
  }, [workspaceId])
}

export function useTask(id: ID | null): Task | undefined {
  return useLiveQuery(async () => {
    if (!id) return undefined
    const row = await db.tasks.get(id)
    return row && !row.deleted ? row : undefined
  }, [id])
}

export function useNotes(workspaceId: ID | null): Note[] | undefined {
  return useLiveQuery(async () => {
    if (!workspaceId) return []
    const rows = await db.notes.where('workspace_id').equals(workspaceId).toArray()
    return rows.filter((n) => !n.deleted).sort((a, b) => a.position - b.position)
  }, [workspaceId])
}

export function useNote(id: ID | null): Note | undefined {
  return useLiveQuery(async () => {
    if (!id) return undefined
    const row = await db.notes.get(id)
    return row && !row.deleted ? row : undefined
  }, [id])
}
