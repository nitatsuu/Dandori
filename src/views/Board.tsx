import {
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type Ref,
  type RefObject,
} from 'react'
import { createPortal } from 'react-dom'
import {
  closestCenter,
  DndContext,
  DragOverlay,
  MouseSensor,
  TouchSensor,
  pointerWithin,
  rectIntersection,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core'
import { moveTask } from '../db/api'
import { addDays, dateRange } from '../db/dates'
import { useT } from '../i18n'
import { emptyOf } from '../lib/empty'
import { usePhone } from '../lib/usePhone'
import { useToday } from '../state/useToday'
import { taskDate, type ID, type ISODate, type Label, type Task } from '../db/types'
import { BOARD_MODES, type BoardMode } from '../state/ui'
import { DayColumn } from './board/DayColumn'
import { MonthView } from './board/MonthView'
import { CardBody } from './board/TaskCard'
import {
  accent,
  cardClass,
  columnKey,
  dateFromKey,
  groupByDay,
  groupStarts,
  keyFromColumnId,
  NO_DATE,
} from './board/model'
import './Board.css'

export interface BoardProps {
  workspaceId: ID
  /** Already filtered by label. */
  tasks: Task[]
  labels: Label[]
  mode: BoardMode
  onSetMode: (mode: BoardMode) => void
  onOpenTask: (id: ID) => void
  /** The header's place for the board's own controls on the desk. */
  tools: HTMLElement | null
}

/*
 * Sliding window of the «14 дней» mode: yesterday, today and 13 days ahead.
 * The one day back is there so a yesterday deadline does not vanish from the
 * board at midnight.
 */
const WINDOW_BACK = 1
const WINDOW_FORWARD = 13

/*
 * Auto-scroll while a card is held near the edge of the strip. The library's
 * own acceleration runs the board past seven columns a second at the very edge,
 * which is a week gone before a finger can lift: the card lands nowhere near the
 * day it was aimed at. At 3 the far edge moves about one column a second and the
 * near edge of the zone still crawls, so the whole ramp is aimable.
 */
const AUTO_SCROLL = { acceleration: 3 }

/*
 * Two questions, answered by different means.
 *
 * Which column: whatever the page says is under the pointer. Rectangles put a
 * card's own column ahead of the one under the cursor — a day column is as tall
 * as the board, so it never looked close — and the pinned columns made it worse:
 * they float over the strip, and the rectangle dnd-kit keeps for them slides away
 * with the scroll while the column stays put, so a card dropped on «Без даты»
 * landed on the day hidden behind it.
 *
 * Which card inside it: the rectangles, which dnd-kit measured before the drag
 * began. The cards slide aside to open a gap as one is carried over them, and the
 * pointer then falls into that gap and reads as a drop on the column itself —
 * which sends the card to the end of the very column it came from, so reordering
 * a day did nothing at all.
 */
const collide: CollisionDetection = (args) => {
  const { pointerCoordinates, droppableContainers } = args
  const key = pointerCoordinates ? columnUnderPointer(pointerCoordinates, droppableContainers) : null

  if (key !== null) {
    const inside = droppableContainers.filter((c) => columnOfContainer(c) === key)
    const cards = inside.filter(isCard)

    if (cards.length > 0) {
      const nearest = closestCenter({ ...args, droppableContainers: cards })
      if (nearest.length > 0) return nearest
    }

    const column = inside.find((c) => !isCard(c))
    if (column) return [{ id: column.id, data: { droppableContainer: column } }]
  }

  const under = pointerWithin(args)
  return under.length > 0 ? under : rectIntersection(args)
}

type Container = Parameters<CollisionDetection>[0]['droppableContainers'][number]

/** A card carries the key of its column; a column droppable is its own. */
function isCard(container: Container): boolean {
  return container.data.current?.column !== undefined
}

function columnOfContainer(container: Container): string | null {
  const own = container.data.current?.column
  return typeof own === 'string' ? own : keyFromColumnId(String(container.id))
}

/** The topmost column the pointer is inside, read from the page itself. */
function columnUnderPointer(at: { x: number; y: number }, containers: Container[]): string | null {
  const nodes = new Map<Element, Container>()
  for (const container of containers) {
    const node = container.node.current
    if (node) nodes.set(node, container)
  }

  // The card flying under the cursor is in the stack too and is simply skipped:
  // it is not among the droppables while it is being dragged.
  for (const node of document.elementsFromPoint(at.x, at.y)) {
    const container = nodes.get(node)
    if (container) return columnOfContainer(container)
  }
  return null
}

export function Board({
  workspaceId,
  tasks,
  labels,
  mode,
  onSetMode,
  onOpenTask,
  tools,
}: BoardProps) {
  const now = useToday()
  const t = useT()
  const phone = usePhone()
  const groups = useMemo(() => groupByDay(tasks), [tasks])
  const starts = useMemo(() => groupStarts(tasks), [tasks])

  const days = useMemo(
    () => dateRange(addDays(now, -WINDOW_BACK), addDays(now, WINDOW_FORWARD)),
    [now],
  )
  const [dragged, setDragged] = useState<ID | null>(null)
  /*
   * The day a tap on a month cell asked for. It lives here because the feed is
   * unmounted while the month is on screen: it is read once, as the feed opens,
   * and cleared the moment a mode button is pressed, or a tap from last week
   * would still be waiting the next time the feed is chosen by hand.
   */
  const [openOn, setOpenOn] = useState<ISODate | null>(null)
  /*
   * The ribbon keeps its days and its scroller to itself, so the «Сегодня»
   * button in the bar asks it to go home instead of scrolling anything itself.
   * «14 дней» needs no such button: today never leaves that window.
   */
  const ribbon = useRef<RibbonHandle>(null)

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 5 } }),
    // Without the delay a finger could not scroll a column: any touch would drag a card.
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } }),
  )

  function onDragEnd({ active, over }: DragEndEvent) {
    setDragged(null)
    if (!over) return

    const id = String(active.id)
    const task = tasks.find((x) => x.id === id)
    if (!task) return

    const overId = String(over.id)
    // The drop landed either on a column or on a card — a card carries its column in data.
    const onColumn = keyFromColumnId(overId)
    const key = onColumn ?? (over.data.current?.column as string | undefined) ?? null
    if (key === null) return

    const column = groups.get(key) ?? emptyOf<Task>()
    const rest = column.filter((x) => x.id !== id)

    // The place is named by the task that will follow, not by an index: with a
    // filter on, the index in the visible list does not match the index in the
    // full column.
    let beforeId: ID | null
    if (onColumn !== null) {
      // Dropped on empty space in the column — the task goes to the end.
      beforeId = null
    } else {
      const at = rest.findIndex((x) => x.id === overId)
      if (at < 0) return
      // Moving down inside its own column puts the card after the one it was released over.
      const from = column.findIndex((x) => x.id === id)
      const to = column.findIndex((x) => x.id === overId)
      beforeId = rest[from >= 0 && from < to ? at + 1 : at]?.id ?? null
    }

    // The card was put back where it was: a pointless write would only wake sync
    // for nothing. It is back where it was when the day is the same and the same
    // task still follows it.
    const date = dateFromKey(key)
    if (taskDate(task) === date) {
      const now = column.findIndex((x) => x.id === id)
      if (now >= 0 && (column[now + 1]?.id ?? null) === beforeId) return
    }

    void moveTask(id, date, beforeId)
  }

  const active = dragged ? tasks.find((x) => x.id === dragged) : undefined

  const controls = (
    <>
      <div className="board__modes">
        {BOARD_MODES.map((m) => (
          <button
            key={m}
            className={`board__mode${m === mode ? ' board__mode--on' : ''}`}
            onClick={() => {
              // Only a real change of mode forgets the day a month cell asked
              // for: pressing «Лента» while it is already on would otherwise
              // pull the feed back to today under the finger.
              if (m !== mode) setOpenOn(null)
              onSetMode(m)
            }}
          >
            {t(`board.mode.${m}`)}
          </button>
        ))}
      </div>
      {mode === 'ribbon' && (
        <button className="btn" onClick={() => ribbon.current?.toToday()}>
          {t('board.today')}
        </button>
      )}
    </>
  )

  /*
   * The same controls in two places, one of them hidden, as the tabs are. On a
   * phone they are a bar of their own under the header, three thirds of the
   * screen for a thumb. On the desk that bar was 41px of height holding 200px
   * of buttons, under a header with a thousand empty pixels in its middle — so
   * there they stand in the header, beside the tabs they belong to.
   */
  // The snap is lifted while a card is in the air: see `.board--dragging`.
  return (
    <div className={`board${dragged ? ' board--dragging' : ''}`}>
      <div className="board__bar">{controls}</div>
      {tools && createPortal(controls, tools)}

      <DndContext
        sensors={sensors}
        collisionDetection={collide}
        autoScroll={AUTO_SCROLL}
        onDragStart={(e: DragStartEvent) => setDragged(String(e.active.id))}
        onDragCancel={() => setDragged(null)}
        onDragEnd={onDragEnd}
      >
        {mode === 'month' ? (
          <MonthView
            workspaceId={workspaceId}
            today={now}
            groups={groups}
            starts={starts}
            labels={labels}
            onOpenTask={onOpenTask}
            onOpenDay={
              phone
                ? (date) => {
                    setOpenOn(date)
                    onSetMode('ribbon')
                  }
                : undefined
            }
          />
        ) : mode === 'ribbon' ? (
          <Ribbon
            workspaceId={workspaceId}
            today={now}
            groups={groups}
            starts={starts}
            labels={labels}
            onOpenTask={onOpenTask}
            openOn={openOn}
            ref={ribbon}
          />
        ) : (
          <Strip
            days={days}
            workspaceId={workspaceId}
            today={now}
            groups={groups}
            starts={starts}
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
  /** Marks: which tasks begin in which column — see `groupStarts`. */
  starts: Map<string, Task[]>
  labels: Label[]
  onOpenTask: (id: ID) => void
}

function Strip({
  days,
  scroller,
  onScroll,
  workspaceId,
  today,
  groups,
  starts,
  labels,
  onOpenTask,
  opensOn,
}: StripProps & {
  days: ISODate[]
  scroller?: RefObject<HTMLDivElement | null>
  onScroll?: () => void
  /**
   * The day the strip opens on, when it is not its first. The feed opens where
   * its «Сегодня» brings it back to rather than on the day two weeks back that
   * exists only to have somewhere to scroll — and on the day a month cell was
   * tapped, when it was reached that way.
   */
  opensOn?: ISODate
}) {
  const own = useRef<HTMLDivElement>(null)
  const el = scroller ?? own
  const columns: (ISODate | null)[] = [null, ...days]

  /*
   * Where the strip opens.
   *
   * With «Без даты» pinned there is room for the whole window, so the board
   * opens at its very start and yesterday stands beside the pinned column.
   * Scrolling to today instead parked yesterday underneath it — and yesterday is
   * in the window precisely so that a deadline does not vanish from the board at
   * midnight.
   *
   * On a phone nothing is pinned and one column fills the screen, so it opens on
   * today rather than on an empty «Без даты».
   *
   * The feed is not a window with a start: its first day is two weeks back only
   * so that there is somewhere to scroll to. Opening on it put the desk a
   * fortnight in the past.
   */
  /*
   * The feed is put where it opens once and then left alone: it rebuilds its
   * window of days as it is scrolled, and landing on the opening day again after
   * every rebuild threw the strip back from wherever it had been carried. The
   * feed puts itself back after a rebuild on its own. The window of «14 дней»
   * changes only when the day does, and there it should land again.
   */
  const landed = useRef<ISODate | null>(null)
  useLayoutEffect(() => {
    const node = el.current
    if (!node) return
    if (opensOn && landed.current === opensOn) return
    landed.current = opensOn ?? null
    const atStart = !opensOn && pinnedWidth(node) > 0
    scrollToDay(node, atStart ? (days[0] ?? today) : (opensOn ?? today))
  }, [el, today, days, opensOn])

  return (
    <div className="board__scroller" ref={el} onScroll={onScroll}>
      {columns.map((date) => (
        <DayColumn
          key={date ?? NO_DATE}
          date={date}
          tasks={groups.get(columnKey(date)) ?? emptyOf<Task>()}
          starts={date ? (starts.get(date) ?? emptyOf<Task>()) : emptyOf<Task>()}
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

  /*
   * The strip carries a side inset on a phone, where a day is a card rather than
   * a slab: land the day on that inset, not on the edge of the screen, or the
   * next card's border shows through the gap the inset leaves behind.
   */
  const inset = parseFloat(getComputedStyle(el).paddingLeft) || 0
  el.scrollLeft = node.offsetLeft - pinnedWidth(el) - inset
}

/** How much of the strip's left edge is covered by columns that do not scroll. */
function pinnedWidth(el: HTMLDivElement): number {
  let pinned = 0
  for (const child of el.children) {
    if (getComputedStyle(child).position !== 'sticky') break
    pinned += (child as HTMLElement).offsetWidth
  }
  return pinned
}

// -------------------------------------------------------------------- ribbon

const RIBBON_BACK = 14
const RIBBON_FORWARD = 30
/** How many days are appended at a time and how many are kept in memory. */
const RIBBON_CHUNK = 14
const RIBBON_MAX = 120
/*
 * Start loading more days at this distance from the edge — five columns of a
 * phone. It used to be two, which a fling crosses before the days it asks for
 * have been laid out, and the strip ran out of feed under the finger.
 */
const RIBBON_EDGE = 1900
/*
 * How long the strip has to stand still before the window is rebuilt under it.
 * Prepending days puts the scroll position back from the main thread, and a
 * compositor still carrying a fling from its own offset throws that away a frame
 * later: the feed jumped a fortnight back, and a long fling did it ten times
 * over — four months gone in one swipe.
 */
const RIBBON_SETTLE = 150

/** The window of days the ribbon starts with and comes back to. */
function ribbonWindow(today: ISODate): ISODate[] {
  return dateRange(addDays(today, -RIBBON_BACK), addDays(today, RIBBON_FORWARD))
}

interface RibbonHandle {
  /** Bring today back into view, rebuilding the window of days if it has to. */
  toToday: () => void
}

function Ribbon({
  ref,
  openOn,
  ...props
}: StripProps & { openOn: ISODate | null; ref: Ref<RibbonHandle> }) {
  const today = props.today
  const scroller = useRef<HTMLDivElement>(null)
  /*
   * The feed is built around the day it is opened on — today, or the day a month
   * cell was tapped. A window around today would leave a date months away
   * outside it altogether, with nothing to scroll to but a wall of empty days.
   */
  const start = openOn ?? today
  const [days, setDays] = useState(() => ribbonWindow(start))
  // The day we hold on to while the window of days changes underneath.
  const anchor = useRef<{ day: ISODate; left: number; scrollLeft: number } | null>(null)
  // Set when the window is being rebuilt around today and has to be scrolled there.
  const jump = useRef(false)

  // The window shifted — put the strip back where the user left it.
  useLayoutEffect(() => {
    const el = scroller.current
    if (!el) return

    if (jump.current) {
      jump.current = false
      anchor.current = null
      scrollToDay(el, today)
      return
    }

    const held = anchor.current
    if (!held) return
    anchor.current = null
    const node = el.querySelector<HTMLElement>(`[data-day="${held.day}"]`)
    if (node) el.scrollLeft = held.scrollLeft + (node.offsetLeft - held.left)
  }, [days, today])

  // Scrolling far enough into the past carries today out of the window: then the
  // window is rebuilt and the scroll waits until the new days are laid out.
  useImperativeHandle(
    ref,
    () => ({
      toToday() {
        const el = scroller.current
        if (!el) return
        if (days.includes(today)) scrollToDay(el, today)
        else {
          jump.current = true
          setDays(ribbonWindow(today))
        }
      },
    }),
    [days, today],
  )

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

  /*
   * Which edge is close, if either — asked on every scroll event, answered only
   * once the strip has stopped moving.
   */
  const settling = useRef<number | null>(null)
  const wanted = useRef<'left' | 'right' | null>(null)

  useEffect(() => () => {
    if (settling.current !== null) clearTimeout(settling.current)
  }, [])

  function onScroll() {
    const el = scroller.current
    if (!el) return
    const near = el.scrollWidth - el.scrollLeft - el.clientWidth
    wanted.current =
      el.scrollLeft < RIBBON_EDGE ? 'left' : near < RIBBON_EDGE ? 'right' : null

    if (settling.current !== null) clearTimeout(settling.current)
    if (!wanted.current) return
    settling.current = window.setTimeout(() => {
      settling.current = null
      if (wanted.current) extend(wanted.current)
    }, RIBBON_SETTLE)
  }

  return <Strip {...props} days={days} scroller={scroller} onScroll={onScroll} opensOn={start} />
}
