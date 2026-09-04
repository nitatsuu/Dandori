import { useMemo } from 'react'
import { TIMELINE_ZOOMS, TIMELINE_ZOOM_TITLES, type TimelineZoom } from '../../state/ui'
import type { ID, ISODate } from '../../db/types'
import { clamp, midOf, rangeLabel, type Row, type Scale } from './model'

/*
 * One horizontal axis with every deadline on it, pinned to the bottom edge of
 * the tab. It lives inside the same scroller as the rows above, so the two
 * scales can never drift apart.
 *
 * A dot is a deadline, not a duration: the length of a task is already shown by
 * the rows. The callout naming the dot is pulled to one side of the axis or the
 * other, alternating, which fits twice as many of them as a single side would.
 */

/** Rough width of one character of a callout — enough to place them without measuring. */
const CHAR_W = 6.2
const LABEL_PAD = 10
const MIN_LABEL_W = 44
const MAX_LABEL_W = 136
/** Free space kept between two callouts of the same level. */
const LABEL_GAP = 8
/** Dot diameter. Keep in step with .timeline__point. */
const DOT_W = 9
/** Deadlines a day or two apart: nudge the dot off the axis instead of burying it. */
const DOT_SLOTS = [0, -1, 1]
/** Below this distance between two centres the dots would fuse into one blob. */
const DOT_NEAR = DOT_W + 3
/** A bracket narrower than this cannot hold its label. */
const BRACKET_LABEL_W = 48

interface Mark {
  row: Row
  /** Centre of the dot, in pixels along the track. */
  x: number
  /** How far off the axis the dot sits, in steps. */
  slot: number
  /** 0 — above the axis, 1 — below it. */
  side: number
  level: number
  /** Left edge of the callout, relative to the dot. */
  dx: number
  /** Width of the callout; 0 when there was no room for one. */
  w: number
}

export interface AxisProps {
  rows: Row[]
  scale: Scale
  /** Callout levels available on each side of the axis; the height follows it. */
  levels: number
  today: ISODate
  /** `null` on a phone: there the scale is always scrolled, so there is nothing to switch. */
  zoom: TimelineZoom | null
  onZoom: (zoom: TimelineZoom) => void
  onOpen: (id: ID) => void
}

export function Axis({ rows, scale, levels, today, zoom, onZoom, onOpen }: AxisProps) {
  const marks = useMemo(() => place(rows, levels, scale), [rows, levels, scale])
  /*
   * Ticks are sparse. With a day step only the week starts get one, otherwise
   * every column would; with a week or a month step every column does, and the
   * bracket boundaries — a month, or a year over months — get the long tick.
   */
  const ticks = useMemo(
    () =>
      scale.cells.flatMap((c, i) =>
        c.bracket || scale.unit !== 'day' || c.week
          ? [{ date: c.date, x: i * scale.cellW, bracket: c.bracket }]
          : [],
      ),
    [scale],
  )

  return (
    <div className="timeline__axis" style={{ '--tl-lv-n': levels } as React.CSSProperties}>
      <div className={`timeline__axis-cap${zoom ? ' timeline__axis-cap--switch' : ''}`}>
        {zoom && (
          <div className="timeline__zoom">
            {TIMELINE_ZOOMS.map((z) => (
              <button
                key={z}
                className={`timeline__zoom-btn${z === zoom ? ' timeline__zoom-btn--on' : ''}`}
                onClick={() => onZoom(z)}
              >
                {TIMELINE_ZOOM_TITLES[z]}
              </button>
            ))}
          </div>
        )}
      </div>
      <div className="timeline__axis-track">
        <div className="timeline__axis-line" />

        {ticks.map((t) => (
          <div
            key={t.date}
            className={t.bracket ? 'timeline__tick timeline__tick--month' : 'timeline__tick'}
            style={{ left: `${t.x}px` }}
          />
        ))}

        {scale.brackets.map((b) =>
          b.span * scale.cellW >= BRACKET_LABEL_W ? (
            <div
              key={b.key}
              className="timeline__axis-month"
              style={{
                left: `${b.start * scale.cellW + 4}px`,
                maxWidth: `${b.span * scale.cellW - 6}px`,
              }}
            >
              {b.label}
            </div>
          ) : null,
        )}

        <div className="timeline__axis-today" style={{ left: `${midOf(scale, today)}px` }} />

        {marks.map((mark) => (
          <AxisMark key={mark.row.task.id} mark={mark} onOpen={onOpen} />
        ))}
      </div>
    </div>
  )
}

function AxisMark({ mark, onOpen }: { mark: Mark; onOpen: (id: ID) => void }) {
  const { row } = mark
  const { task } = row
  const title = `${task.title} · ${rangeLabel(row)}`

  const classes = ['timeline__mark', mark.side === 0 ? 'timeline__mark--up' : 'timeline__mark--down']
  if (task.done) classes.push('timeline__mark--done')
  if (row.overdue) classes.push('timeline__mark--overdue')

  const style = {
    '--tl-color': row.color,
    '--tl-lv': mark.level,
    '--tl-slot': mark.slot,
    left: `${mark.x}px`,
  } as React.CSSProperties

  // The same task twice on one screen: the rows above already hold the keyboard
  // order, so the axis answers the pointer only.
  return (
    <div className={classes.join(' ')} style={style}>
      {mark.w > 0 && (
        <>
          <div className="timeline__lead" />
          <button
            type="button"
            className="timeline__callout"
            style={{ left: `${mark.dx}px`, width: `${mark.w}px` }}
            tabIndex={-1}
            title={title}
            onClick={() => onOpen(task.id)}
          >
            {task.title}
          </button>
        </>
      )}
      <button
        type="button"
        className="timeline__point"
        tabIndex={-1}
        title={title}
        aria-label={title}
        onClick={() => onOpen(task.id)}
      />
    </div>
  )
}

/**
 * Puts a dot and a callout on the axis for every row. `rows` are sorted by date,
 * so one pass left to right is enough.
 */
function place(rows: Row[], levels: number, scale: Scale): Mark[] {
  const marks: Mark[] = []
  // Right edge already taken, per dot slot and per callout level.
  const dots = DOT_SLOTS.map(() => Number.NEGATIVE_INFINITY)
  const taken = new Array<number>(levels * 2).fill(Number.NEGATIVE_INFINITY)
  // Which side to try first, so the callouts alternate around the axis.
  let prefer = 0

  for (const row of rows) {
    const x = midOf(scale, row.point)

    let slot = dots.findIndex((e) => x - e >= DOT_NEAR)
    if (slot < 0) slot = 0
    dots[slot] = x

    const w = clamp(row.task.title.length * CHAR_W + LABEL_PAD, MIN_LABEL_W, MAX_LABEL_W)
    const spot = fit(taken, levels, prefer, x, w, scale.trackW)
    if (spot) {
      taken[spot.level * 2 + spot.side] = spot.left + w
      prefer = 1 - spot.side
    }

    marks.push({
      row,
      x,
      slot: DOT_SLOTS[slot],
      side: spot?.side ?? 0,
      level: spot?.level ?? 0,
      dx: spot ? spot.left - x : 0,
      w: spot ? w : 0,
    })
  }

  return marks
}

/**
 * The nearest free spot for a callout: the level closest to the axis wins, and
 * within a level the side that keeps the alternation. A callout prefers to sit
 * centred over its dot but may slide sideways, as long as the dot stays under
 * it and the lead has something to touch.
 */
function fit(
  taken: number[],
  levels: number,
  prefer: number,
  x: number,
  w: number,
  trackW: number,
): { side: number; level: number; left: number } | null {
  for (let level = 0; level < levels; level++) {
    for (const side of [prefer, 1 - prefer]) {
      const lo = Math.max(0, taken[level * 2 + side] + LABEL_GAP, x - w)
      const hi = Math.min(Math.max(0, trackW - w), x)
      if (lo > hi) continue
      return { side, level, left: clamp(x - w / 2, lo, hi) }
    }
  }
  return null
}
