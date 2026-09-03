import { useEffect, useState } from 'react'
import { getSyncState, onSyncState, type SyncState } from '../sync/sync'
import './SyncBadge.css'

const TITLES: Record<SyncState, string> = {
  idle: 'Всё сохранено',
  syncing: 'Синхронизация…',
  offline: 'Офлайн, изменения сохранятся локально',
  error: 'Не удалось синхронизироваться',
}

/**
 * The only network state indicator. It shows up only when something is wrong or
 * an exchange is in progress: while everything is calm the header stays clean.
 */
export function SyncBadge() {
  const [state, setState] = useState<SyncState>(getSyncState)

  useEffect(() => onSyncState(setState), [])

  if (state === 'idle') return null

  return <span className={`sync sync--${state}`} title={TITLES[state]} aria-label={TITLES[state]} />
}
