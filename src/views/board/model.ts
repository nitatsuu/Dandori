import type { CSSProperties } from 'react'
import { labelColors, labelVar } from '../../lib/labels'
import { taskDate } from '../../db/types'
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
    const key = columnKey(taskDate(task))
    const list = groups.get(key)
    if (list) list.push(task)
    else groups.set(key, [task])
  }
  for (const list of groups.values()) list.sort((a, b) => a.position - b.position)
  return groups
}

/*
 * The other half of the same question: which tasks are *marked* in a column.
 * A task stands as a card on `taskDate` — its deadline when it has one — so a
 * start date on another day was drawn nowhere but the timeline and the card's
 * own field. Both dates have to be set and to differ: with one of them alone
 * the task already stands on the day it has, and on the same day the card and
 * the mark would be the same day said twice. A finished task is not marked —
 * the mark is there to catch work about to begin.
 */
export function groupStarts(tasks: Task[]): Map<string, Task[]> {
  const groups = new Map<string, Task[]>()
  for (const task of tasks) {
    const start = task.start_date
    if (task.done || start === null || task.due_date === null || start === task.due_date) continue
    const list = groups.get(start)
    if (list) list.push(task)
    else groups.set(start, [task])
  }
  /*
   * By the day the work falls due, so the thing that presses first stands
   * first. Not by `position`: that is a place inside one day column, and these
   * marks are gathered from as many columns as there are tasks — the numbers do
   * not compare, equal ones are the normal case, and reordering an unrelated
   * day would have shuffled the marks here. The title breaks a tie: it is not
   * an order of its own, it only has to come out the same on both devices and
   * after every reload, which the order the rows arrived in does not.
   */
  for (const list of groups.values()) {
    // The `??` never fires: a task with no deadline is not marked at all.
    list.sort((a, b) => order(a.due_date ?? '', b.due_date ?? '') || order(a.title, b.title))
  }
  return groups
}

/** Plain code-point order, so that it is the same order wherever it is asked for. */
function order(a: string, b: string): number {
  return a === b ? 0 : a < b ? -1 : 1
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

/** The first label's colour becomes the left stripe, and the whole card on a phone. */
export function accent(task: Task, labels: Label[]): CSSProperties {
  const first = labelColors(task, labels)[0]
  // A task with no label gets `--card-plain`, which the board sets to the card's own
  // border on a wide screen — an accent equal to the border reads as no accent — and
  // to a visible grey on a phone, where the compact card *is* the stripe and a
  // border-coloured one would leave the task looking like an empty cell.
  return { '--card-accent': first ? labelVar(first) : 'var(--card-plain)' } as CSSProperties
}
