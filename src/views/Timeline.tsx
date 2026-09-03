import { useEffect, useMemo, useRef, useState } from 'react'
import {
  addDays,
  dateRange,
  dayLabel,
  diffDays,
  isWeekend,
  monthLabel,
  startOfWeek,
} from '../db/dates'
import { useToday } from '../state/useToday'
import type { ID, ISODate, Label, Task } from '../db/types'
import { labelVar, taskLabels } from '../lib/labels'
import './Timeline.css'

export interface TimelineProps {
  /** Уже отфильтрованы по меткам. */
  tasks: Task[]
  labels: Label[]
  onOpenTask: (id: ID) => void
}

/** Запас по краям, чтобы крайние полоски не упирались в границу шкалы. */
const PAD_DAYS = 3
/** Короткая шкала выглядит обрезанной: показываем минимум месяц вперёд от сегодня. */
const MIN_SPAN_DAYS = 30
/** Страховка от даты-выброса: шкала не разворачивается на десятки тысяч колонок. */
const MAX_SPAN_DAYS = 1830
const MIN_DAY_W = 6
const MIN_DAY_W_COMPACT = 20
const MAX_DAY_W = 44
/** Уже этой ширины числа сливаются — остаются только начала недель. */
const DAY_LABEL_W = 20
/** Узкому месяцу подпись не влезает — остаётся только граница. */
const MONTH_LABEL_W = 56
const NAME_W = 184
const NAME_W_COMPACT = 116
const COMPACT_W = 620
/** Место под вертикальный скроллбар, иначе шкала сама себе устраивает скролл. */
const GUTTER = 10

const NEUTRAL = 'var(--text-faint)'

interface Row {
  task: Task
  /** Левый край полоски. */
  from: ISODate
  /** Правый край полоски. */
  to: ISODate
  /** Дата одна — рисуем веху, а не полоску. */
  milestone: boolean
  color: string
  overdue: boolean
}

interface Cell {
  date: ISODate
  week: boolean
  month: boolean
  weekend: boolean
}

interface Month {
  key: string
  start: number
  span: number
  label: string
}

/** Все задачи с датами на одной шкале: где начинается, где дедлайн, где просрочено. */
export function Timeline({ tasks, labels, onOpenTask }: TimelineProps) {
  const now = useToday()
  const rootRef = useRef<HTMLDivElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(0)

  useEffect(() => {
    const el = rootRef.current
    if (!el) return
    // Ширину дня считаем от контейнера, поэтому следим за его размером.
    const ro = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const rows = useMemo(() => buildRows(tasks, labels, now), [tasks, labels, now])
  const days = useMemo(() => buildScale(rows, now), [rows, now])
  const { cells, months, weekOffset } = useMemo(() => buildGrid(days), [days])

  const compact = width > 0 && width < COMPACT_W
  const nameW = compact ? NAME_W_COMPACT : NAME_W
  const minDayW = compact ? MIN_DAY_W_COMPACT : MIN_DAY_W
  const free = Math.max(0, width - nameW - GUTTER)
  const dayW = width === 0 ? minDayW : fitDayWidth(free / days.length, minDayW)
  const trackW = dayW * days.length
  const todayIndex = diffDays(days[0], now)

  // На телефоне шкала шире экрана — при открытии показываем окрестности сегодня.
  const scrolled = useRef(false)
  useEffect(() => {
    const el = scrollRef.current
    if (!el || scrolled.current || width === 0) return
    if (el.scrollWidth <= el.clientWidth) return
    scrolled.current = true
    el.scrollLeft = nameW + todayIndex * dayW - el.clientWidth / 2
  }, [width, nameW, dayW, todayIndex])

  const vars = {
    '--tl-name-w': `${nameW}px`,
    '--tl-day-w': `${dayW}px`,
    '--tl-track-w': `${trackW}px`,
    '--tl-week-offset': weekOffset,
  } as React.CSSProperties

  return (
    <div className="timeline" ref={rootRef} style={vars}>
      <div className="timeline__scroll" ref={scrollRef}>
        <div className="timeline__grid">
          <div className="timeline__head">
            <div className="timeline__corner" />
            <div className="timeline__head-track">
              <div className="timeline__months">
                {months.map((m) => (
                  <div
                    key={m.key}
                    className="timeline__month"
                    style={{ gridColumn: `${m.start + 1} / span ${m.span}` }}
                  >
                    {m.span * dayW >= MONTH_LABEL_W ? m.label : ''}
                  </div>
                ))}
              </div>
              <div className="timeline__days">
                {cells.map((c, i) => (
                  <div
                    key={c.date}
                    className={dayClass(c, i === todayIndex)}
                    title={dayLabel(c.date)}
                  >
                    {dayW >= DAY_LABEL_W || c.week ? Number(c.date.slice(8)) : ''}
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="timeline__rows">
            <div
              className="timeline__today"
              style={{
                left: `calc(var(--tl-name-w) + var(--tl-day-w) * ${todayIndex} + var(--tl-day-w) / 2)`,
              }}
            />
            {rows.map((row) => (
              <TimelineRow
                key={row.task.id}
                row={row}
                first={days[0]}
                count={days.length}
                onOpen={onOpenTask}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

function TimelineRow({
  row,
  first,
  count,
  onOpen,
}: {
  row: Row
  first: ISODate
  count: number
  onOpen: (id: ID) => void
}) {
  const { task } = row
  // Шкала могла быть подрезана по MAX_SPAN_DAYS — тогда полоска прижимается к краю.
  const start = clamp(diffDays(first, row.from), 0, count - 1)
  const end = clamp(diffDays(first, row.to), 0, count - 1)
  const span = end - start + 1
  const range = row.milestone ? dayLabel(row.from) : `${dayLabel(row.from)} — ${dayLabel(row.to)}`

  const classes = ['timeline__row']
  if (task.done) classes.push('timeline__row--done')
  if (row.overdue) classes.push('timeline__row--overdue')

  return (
    <div
      className={classes.join(' ')}
      style={{ '--tl-color': row.color } as React.CSSProperties}
      role="button"
      tabIndex={0}
      onClick={() => onOpen(task.id)}
      onKeyDown={(e) => {
        if (e.key !== 'Enter' && e.key !== ' ') return
        e.preventDefault()
        onOpen(task.id)
      }}
    >
      <div className="timeline__name" title={`${task.title} · ${range}`}>
        {task.title}
      </div>
      <div className="timeline__track">
        {row.milestone ? (
          <div className="timeline__dot" style={{ gridColumn: `${start + 1}` }} />
        ) : (
          <div className="timeline__bar" style={{ gridColumn: `${start + 1} / span ${span}` }} />
        )}
      </div>
    </div>
  )
}

// ------------------------------------------------------------------- подсчёты

function buildRows(tasks: Task[], labels: Label[], now: ISODate): Row[] {
  const rows: Row[] = []

  for (const task of tasks) {
    const s = task.start_date
    const d = task.due_date
    const single = s ?? d
    if (!single) continue

    const [label] = taskLabels(task, labels)
    // Дедлайн раньше начала карточка не запрещает: рисуем по фактическим краям.
    rows.push({
      task,
      from: s && d ? (s < d ? s : d) : single,
      to: s && d ? (s < d ? d : s) : single,
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

/**
 * Диапазон шкалы: от самой ранней даты до самой поздней, сегодня всегда внутри
 * и правый край не ближе месяца от него.
 */
function buildScale(rows: Row[], now: ISODate): ISODate[] {
  let min = now
  let max = now
  for (const r of rows) {
    if (r.from < min) min = r.from
    if (r.to > max) max = r.to
  }

  let start = addDays(min, -PAD_DAYS)
  let end = addDays(max, PAD_DAYS)

  const month = addDays(now, MIN_SPAN_DAYS)
  if (end < month) end = month

  if (diffDays(start, end) > MAX_SPAN_DAYS) {
    const anchor = addDays(now, -Math.floor(MAX_SPAN_DAYS / 2))
    if (anchor > start) start = anchor
    end = addDays(start, MAX_SPAN_DAYS)
  }
  return dateRange(start, end)
}

function buildGrid(days: ISODate[]): { cells: Cell[]; months: Month[]; weekOffset: number } {
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

function fitDayWidth(raw: number, min: number): number {
  // Дробная ширина допустима, но округляем — иначе накапливается расхождение с сеткой.
  const w = Math.floor(raw * 100) / 100
  return Math.min(MAX_DAY_W, Math.max(min, w))
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v))
}

function dayClass(cell: Cell, isToday: boolean): string {
  const classes = ['timeline__day']
  if (cell.week) classes.push('timeline__day--week')
  if (cell.month) classes.push('timeline__day--month')
  if (cell.weekend) classes.push('timeline__day--weekend')
  if (isToday) classes.push('timeline__day--today')
  return classes.join(' ')
}
