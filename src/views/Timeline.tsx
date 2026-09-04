import { useEffect, useMemo, useRef, useState } from 'react'
import { addDays, dateRange, dayLabel, diffDays } from '../db/dates'
import { useToday } from '../state/useToday'
import type { ID, ISODate, Label, Task } from '../db/types'
import { Axis } from './timeline/Axis'
import { buildGrid, buildRows, clamp, rangeLabel, type Cell, type Row } from './timeline/model'
import './Timeline.css'

export interface TimelineProps {
  /** Already filtered by label. */
  tasks: Task[]
  labels: Label[]
  onOpenTask: (id: ID) => void
}

/** Padding at the edges so the outermost bars do not butt against the scale border. */
const PAD_DAYS = 3
/** A short scale looks truncated: always show at least a month ahead of today. */
const MIN_SPAN_DAYS = 30
/** Guard against an outlier date: the scale must not unfold into tens of thousands of columns. */
const MAX_SPAN_DAYS = 1830
const MIN_DAY_W = 6
const MIN_DAY_W_COMPACT = 20
const MAX_DAY_W = 44
/** Below this width the day numbers run together — only week starts keep a label. */
const DAY_LABEL_W = 20
/** A narrow month cannot fit its label — only the boundary is left. */
const MONTH_LABEL_W = 56
const NAME_W = 184
const NAME_W_COMPACT = 116
const COMPACT_W = 620
/** Room for the vertical scrollbar, otherwise the scale scrolls itself sideways. */
const GUTTER = 10
/** Callout levels of the axis. Fewer on a narrow screen: the axis must stay short. */
const AXIS_LEVELS = 3
const AXIS_LEVELS_COMPACT = 2

/** Every dated task on one scale: where it starts, where the deadline is, what is overdue. */
export function Timeline({ tasks, labels, onOpenTask }: TimelineProps) {
  const now = useToday()
  const rootRef = useRef<HTMLDivElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(0)

  useEffect(() => {
    const el = rootRef.current
    if (!el) return
    // Day width is derived from the container, so watch the root element's size.
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

  // On a phone the scale is wider than the screen — open around today.
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

          <Axis
            rows={rows}
            cells={cells}
            months={months}
            levels={compact ? AXIS_LEVELS_COMPACT : AXIS_LEVELS}
            first={days[0]}
            count={days.length}
            dayW={dayW}
            trackW={trackW}
            todayIndex={todayIndex}
            onOpen={onOpenTask}
          />
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
  // The scale may have been clipped to MAX_SPAN_DAYS — then the bar sticks to the edge.
  const start = clamp(diffDays(first, row.from), 0, count - 1)
  const end = clamp(diffDays(first, row.to), 0, count - 1)
  const span = end - start + 1
  const range = rangeLabel(row)

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

// ----------------------------------------------------------------- calculations

/**
 * Range of the scale: from the earliest date to the latest, with today always
 * inside it and the right edge no closer than a month away from today.
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

function fitDayWidth(raw: number, min: number): number {
  // A fractional width is fine, but round it — otherwise drift from the grid piles up.
  const w = Math.floor(raw * 100) / 100
  return Math.min(MAX_DAY_W, Math.max(min, w))
}

function dayClass(cell: Cell, isToday: boolean): string {
  const classes = ['timeline__day']
  if (cell.week) classes.push('timeline__day--week')
  if (cell.month) classes.push('timeline__day--month')
  if (cell.weekend) classes.push('timeline__day--weekend')
  if (isToday) classes.push('timeline__day--today')
  return classes.join(' ')
}
