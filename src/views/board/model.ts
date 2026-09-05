import type { CSSProperties } from 'react'
import { labelColors, labelVar } from '../../lib/labels'
import type { ISODate, Label, Task } from '../../db/types'

/*
 * Shared by every board mode: a column is a day.
 * Tasks with no date live in their own column keyed by NO_DATE —
 * a Map cannot tell a missing key from a `null` one.
 */

export const NO_DATE = 'nodate'

const COLUMN_PREFIX = 'col:'

export function columnKey(date: ISODate | null): string {
  return date ?? NO_DATE
}

function columnIdOf(key: string): string {
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
