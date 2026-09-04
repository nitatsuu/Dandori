import { useMemo } from 'react'
import { diffDays } from '../../db/dates'
import type { ID, ISODate } from '../../db/types'
import { clamp, rangeLabel, type Row } from './model'

/*
 * One line with every task on it at once, pinned to the bottom edge of the tab.
 * It lives inside the same scroller as the rows above, so the horizontal
 * position of the two halves can never drift apart.
 *
 * Bars overlap, and there are no rows to separate them. Two things keep them
 * apart without turning the strip into a second chart: a small vertical shift
 * inside the single band (TIERS sub-lanes, BAR_STEP apart) and a thin rim in
 * the background colour around every bar.
 */

/** Sub-lanes inside the one line. Three is enough to read a dense week apart. */
const TIERS = 3
/** A milestone has no span: it always takes the same dot. */
const DOT_W = 11
/** Breathing room between two neighbours of the same sub-lane. */
const GAP = 4
/** A preview narrower than this is one ellipsis and nothing else — drop it. */
const MIN_PREVIEW_W = 34
/** A short bar still deserves a readable preview, if the neighbour leaves room. */
const PREVIEW_W = 96

interface Mark {
  row: Row
  tier: number
  left: number
  width: number
  /** Width of the preview, or 0 when there is no room for one. */
  preview: number
}

export interface SummaryStripProps {
  rows: Row[]
  /** First day of the scale. */
  first: ISODate
  /** Number of days on the scale. */
  count: number
  dayW: number
  trackW: number
  todayIndex: number
  onOpen: (id: ID) => void
}

export function SummaryStrip({
  rows,
  first,
  count,
  dayW,
  trackW,
  todayIndex,
  onOpen,
}: SummaryStripProps) {
  const marks = useMemo(
    () => pack(rows, first, count, dayW, trackW),
    [rows, first, count, dayW, trackW],
  )

  return (
    <div className="timeline__strip">
      <div className="timeline__strip-cap" />
      <div className="timeline__strip-track">
        <div
          className="timeline__strip-today"
          style={{ left: `calc(var(--tl-day-w) * ${todayIndex} + var(--tl-day-w) / 2)` }}
        />
        {marks.map((mark) => (
          <StripMark key={mark.row.task.id} mark={mark} onOpen={onOpen} />
        ))}
      </div>
    </div>
  )
}

function StripMark({ mark, onOpen }: { mark: Mark; onOpen: (id: ID) => void }) {
  const { row } = mark
  const { task } = row
  const title = `${task.title} · ${rangeLabel(row)}`

  const classes = ['timeline__mark']
  if (task.done) classes.push('timeline__mark--done')
  if (row.overdue) classes.push('timeline__mark--overdue')

  const style = {
    '--tl-color': row.color,
    '--tl-tier': mark.tier,
    left: `${mark.left}px`,
  } as React.CSSProperties

  // The same task twice on one screen: the rows above already take the keyboard,
  // so the strip stays out of the tab order and only answers the pointer.
  return (
    <div className={classes.join(' ')} style={style}>
      {mark.preview > 0 && (
        <button
          type="button"
          className="timeline__mark-name"
          style={{ width: `${mark.preview}px` }}
          tabIndex={-1}
          title={title}
          onClick={() => onOpen(task.id)}
        >
          {task.title}
        </button>
      )}
      <button
        type="button"
        className={row.milestone ? 'timeline__mark-dot' : 'timeline__mark-bar'}
        style={{ width: `${mark.width}px` }}
        tabIndex={-1}
        title={title}
        aria-label={title}
        onClick={() => onOpen(task.id)}
      />
    </div>
  )
}

/**
 * Lays the rows out on the single line: a sub-lane and a preview width for each.
 * `rows` are sorted by start date, so one pass left to right is enough.
 */
function pack(rows: Row[], first: ISODate, count: number, dayW: number, trackW: number): Mark[] {
  const marks: Mark[] = []
  // Right edge already taken in every sub-lane.
  const ends = new Array<number>(TIERS).fill(Number.NEGATIVE_INFINITY)

  for (const row of rows) {
    // The scale may have been clipped to its maximum — then the bar sticks to the edge.
    const start = clamp(diffDays(first, row.from), 0, count - 1)
    const end = clamp(diffDays(first, row.to), 0, count - 1)
    const width = row.milestone ? DOT_W : (end - start + 1) * dayW
    const left = row.milestone ? start * dayW + (dayW - DOT_W) / 2 : start * dayW

    let tier = ends.findIndex((e) => e + GAP <= left)
    // Everything is busy: take the sub-lane that frees up first and let them overlap.
    if (tier < 0) tier = ends.indexOf(Math.min(...ends))
    ends[tier] = left + width

    marks.push({ row, tier, left, width, preview: 0 })
  }

  // Second pass: a preview may run past its own bar, but never into the next
  // preview of the same sub-lane.
  const last = new Array<Mark | null>(TIERS).fill(null)
  for (let i = marks.length - 1; i >= 0; i--) {
    const mark = marks[i]
    const next = last[mark.tier]
    const room = (next ? next.left - GAP : trackW) - mark.left
    if (room >= MIN_PREVIEW_W) mark.preview = Math.min(Math.max(mark.width, PREVIEW_W), room)
    last[mark.tier] = mark
  }

  return marks
}
