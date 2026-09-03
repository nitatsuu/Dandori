import type { CSSProperties } from 'react'
import type { ISODate, Label, LabelColor, Task } from '../../db/types'

/*
 * Общее для всех режимов доски: колонка — это день.
 * Задачи без даты живут в отдельной колонке с ключом NO_DATE:
 * в Map отсутствие ключа и `null` не различить.
 */

export const NO_DATE = 'nodate'

const COLUMN_PREFIX = 'col:'

export const NO_TASKS: Task[] = []

export function columnKey(date: ISODate | null): string {
  return date ?? NO_DATE
}

export function columnId(date: ISODate | null): string {
  return COLUMN_PREFIX + columnKey(date)
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

export function labelColors(task: Task, labels: Label[]): LabelColor[] {
  return task.label_ids.flatMap((id) => {
    const label = labels.find((l) => l.id === id)
    return label ? [label.color] : []
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
  return { '--card-accent': first ? `var(--label-${first})` : 'var(--border)' } as CSSProperties
}
