import { useCallback, useEffect, useState } from 'react'
import type { ID } from '../db/types'

/*
 * Настройки интерфейса. Живут в localStorage и намеренно не синхронизируются:
 * какая вкладка открыта и какая тема выбрана — дело конкретного устройства.
 */

const KEYS = {
  workspace: 'dandori.workspace',
  tab: 'dandori.tab',
  theme: 'dandori.theme',
  boardMode: 'dandori.boardMode',
} as const

function read(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

function write(key: string, value: string): void {
  try {
    localStorage.setItem(key, value)
  } catch {
    // Приватный режим или запрет на хранение — настройка просто не переживёт перезагрузку.
  }
}

function usePersisted<T extends string>(key: string, fallback: T, allowed: readonly T[]) {
  const [value, setValue] = useState<T>(() => {
    const stored = read(key) as T | null
    return stored && allowed.includes(stored) ? stored : fallback
  })

  const set = useCallback(
    (next: T) => {
      setValue(next)
      write(key, next)
    },
    [key],
  )

  return [value, set] as const
}

// ------------------------------------------------------------------ вкладки

export const TABS = ['board', 'timeline', 'notes'] as const
export type Tab = (typeof TABS)[number]

export const TAB_TITLES: Record<Tab, string> = {
  board: 'Доска',
  timeline: 'Таймлайн',
  notes: 'Заметки',
}

export function useTab() {
  return usePersisted<Tab>(KEYS.tab, 'board', TABS)
}

// --------------------------------------------------------------- режим доски

export const BOARD_MODES = ['days', 'ribbon', 'month'] as const
export type BoardMode = (typeof BOARD_MODES)[number]

export const BOARD_MODE_TITLES: Record<BoardMode, string> = {
  days: '14 дней',
  ribbon: 'Лента',
  month: 'Месяц',
}

export function useBoardMode() {
  return usePersisted<BoardMode>(KEYS.boardMode, 'days', BOARD_MODES)
}

// ---------------------------------------------------------------------- тема

export const THEMES = ['system', 'light', 'dark'] as const
export type Theme = (typeof THEMES)[number]

export function useTheme() {
  const [theme, setTheme] = usePersisted<Theme>(KEYS.theme, 'system', THEMES)

  useEffect(() => {
    const root = document.documentElement
    if (theme === 'system') root.removeAttribute('data-theme')
    else root.setAttribute('data-theme', theme)
  }, [theme])

  return [theme, setTheme] as const
}

// --------------------------------------------------------------- воркспейсы

export function useCurrentWorkspace(available: ID[] | undefined) {
  const [chosen, setChosen] = useState<ID | null>(() => read(KEYS.workspace))

  // Сохранённого воркспейса может уже не быть: удалён здесь или на другом устройстве.
  // Подставляем первый доступный прямо при рендере, чтобы не гонять лишний проход.
  const id = !available ? chosen : chosen && available.includes(chosen) ? chosen : available[0] ?? null

  // Подставленный воркспейс запоминается, чтобы следующий запуск открыл его же.
  useEffect(() => {
    if (id) write(KEYS.workspace, id)
  }, [id])

  const select = useCallback((next: ID) => {
    setChosen(next)
    write(KEYS.workspace, next)
  }, [])

  return [id, select] as const
}
