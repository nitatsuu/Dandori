import { useCallback, useEffect, useState } from 'react'
import type { ID } from '../db/types'

/*
 * UI settings. They live in localStorage and deliberately do not sync: which tab
 * is open and which theme is picked is each device's own business.
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
    // Private mode or storage blocked — the setting just won't survive a reload.
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

// --------------------------------------------------------------------- tabs

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

// ---------------------------------------------------------------- board mode

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

// --------------------------------------------------------------------- theme

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

// --------------------------------------------------------------- workspaces

export function useCurrentWorkspace(available: ID[] | undefined) {
  const [chosen, setChosen] = useState<ID | null>(() => read(KEYS.workspace))

  // The stored workspace may be gone: deleted here or on another device.
  // Fall back to the first available one during render, to save an extra pass.
  const id = !available ? chosen : chosen && available.includes(chosen) ? chosen : available[0] ?? null

  // Remember the workspace we fell back to, so the next launch opens the same one.
  useEffect(() => {
    if (id) write(KEYS.workspace, id)
  }, [id])

  const select = useCallback((next: ID) => {
    setChosen(next)
    write(KEYS.workspace, next)
  }, [])

  return [id, select] as const
}
