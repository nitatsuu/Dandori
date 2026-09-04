import { supabase } from '../auth/supabase'
import { db, getMeta, setMeta, type Local } from '../db/local'
import { SYNCED_TABLES, type SyncedTable } from '../db/types'

/*
 * Sync with Supabase.
 *
 * The local database is always ahead: the UI writes to it and never waits for
 * the network. Changed rows are marked `_dirty` and go to the server at the
 * first opportunity.
 *
 * Conflicts are resolved last-write-wins by `updated_at`, over the whole row.
 * There is a single user with two devices: a real conflict means he edited the
 * same card on the phone and on the laptop while one of them was offline. That
 * is rare enough that a CRDT is not worth it.
 */

/** Pull cursor, one per table. See `runPull` for why it is not one for all of them. */
const cursorKey = (table: SyncedTable) => `synced_at:${table}`
const EPOCH = '1970-01-01T00:00:00.000Z'
/*
 * How far the cursor is held back from the newest row already taken. A write
 * that was in flight while the query ran gets a stamp from the moment it
 * started, which can be older than rows the query did return, and the next pull
 * would step right over it. Rows arriving twice cost nothing, a row lost costs
 * everything.
 */
const CURSOR_SLACK_MS = 5_000
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

/** Drops the fields that do not exist on the server. */
function stripLocal<T extends object>(row: Local<T>): T {
  const { _dirty, ...rest } = row
  return rest as unknown as T
}

/**
 * Timestamps arrive in different formats: local ones are written as `…Z`, while
 * PostgREST returns `…+00:00`. Comparing them as strings would be wrong.
 */
function isNewerOrSame(a: string, b: string): boolean {
  return Date.parse(a) >= Date.parse(b)
}

// -------------------------------------------------------------------- push

let pushTimer: ReturnType<typeof setTimeout> | null = null
let pushInFlight: Promise<void> | null = null
let pushAgain = false

/** Asks for a push. Repeated calls collapse into a single debounced push. */
export function requestPush(): void {
  if (pushTimer) clearTimeout(pushTimer)
  pushTimer = setTimeout(() => {
    pushTimer = null
    void push()
  }, PUSH_DEBOUNCE_MS)
}

export async function push(): Promise<void> {
  // While a push is in flight, further requests collapse into one repeat at the end.
  if (pushInFlight) {
    pushAgain = true
    return pushInFlight
  }

  pushInFlight = (async () => {
    if (!navigator.onLine) {
      setState('offline')
      return
    }

    // getSession on purpose: it reads the stored session locally, while getUser
    // would hit the network before every upsert.
    const { data: auth } = await supabase.auth.getSession()
    const userId = auth.session?.user.id
    if (!userId) return

    setState('syncing')
    let failed = false

    /*
     * A table that will not go through must not take the others with it. The
     * tables are ordered so that a row is sent after everything it points at,
     * but if one batch is rejected anyway, giving up on the rest would leave the
     * queue stuck for good: the row that would settle the conflict is often in
     * the very table that never gets its turn.
     */
    for (const table of SYNCED_TABLES) {
      try {
        const dirty = await db[table].where('_dirty').equals(1).toArray()
        if (dirty.length === 0) continue

        const payload = dirty.map((row) => ({ ...stripLocal(row), user_id: userId }))
        const { error } = await supabase.from(table).upsert(payload, { onConflict: 'id' })
        if (error) throw error

        // A row that changed while the push was in flight stays dirty.
        await db.transaction('rw', db[table], async () => {
          for (const sent of dirty) {
            const current = await db[table].get(sent.id)
            if (current && current.updated_at === sent.updated_at) {
              await db[table].put({ ...current, _dirty: 0 } as never)
            }
          }
        })
      } catch (err) {
        failed = true
        console.error(`[sync] push failed: ${table}`, err)
      }
    }

    setState(failed ? (navigator.onLine ? 'error' : 'offline') : 'idle')
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

// ---------------------------------------------------------------------- pull

let pullInFlight: Promise<void> | null = null

/**
 * Fetches everything that changed on the server since last time.
 * A fresh device has no cursor, so the first pull drags in everything.
 */
export function pull(): Promise<void> {
  // The interval, the return from the background and the network coming back
  // can all fire at once. Without this guard three racing pulls would overwrite
  // each other's cursor.
  pullInFlight ??= runPull().finally(() => {
    pullInFlight = null
  })
  return pullInFlight
}

async function runPull(): Promise<void> {
  if (!navigator.onLine) {
    setState('offline')
    return
  }

  setState('syncing')
  try {
    /*
     * The cursor runs on `synced_at`, the stamp the server puts on a row as it
     * writes it — never on `updated_at`, which belongs to the device that made
     * the edit. An edit made offline keeps the time it was made: edit on the
     * phone at 10:00, come back online at 11:00, and a laptop whose cursor moved
     * to 10:05 long ago would never ask for anything that old again, so the edit
     * would sit on the server invisible to it for good.
     *
     * One cursor per table, taken from the rows that table actually returned.
     * A single shared cursor could be dragged forward by a busy table past rows
     * of a quiet one that were written while the pull was already running.
     */
    for (const table of SYNCED_TABLES) {
      const since = (await getMeta(cursorKey(table))) ?? EPOCH
      const { data, error } = await supabase.from(table).select('*').gt('synced_at', since)
      if (error) throw error
      if (!data || data.length === 0) continue

      const rows = data as Record<string, unknown>[]
      await mergeRows(table, rows)

      let newest = 0
      for (const row of rows) newest = Math.max(newest, Date.parse(row.synced_at as string))
      const next = new Date(newest - CURSOR_SLACK_MS).toISOString()
      if (Date.parse(next) > Date.parse(since)) await setMeta(cursorKey(table), next)
    }
    setState('idle')
  } catch (err) {
    setState(navigator.onLine ? 'error' : 'offline')
    console.error('[sync] pull failed', err)
  }
}

async function mergeRows(table: SyncedTable, rows: Record<string, unknown>[]): Promise<void> {
  await db.transaction('rw', db[table], async () => {
    for (const remote of rows) {
      // Both belong to the server alone: the owner it checks, and the stamp it
      // puts on a row as it writes it. Locally they are dead weight.
      const { user_id: _user, synced_at: _synced, ...clean } = remote
      const id = clean.id as string
      const local = await db[table].get(id)

      // The local edit is newer than the remote one, so keep it; the next push sends it.
      if (local?._dirty === 1 && isNewerOrSame(local.updated_at, clean.updated_at as string)) {
        continue
      }

      await db[table].put({ ...clean, _dirty: 0 } as never)
    }
  })
}

// -------------------------------------------------------------------- start

export interface SyncHandle {
  /** Resolves once the first exchange with the server is done — successful or not. */
  ready: Promise<void>
  stop: () => void
}

/**
 * Starts the exchange and keeps it running: on an interval, when the network
 * comes back, and when the tab returns from the background.
 * The state lives in the closure rather than in the module: otherwise the
 * cleanup of one call would silence the ticks of the next one, and sync would
 * die after a remount.
 */
export function startSync(): SyncHandle {
  let stopped = false

  const cycle = async () => {
    if (stopped) return
    await push()
    if (stopped) return
    await pull()
  }

  const tick = () => void cycle()

  const onOnline = () => tick()
  const onOffline = () => setState('offline')
  const onVisible = () => {
    if (document.visibilityState === 'visible') tick()
  }

  window.addEventListener('online', onOnline)
  window.addEventListener('offline', onOffline)
  document.addEventListener('visibilitychange', onVisible)
  const timer = setInterval(tick, POLL_INTERVAL_MS)

  return {
    ready: cycle(),
    stop: () => {
      stopped = true
      clearInterval(timer)
      window.removeEventListener('online', onOnline)
      window.removeEventListener('offline', onOffline)
      document.removeEventListener('visibilitychange', onVisible)
    },
  }
}
