import { useLayoutEffect, useMemo, useRef, useState, type RefObject } from 'react'
import {
  closestCorners,
  DndContext,
  DragOverlay,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core'
import { moveTask } from '../db/api'
import { addDays, dateRange } from '../db/dates'
import { emptyOf } from '../lib/empty'
import { useToday } from '../state/useToday'
import type { ID, ISODate, Label, Task } from '../db/types'
import { BOARD_MODES, BOARD_MODE_TITLES, type BoardMode } from '../state/ui'
import { DayColumn } from './board/DayColumn'
import { MonthView } from './board/MonthView'
import { CardBody } from './board/TaskCard'
import {
  accent,
  cardClass,
  collectOverdue,
  columnKey,
  dateFromKey,
  groupByDay,
  keyFromColumnId,
  NO_DATE,
  OVERDUE,
} from './board/model'
import { OverdueColumn } from './board/OverdueColumn'
import './Board.css'

export interface BoardProps {
  workspaceId: ID
  /** Already filtered by label. */
  tasks: Task[]
  labels: Label[]
  mode: BoardMode
  onSetMode: (mode: BoardMode) => void
  onOpenTask: (id: ID) => void
}

/*
 * Sliding window of the «14 дней» mode: yesterday, today and 13 days ahead.
 * The one day back is there so a yesterday deadline does not vanish from the
 * board at midnight.
 */
const WINDOW_BACK = 1
const WINDOW_FORWARD = 13

export function Board({ workspaceId, tasks, labels, mode, onSetMode, onOpenTask }: BoardProps) {
  const now = useToday()
  const groups = useMemo(() => groupByDay(tasks), [tasks])

  const days = useMemo(
    () => dateRange(addDays(now, -WINDOW_BACK), addDays(now, WINDOW_FORWARD)),
    [now],
  )
  // Overdue tasks the window cannot scroll back to. No column while there is nothing to show.
  const overdue = useMemo(() => collectOverdue(groups, now, days), [groups, now, days])
  const [dragged, setDragged] = useState<ID | null>(null)

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 5 } }),
    // Without the delay a finger could not scroll a column: any touch would drag a card.
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } }),
  )

  function onDragEnd({ active, over }: DragEndEvent) {
    setDragged(null)
    if (!over) return

    const id = String(active.id)
    const task = tasks.find((t) => t.id === id)
    if (!task) return

    const overId = String(over.id)
    // The drop landed either on a column or on a card — a card carries its column in data.
    const onColumn = keyFromColumnId(overId)
    const key = onColumn ?? (over.data.current?.column as string | undefined) ?? null
    if (key === null) return
    // Nothing can be dropped into «Просрочено»: the column has no date of its own.
    if (key === OVERDUE) return

    const column = groups.get(key) ?? emptyOf<Task>()
    const rest = column.filter((t) => t.id !== id)

    let index: number
    if (onColumn !== null) {
      // Dropped on empty space in the column — the task goes to the end.
      index = rest.length
    } else {
      const at = rest.findIndex((t) => t.id === overId)
      if (at < 0) return
      // Moving down inside its own column puts the card after the one it was released over.
      const from = column.findIndex((t) => t.id === id)
      const to = column.findIndex((t) => t.id === overId)
      index = from >= 0 && from < to ? at + 1 : at
    }

    // The card was put back where it was: a pointless write would only wake sync for nothing.
    const before = groups.get(columnKey(task.due_date)) ?? emptyOf<Task>()
    if (before === column && before[index]?.id === id) return

    // The position is given by the neighbouring task, not by an index: with a
    // filter on, the index in the visible list does not match the index in the
    // full column.
    void moveTask(id, dateFromKey(key), rest[index]?.id ?? null)
  }

  const active = dragged ? tasks.find((t) => t.id === dragged) : undefined

  return (
    <div className="board">
      <div className="board__bar">
        <div className="board__modes">
          {BOARD_MODES.map((m) => (
            <button
              key={m}
              className={`board__mode${m === mode ? ' board__mode--on' : ''}`}
              onClick={() => onSetMode(m)}
            >
              {BOARD_MODE_TITLES[m]}
            </button>
          ))}
        </div>
      </div>

      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={(e: DragStartEvent) => setDragged(String(e.active.id))}
        onDragCancel={() => setDragged(null)}
        onDragEnd={onDragEnd}
      >
        {mode === 'month' ? (
          <MonthView
            workspaceId={workspaceId}
            today={now}
            groups={groups}
            labels={labels}
            onOpenTask={onOpenTask}
          />
        ) : mode === 'ribbon' ? (
          <Ribbon
            workspaceId={workspaceId}
            today={now}
            groups={groups}
            labels={labels}
            onOpenTask={onOpenTask}
          />
        ) : (
          <Strip
            days={days}
            overdue={overdue}
            workspaceId={workspaceId}
            today={now}
            groups={groups}
            labels={labels}
            onOpenTask={onOpenTask}
          />
        )}

        <DragOverlay>
          {active && (
            <div
              className={cardClass(active, { compact: mode === 'month', overlay: true })}
              style={accent(active, labels)}
            >
              <CardBody task={active} labels={labels} />
            </div>
          )}
        </DragOverlay>
      </DndContext>
    </div>
  )
}

// ------------------------------------------------------------------- columns

interface StripProps {
  workspaceId: ID
  today: ISODate
  groups: Map<string, Task[]>
  labels: Label[]
  onOpenTask: (id: ID) => void
}

function Strip({
  days,
  overdue,
  scroller,
  onScroll,
  workspaceId,
  today,
  groups,
  labels,
  onOpenTask,
}: StripProps & {
  days: ISODate[]
  /** Only in «14 дней» mode: the ribbon can scroll back into the past on its own. */
  overdue?: Task[]
  scroller?: RefObject<HTMLDivElement | null>
  onScroll?: () => void
}) {
  const own = useRef<HTMLDivElement>(null)
  const el = scroller ?? own
  const columns: (ISODate | null)[] = [null, ...days]

  // Open on today: «Без даты» and possibly «Просрочено» sit to the left, and
  // without this the board would greet a phone user with the empty no-date column.
  useLayoutEffect(() => {
    scrollToDay(el.current, today)
  }, [el, today])

  return (
    <div className="board__scroller" ref={el} onScroll={onScroll}>
      {overdue && overdue.length > 0 && (
        <OverdueColumn tasks={overdue} labels={labels} onOpenTask={onOpenTask} />
      )}
      {columns.map((date) => (
        <DayColumn
          key={date ?? NO_DATE}
          date={date}
          tasks={groups.get(columnKey(date)) ?? emptyOf<Task>()}
          workspaceId={workspaceId}
          today={today}
          labels={labels}
          onOpenTask={onOpenTask}
        />
      ))}
    </div>
  )
}

/**
 * Puts a day against the left edge of the visible area. Pinned columns cover the
 * start of the strip, so their combined width is subtracted; on a phone nothing
 * is pinned and there is nothing to subtract.
 */
function scrollToDay(el: HTMLDivElement | null, day: ISODate): void {
  if (!el) return
  const node = el.querySelector<HTMLElement>(`[data-day="${day}"]`)
  if (!node) return

  let pinned = 0
  for (const child of el.children) {
    if (getComputedStyle(child).position !== 'sticky') break
    pinned += (child as HTMLElement).offsetWidth
  }
  el.scrollLeft = node.offsetLeft - pinned
}

// -------------------------------------------------------------------- ribbon

const RIBBON_BACK = 14
const RIBBON_FORWARD = 30
/** How many days are appended at a time and how many are kept in memory. */
const RIBBON_CHUNK = 14
const RIBBON_MAX = 120
/** Start loading more days at this distance from the edge. */
const RIBBON_EDGE = 900

function Ribbon(props: StripProps) {
  const start = props.today
  const scroller = useRef<HTMLDivElement>(null)
  const [days, setDays] = useState(() =>
    dateRange(addDays(start, -RIBBON_BACK), addDays(start, RIBBON_FORWARD)),
  )
  // The day we hold on to while the window of days changes underneath.
  const anchor = useRef<{ day: ISODate; left: number; scrollLeft: number } | null>(null)

  // The window shifted — put the strip back where the user left it.
  useLayoutEffect(() => {
    const el = scroller.current
    const held = anchor.current
    if (!el || !held) return
    anchor.current = null
    const node = el.querySelector<HTMLElement>(`[data-day="${held.day}"]`)
    if (node) el.scrollLeft = held.scrollLeft + (node.offsetLeft - held.left)
  }, [days])

  function extend(side: 'left' | 'right') {
    const el = scroller.current
    if (!el || anchor.current) return

    // The edge that will survive the trim on the opposite side.
    const day = side === 'left' ? days[0] : days[days.length - 1]
    const node = el.querySelector<HTMLElement>(`[data-day="${day}"]`)
    if (!node) return
    anchor.current = { day, left: node.offsetLeft, scrollLeft: el.scrollLeft }

    setDays((prev) => {
      const first = prev[0]
      const last = prev[prev.length - 1]
      const grown =
        side === 'left'
          ? [...dateRange(addDays(first, -RIBBON_CHUNK), addDays(first, -1)), ...prev]
          : [...prev, ...dateRange(addDays(last, 1), addDays(last, RIBBON_CHUNK))]
      if (grown.length <= RIBBON_MAX) return grown
      return side === 'left' ? grown.slice(0, RIBBON_MAX) : grown.slice(grown.length - RIBBON_MAX)
    })
  }

  function onScroll() {
    const el = scroller.current
    if (!el) return
    if (el.scrollLeft < RIBBON_EDGE) extend('left')
    else if (el.scrollWidth - el.scrollLeft - el.clientWidth < RIBBON_EDGE) extend('right')
  }

  return <Strip {...props} days={days} scroller={scroller} onScroll={onScroll} />
}
