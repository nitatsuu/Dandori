import { supabase } from '../auth/supabase'
import { db, getMeta, setMeta, type Local } from '../db/local'
import { SYNCED_TABLES, type SyncedTable } from '../db/types'

/*
 * Синхронизация с Supabase.
 *
 * Локальная база всегда впереди: интерфейс пишет в неё и не ждёт сети.
 * Изменённые строки помечаются `_dirty` и уезжают на сервер при первой возможности.
 *
 * Разрешение конфликтов — last-write-wins по `updated_at` на всю строку.
 * Пользователь один с двумя устройствами: настоящий конфликт означает,
 * что он правил одну и ту же карточку на телефоне и на ноутбуке,
 * пока одно из устройств было офлайн. Редкий случай, CRDT ради него не нужен.
 */

const LAST_PULL = 'last_pull_at'
const PUSH_DEBOUNCE_MS = 400
const POLL_INTERVAL_MS = 60_000

export type SyncState = 'idle' | 'syncing' | 'offline' | 'error'

type Listener = (state: SyncState) => void

let state: SyncState = 'idle'
const listeners = new Set<Listener>()

function setState(next: SyncState) {
  if (state === next) return
  state = next
  for (const fn of listeners) fn(state)
}

export function getSyncState(): SyncState {
  return state
}

export function onSyncState(fn: Listener): () => void {
  listeners.add(fn)
  fn(state)
  return () => listeners.delete(fn)
}

/** Поля, которых нет на сервере. */
function stripLocal<T extends object>(row: Local<T>): T {
  const { _dirty, ...rest } = row
  return rest as unknown as T
}

// ---------------------------------------------------------------- отправка

let pushTimer: ReturnType<typeof setTimeout> | null = null
let pushInFlight: Promise<void> | null = null
let pushAgain = false

/** Просьба отправить изменения. Вызовы схлопываются. */
export function requestPush(): Promise<void> {
  if (pushTimer) clearTimeout(pushTimer)
  return new Promise((resolve) => {
    pushTimer = setTimeout(() => {
      pushTimer = null
      resolve(push())
    }, PUSH_DEBOUNCE_MS)
  })
}

export async function push(): Promise<void> {
  // Пока идёт отправка, новые просьбы сводятся к одному повтору в конце.
  if (pushInFlight) {
    pushAgain = true
    return pushInFlight
  }

  pushInFlight = (async () => {
    if (!navigator.onLine) {
      setState('offline')
      return
    }

    const { data: auth } = await supabase.auth.getUser()
    const userId = auth.user?.id
    if (!userId) return

    setState('syncing')
    try {
      for (const table of SYNCED_TABLES) {
        const dirty = await db[table].where('_dirty').equals(1).toArray()
        if (dirty.length === 0) continue

        const payload = dirty.map((row) => ({ ...stripLocal(row), user_id: userId }))
        const { error } = await supabase.from(table).upsert(payload, { onConflict: 'id' })
        if (error) throw error

        // Строку, изменённую во время отправки, грязной оставляем.
        await db.transaction('rw', db[table], async () => {
          for (const sent of dirty) {
            const current = await db[table].get(sent.id)
            if (current && current.updated_at === sent.updated_at) {
              await db[table].put({ ...current, _dirty: 0 } as never)
            }
          }
        })
      }
      setState('idle')
    } catch (err) {
      setState(navigator.onLine ? 'error' : 'offline')
      console.error('[sync] отправка не удалась', err)
    }
  })()

  try {
    await pushInFlight
  } finally {
    pushInFlight = null
  }

  if (pushAgain) {
    pushAgain = false
    await push()
  }
}

// ------------------------------------------------------------------ загрузка

export async function pull(): Promise<void> {
  if (!navigator.onLine) {
    setState('offline')
    return
  }

  const since = (await getMeta(LAST_PULL)) ?? '1970-01-01T00:00:00.000Z'
  // Запас в минуту прикрывает расхождение часов между устройствами.
  const startedAt = new Date(Date.now() - 60_000).toISOString()

  setState('syncing')
  try {
    for (const table of SYNCED_TABLES) {
      const { data, error } = await supabase.from(table).select('*').gt('updated_at', since)
      if (error) throw error
      if (!data || data.length === 0) continue
      await mergeRows(table, data as Record<string, unknown>[])
    }
    await setMeta(LAST_PULL, startedAt)
    setState('idle')
  } catch (err) {
    setState(navigator.onLine ? 'error' : 'offline')
    console.error('[sync] загрузка не удалась', err)
  }
}

async function mergeRows(table: SyncedTable, rows: Record<string, unknown>[]): Promise<void> {
  await db.transaction('rw', db[table], async () => {
    for (const remote of rows) {
      // `user_id` нужен только серверу, локально он лишний.
      const { user_id: _user, ...clean } = remote
      const id = clean.id as string
      const local = await db[table].get(id)

      // Локальная правка новее удалённой — её и оставляем, она уедет при отправке.
      if (local?._dirty === 1 && local.updated_at >= (clean.updated_at as string)) continue

      await db[table].put({ ...clean, _dirty: 0 } as never)
    }
  })
}

// ------------------------------------------------------------------- запуск

let stopped = true

/** Первая полная загрузка после входа: локальная база ещё пустая. */
export async function initialPull(): Promise<void> {
  await setMeta(LAST_PULL, '1970-01-01T00:00:00.000Z')
  await pull()
}

export function startSync(): () => void {
  stopped = false

  const tick = () => {
    if (stopped) return
    void push().then(() => pull())
  }

  const onOnline = () => tick()
  const onVisible = () => {
    if (document.visibilityState === 'visible') tick()
  }

  window.addEventListener('online', onOnline)
  window.addEventListener('offline', () => setState('offline'))
  document.addEventListener('visibilitychange', onVisible)
  const timer = setInterval(tick, POLL_INTERVAL_MS)

  tick()

  return () => {
    stopped = true
    clearInterval(timer)
    window.removeEventListener('online', onOnline)
    document.removeEventListener('visibilitychange', onVisible)
  }
}
