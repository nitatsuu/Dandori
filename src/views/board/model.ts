import type { CSSProperties } from 'react'
import { labelColors, labelVar } from '../../lib/labels'
import type { ISODate, Label, Task } from '../../db/types'

/*
 * Общее для всех режимов доски: колонка — это день.
 * Задачи без даты живут в отдельной колонке с ключом NO_DATE:
 * в Map отсутствие ключа и `null` не различить.
 */

export const NO_DATE = 'nodate'

/**
 * Закреплённая колонка с просроченным. Своей даты у неё нет:
 * задачи лежат каждая со своей, поэтому дропы в неё не принимаются.
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

/** Ключ колонки из идентификатора droppable, либо `null`, если это не колонка. */
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

/** Просроченное, кроме дней, которые и так показаны колонками: там задача уже видна. */
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

/** Цвет первой метки уходит в полоску слева, а на телефоне красит всю карточку. */
export function accent(task: Task, labels: Label[]): CSSProperties {
  const first = labelColors(task, labels)[0]
  return { '--card-accent': first ? labelVar(first) : 'var(--border)' } as CSSProperties
}
