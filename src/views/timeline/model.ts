import { dayLabel, isWeekend, monthLabel, startOfWeek } from '../../db/dates'
import type { ISODate, Label, Task } from '../../db/types'
import { labelVar, taskLabels } from '../../lib/labels'

/*
 * Shared by both halves of the timeline: the rows with names and the axis
 * pinned at the bottom. Both draw the same tasks on the same scale, so the
 * geometry of a task is computed once, here.
 */

/** A task with no label has no colour of its own. */
export const NEUTRAL = 'var(--text-faint)'

export interface Row {
  task: Task
  /** Left edge of the bar. */
  from: ISODate
  /** Right edge of the bar. */
  to: ISODate
  /** Where the axis puts the dot: the deadline, or the start when there is none. */
  point: ISODate
  /** A single date — draw a milestone instead of a bar. */
  milestone: boolean
  color: string
  overdue: boolean
}

/** Every dated task, sorted left to right. Tasks with no dates drop out. */
export function buildRows(tasks: Task[], labels: Label[], now: ISODate): Row[] {
  const rows: Row[] = []

  for (const task of tasks) {
    const s = task.start_date
    const d = task.due_date
    const single = s ?? d
    if (!single) continue

    const [label] = taskLabels(task, labels)
    // The task dialog allows a deadline before the start: draw by the actual edges.
    rows.push({
      task,
      from: s && d ? (s < d ? s : d) : single,
      to: s && d ? (s < d ? d : s) : single,
      point: d ?? single,
      milestone: !s || !d,
      color: label ? labelVar(label.color) : NEUTRAL,
      overdue: d !== null && !task.done && d < now,
    })
  }

  rows.sort(
    (a, b) =>
      a.from.localeCompare(b.from) ||
      a.to.localeCompare(b.to) ||
      a.task.title.localeCompare(b.task.title),
  )
  return rows
}

/** Dates of a row as one string — goes into the tooltip on the bar. */
export function rangeLabel(row: Row): string {
  return row.milestone ? dayLabel(row.from) : `${dayLabel(row.from)} — ${dayLabel(row.to)}`
}

export function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v))
}

export interface Cell {
  date: ISODate
  week: boolean
  month: boolean
  weekend: boolean
}

export interface Month {
  key: string
  start: number
  span: number
  label: string
}

/** Day cells and month runs of the scale — the day header and the axis share them. */
export function buildGrid(days: ISODate[]): { cells: Cell[]; months: Month[]; weekOffset: number } {
  const cells: Cell[] = days.map((date) => ({
    date,
    week: startOfWeek(date) === date,
    month: date.endsWith('-01'),
    weekend: isWeekend(date),
  }))

  const months: Month[] = []
  days.forEach((date, i) => {
    const key = date.slice(0, 7)
    const last = months.at(-1)
    if (last && last.key === key) last.span += 1
    else months.push({ key, start: i, span: 1, label: monthLabel(date) })
  })

  return { cells, months, weekOffset: Math.max(0, cells.findIndex((c) => c.week)) }
}
