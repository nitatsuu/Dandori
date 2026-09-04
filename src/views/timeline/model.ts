import {
  addDays,
  addMonths,
  dayLabel,
  diffDays,
  isWeekend,
  monthLabel,
  startOfMonth,
  startOfWeek,
  today,
} from '../../db/dates'
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

/**
 * Every dated task, sorted left to right. Tasks with no dates drop out, and so
 * do the finished ones: the tab is for the deadlines still ahead, and a season
 * of completed work buries them.
 */
export function buildRows(tasks: Task[], labels: Label[], now: ISODate): Row[] {
  const rows: Row[] = []

  for (const task of tasks) {
    if (task.done) continue
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
      overdue: d !== null && d < now,
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

/*
 * The scale.
 *
 * A column is a day only while days are wide enough to read. Past that the step
 * grows to a week and then to a month: a grant two years out used to squeeze the
 * days down to hairlines, and the whole point of the tab is to take in every
 * deadline at once. Dates keep their exact place inside a column, so nothing is
 * rounded to the step — only the labels and the grid become coarser.
 */
export type Unit = 'day' | 'week' | 'month'

interface Step {
  unit: Unit
  /** Below this a column is not worth drawing. */
  min: number
  /** Above this the columns look stretched. */
  max: number
}

const STEPS: Step[] = [
  { unit: 'day', min: 14, max: 44 },
  { unit: 'week', min: 26, max: 120 },
  { unit: 'month', min: 46, max: 200 },
]

/** Days «Месяц» puts across the screen. The rest of the scale is reached by scrolling. */
const ZOOM_DAYS = 31

export interface Cell {
  /** First date of the column. */
  date: ISODate
  /** Days it covers — a month is not a fixed number of them. */
  days: number
  /** Days from the start of the scale to the start of the column. */
  offset: number
  /** Opens a new bracket: a month above days and weeks, a year above months. */
  bracket: boolean
  /** Day step only. */
  weekend: boolean
  week: boolean
  today: boolean
}

/** A run of columns under one label: a month over days and weeks, a year over months. */
export interface Bracket {
  key: string
  label: string
  start: number
  span: number
}

export interface Scale {
  unit: Unit
  /** First date of the scale — the step boundary at or before the earliest date. */
  first: ISODate
  /** Days the scale covers. */
  days: number
  cells: Cell[]
  brackets: Bracket[]
  cellW: number
  trackW: number
  /** Column index of every day of the scale. */
  cellOfDay: number[]
}

/**
 * Picks the step and lays the columns out.
 *
 * `budget` is how wide the track may grow before the step has to coarsen: a
 * laptop asks the scale to fit, a phone tolerates a few screens of scrolling.
 *
 * «Месяц» ignores all that and keeps days at a size where a month fills the
 * screen: a cluster of deadlines a few days apart is unreadable on a scale that
 * spans a year, and dropping the far tasks to make room would lose the very
 * overview the tab is for. Nothing is hidden — the scale just runs off the edge.
 */
export function buildScale(
  from: ISODate,
  to: ISODate,
  free: number,
  budget: number,
  zoom: 'all' | 'month',
): Scale {
  let step = STEPS[0]
  let cells = cellsOf(step.unit, from, to)

  if (zoom === 'all') {
    step = STEPS[STEPS.length - 1]
    cells = cellsOf(step.unit, from, to)

    for (const candidate of STEPS) {
      const laid = cellsOf(candidate.unit, from, to)
      if (laid.length * candidate.min <= budget) {
        step = candidate
        cells = laid
        break
      }
    }
  }

  const cellW =
    zoom === 'month'
      ? clamp(free / ZOOM_DAYS, step.min, step.max)
      : clamp(free / cells.length, step.min, step.max)
  const first = cells[0].date
  const days = cells.reduce((n, c) => n + c.days, 0)

  const cellOfDay = new Array<number>(days)
  for (const [i, cell] of cells.entries()) {
    for (let d = 0; d < cell.days; d++) cellOfDay[cell.offset + d] = i
  }

  return {
    unit: step.unit,
    first,
    days,
    cells,
    brackets: bracketsOf(step.unit, cells),
    cellW,
    trackW: cellW * cells.length,
    cellOfDay,
  }
}

function cellsOf(unit: Unit, from: ISODate, to: ISODate): Cell[] {
  const now = today()
  const start = unit === 'day' ? from : unit === 'week' ? startOfWeek(from) : startOfMonth(from)
  const cells: Cell[] = []
  let date = start
  let offset = 0

  while (date <= to) {
    const days = unit === 'day' ? 1 : unit === 'week' ? 7 : diffDays(date, addMonths(date, 1))
    const next = addDays(date, days)
    cells.push({
      date,
      days,
      offset,
      bracket: unit === 'month' ? date.endsWith('-01-01') : date.endsWith('-01'),
      weekend: unit === 'day' && isWeekend(date),
      week: unit === 'day' && startOfWeek(date) === date,
      today: now >= date && now < next,
    })
    offset += days
    date = next
  }

  // The first column opens its own bracket whatever the calendar says.
  if (cells.length > 0) cells[0].bracket = true
  return cells
}

function bracketsOf(unit: Unit, cells: Cell[]): Bracket[] {
  const brackets: Bracket[] = []

  for (const [i, cell] of cells.entries()) {
    const key = unit === 'month' ? cell.date.slice(0, 4) : cell.date.slice(0, 7)
    const last = brackets.at(-1)
    if (last && last.key === key) last.span += 1
    else {
      brackets.push({
        key,
        label: unit === 'month' ? key : monthLabel(cell.date),
        start: i,
        span: 1,
      })
    }
  }

  return brackets
}

/** Left edge of a date on the track. */
export function xOf(scale: Scale, date: ISODate): number {
  const day = clamp(diffDays(scale.first, date), 0, scale.days - 1)
  const index = scale.cellOfDay[day]
  const cell = scale.cells[index]
  return (index + (day - cell.offset) / cell.days) * scale.cellW
}

/** Width of one day at that point of the track. */
export function dayWidth(scale: Scale, date: ISODate): number {
  const day = clamp(diffDays(scale.first, date), 0, scale.days - 1)
  return scale.cellW / scale.cells[scale.cellOfDay[day]].days
}

/** Middle of a date on the track — where a dot sits. */
export function midOf(scale: Scale, date: ISODate): number {
  return xOf(scale, date) + dayWidth(scale, date) / 2
}
