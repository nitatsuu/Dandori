import { useEffect, useMemo, useRef, useState } from 'react'
import { addDays, dayLabel, diffDays, monthNameNominative } from '../db/dates'
import { useToday } from '../state/useToday'
import { useTimelineZoom } from '../state/ui'
import type { ID, ISODate, Label, Task } from '../db/types'
import { Axis } from './timeline/Axis'
import {
  buildRows,
  buildScale,
  dayWidth,
  midOf,
  rangeLabel,
  xOf,
  type Cell,
  type Row,
  type Scale,
} from './timeline/model'
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
/** Below this width the day numbers run together — only week starts keep a label. */
const DAY_LABEL_W = 20
/** A narrow bracket cannot fit its label — only the boundary is left. */
const BRACKET_LABEL_W = 56
const NAME_W = 184
const NAME_W_COMPACT = 116
const COMPACT_W = 620
/** Room for the vertical scrollbar, otherwise the scale scrolls itself sideways. */
const GUTTER = 10
/** How far the track may run before the scale coarsens its step: one screen. */
const SCREENS = 1
/** Callout levels of the axis. Fewer on a narrow screen: the axis must stay short. */
const AXIS_LEVELS = 3
const AXIS_LEVELS_COMPACT = 2
/** A bar of a single day would otherwise vanish once the step is a month. */
const MIN_BAR_W = 5

/** Every dated task on one scale: where it starts, where the deadline is, what is overdue. */
export function Timeline({ tasks, labels, onOpenTask }: TimelineProps) {
  const now = useToday()
  const rootRef = useRef<HTMLDivElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(0)

  useEffect(() => {
    const el = rootRef.current
    if (!el) return
    // Column width is derived from the container, so watch the root element's size.
    const ro = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const rows = useMemo(() => buildRows(tasks, labels, now), [tasks, labels, now])
  const span = useMemo(() => spanOf(rows, now), [rows, now])
  const [zoom, setZoom] = useTimelineZoom()

  const compact = width > 0 && width < COMPACT_W
  const nameW = compact ? NAME_W_COMPACT : NAME_W
  const free = Math.max(240, width - nameW - GUTTER)
  /*
   * A phone has no range to choose from and no switch to choose with: 400 px
   * cannot hold a year of anything, so it is always the month — readable days,
   * and the rest of the scale reached the way everything is reached there, by
   * scrolling. A choice made on the laptop does not leak into it either.
   */
  const range = compact ? 'month' : zoom
  const scale = useMemo(
    () => buildScale(span.from, span.to, free, free * SCREENS, range),
    [span, free, range],
  )

  /*
   * A scale wider than the screen opens around today — and comes back to it when
   * the range is switched, which is the one moment the old scroll position means
   * nothing. Data changing under a scale the user has scrolled away from does not
   * count: that would yank the view out from under them.
   */
  const centred = useRef<string | null>(null)
  useEffect(() => {
    const el = scrollRef.current
    if (!el || width === 0 || centred.current === range) return
    centred.current = range
    if (el.scrollWidth <= el.clientWidth) return
    el.scrollLeft = nameW + midOf(scale, now) - el.clientWidth / 2
  }, [width, range, nameW, scale, now])

  const vars = {
    '--tl-name-w': `${nameW}px`,
    '--tl-cell-w': `${scale.cellW}px`,
    '--tl-track-w': `${scale.trackW}px`,
    // Vertical tiling of the rows: one line per week of days, or per column.
    '--tl-tile-w': `${scale.unit === 'day' ? scale.cellW * 7 : scale.cellW}px`,
    '--tl-tile-x': `calc(var(--tl-name-w) + ${firstTileOffset(scale)}px)`,
  } as React.CSSProperties

  return (
    <div className="timeline" ref={rootRef} style={vars}>
      <div className="timeline__scroll" ref={scrollRef}>
        <div className="timeline__grid">
          <div className="timeline__head">
            <div className="timeline__corner" />
            <div className="timeline__head-track">
              <div className="timeline__months">
                {scale.brackets.map((b) => (
                  <div
                    key={b.key}
                    className="timeline__month"
                    style={{ gridColumn: `${b.start + 1} / span ${b.span}` }}
                  >
                    {b.span * scale.cellW >= BRACKET_LABEL_W ? b.label : ''}
                  </div>
                ))}
              </div>
              <div className="timeline__days">
                {scale.cells.map((c) => (
                  <div key={c.date} className={cellClass(c)} title={dayLabel(c.date)}>
                    {cellLabel(c, scale)}
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="timeline__rows">
            <div
              className="timeline__today"
              style={{ left: `calc(var(--tl-name-w) + ${midOf(scale, now)}px)` }}
            />
            {rows.map((row) => (
              <TimelineRow key={row.task.id} row={row} scale={scale} onOpen={onOpenTask} />
            ))}
          </div>

          <Axis
            rows={rows}
            scale={scale}
            levels={compact ? AXIS_LEVELS_COMPACT : AXIS_LEVELS}
            today={now}
            zoom={compact ? null : zoom}
            onZoom={setZoom}
            onOpen={onOpenTask}
          />
        </div>
      </div>
    </div>
  )
}

function TimelineRow({
  row,
  scale,
  onOpen,
}: {
  row: Row
  scale: Scale
  onOpen: (id: ID) => void
}) {
  const { task } = row
  const range = rangeLabel(row)

  const classes = ['timeline__row']
  if (row.overdue) classes.push('timeline__row--overdue')

  // The bar covers whole days, so it reaches to the far edge of the last one.
  const left = xOf(scale, row.from)
  const right = xOf(scale, row.to) + dayWidth(scale, row.to)

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
          <div className="timeline__dot" style={{ left: `${midOf(scale, row.from)}px` }} />
        ) : (
          <div
            className="timeline__bar"
            style={{ left: `${left}px`, width: `${Math.max(MIN_BAR_W, right - left)}px` }}
          />
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
function spanOf(rows: Row[], now: ISODate): { from: ISODate; to: ISODate } {
  let min = now
  let max = now
  for (const r of rows) {
    if (r.from < min) min = r.from
    if (r.to > max) max = r.to
  }

  let from = addDays(min, -PAD_DAYS)
  let to = addDays(max, PAD_DAYS)

  const month = addDays(now, MIN_SPAN_DAYS)
  if (to < month) to = month

  if (diffDays(from, to) > MAX_SPAN_DAYS) {
    const anchor = addDays(now, -Math.floor(MAX_SPAN_DAYS / 2))
    if (anchor > from) from = anchor
    to = addDays(from, MAX_SPAN_DAYS)
  }
  return { from, to }
}

/** Where the first tiling line falls: on the first Monday, or on the first column. */
function firstTileOffset(scale: Scale): number {
  if (scale.unit !== 'day') return 0
  const at = scale.cells.findIndex((c) => c.week)
  return at < 0 ? 0 : at * scale.cellW
}

function cellLabel(cell: Cell, scale: Scale): string {
  if (scale.unit === 'month') return monthNameNominative(cell.date).slice(0, 3).toLowerCase()
  if (scale.unit === 'week') return String(Number(cell.date.slice(8)))
  return scale.cellW >= DAY_LABEL_W || cell.week ? String(Number(cell.date.slice(8))) : ''
}

function cellClass(cell: Cell): string {
  const classes = ['timeline__day']
  if (cell.week) classes.push('timeline__day--week')
  if (cell.bracket) classes.push('timeline__day--month')
  if (cell.weekend) classes.push('timeline__day--weekend')
  if (cell.today) classes.push('timeline__day--today')
  return classes.join(' ')
}
