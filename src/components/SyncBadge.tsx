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
 * Единственный индикатор состояния сети. Показывается только когда
 * что-то не в порядке или идёт обмен: в спокойном состоянии шапка чистая.
 */
export function SyncBadge() {
  const [state, setState] = useState<SyncState>(getSyncState)

  useEffect(() => onSyncState(setState), [])

  if (state === 'idle') return null

  return <span className={`sync sync--${state}`} title={TITLES[state]} aria-label={TITLES[state]} />
}
