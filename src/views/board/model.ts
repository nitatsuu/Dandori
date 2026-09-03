import type { CSSProperties } from 'react'
import { labelColors, labelVar } from '../../lib/labels'
import type { ISODate, Label, Task } from '../../db/types'

/*
 * Shared by every board mode: a column is a day.
 * Tasks with no date live in their own column keyed by NO_DATE —
 * a Map cannot tell a missing key from a `null` one.
 */

export const NO_DATE = 'nodate'

/**
 * The pinned overdue column. It has no date of its own — every task in it keeps
 * its original one — so drops into it are rejected.
 */
export const OVERDUE = 'overdue'

const COLUMN_PREFIX = 'col:'

export function columnKey(date: ISODate | null): string {
  return date ?? NO_DATE
}

export function columnIdOf(key: string): string {
  return COLUMN_PREFIX + key
}

export function columnId(date: ISODate | null): string {
  return columnIdOf(columnKey(date))
}

/** Column key from a droppable id, or `null` when the id is not a column. */
export function keyFromColumnId(id: string): string | null {
  return id.startsWith(COLUMN_PREFIX) ? id.slice(COLUMN_PREFIX.length) : null
}

export function dateFromKey(key: string): ISODate | null {
  return key === NO_DATE ? null : key
}

export function groupByDay(tasks: Task[]): Map<string, Task[]> {
  const groups = new Map<string, Task[]>()
  for (const task of tasks) {
    const key = columnKey(task.due_date)
    const list = groups.get(key)
    if (list) list.push(task)
    else groups.set(key, [task])
  }
  for (const list of groups.values()) list.sort((a, b) => a.position - b.position)
  return groups
}

export function isOverdue(task: Task, today: ISODate): boolean {
  return !task.done && task.due_date !== null && task.due_date < today
}

/** Overdue tasks, minus the days the window already shows as columns. */
export function collectOverdue(
  groups: Map<string, Task[]>,
  today: ISODate,
  shown: ISODate[],
): Task[] {
  const visible = new Set(shown)
  const out: Task[] = []

  for (const [key, list] of groups) {
    if (key === NO_DATE || key >= today || visible.has(key)) continue
    for (const task of list) if (!task.done) out.push(task)
  }

  return out.sort((a, b) => {
    const x = a.due_date ?? ''
    const y = b.due_date ?? ''
    if (x !== y) return x < y ? -1 : 1
    return a.position - b.position
  })
}

export function cardClass(
  task: Task,
  opts: { compact?: boolean; dragging?: boolean; overlay?: boolean } = {},
): string {
  return [
    'board__card',
    task.done ? 'board__card--done' : '',
    opts.compact ? 'board__card--compact' : '',
    opts.dragging ? 'board__card--dragging' : '',
    opts.overlay ? 'board__card--overlay' : '',
  ]
    .filter(Boolean)
    .join(' ')
}

/** The first label's colour becomes the left stripe, and tints the whole card on a phone. */
export function accent(task: Task, labels: Label[]): CSSProperties {
  const first = labelColors(task, labels)[0]
  return { '--card-accent': first ? labelVar(first) : 'var(--border)' } as CSSProperties
}
