import { useLayoutEffect, useMemo, useRef, useState, type Ref } from 'react'
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
import { useToday } from '../state/useToday'
import type { ID, ISODate, Label, Task } from '../db/types'
import { BOARD_MODES, BOARD_MODE_TITLES, type BoardMode } from '../state/ui'
import { DayColumn } from './board/DayColumn'
import { MonthView } from './board/MonthView'
import { CardBody } from './board/TaskCard'
import {
  accent,
  cardClass,
  columnKey,
  dateFromKey,
  groupByDay,
  keyFromColumnId,
  NO_DATE,
  NO_TASKS,
} from './board/model'
import './Board.css'

export interface BoardProps {
  workspaceId: ID
  /** Уже отфильтрованы по меткам. */
  tasks: Task[]
  labels: Label[]
  mode: BoardMode
  onSetMode: (mode: BoardMode) => void
  onOpenTask: (id: ID) => void
}

/** Скользящее окно режима «14 дней». */
const WINDOW_DAYS = 14

export function Board({ workspaceId, tasks, labels, mode, onSetMode, onOpenTask }: BoardProps) {
  const now = useToday()
  const groups = useMemo(() => groupByDay(tasks), [tasks])
  const [dragged, setDragged] = useState<ID | null>(null)

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 5 } }),
    // Без задержки палец не смог бы прокручивать колонку: любое касание тащило бы карточку.
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } }),
  )

  function onDragEnd({ active, over }: DragEndEvent) {
    setDragged(null)
    if (!over) return

    const id = String(active.id)
    const task = tasks.find((t) => t.id === id)
    if (!task) return

    const overId = String(over.id)
    const overColumn = keyFromColumnId(overId)
    const key = overColumn ?? columnKey(tasks.find((t) => t.id === overId)?.due_date ?? null)
    if (!overColumn && !tasks.some((t) => t.id === overId)) return

    const column = groups.get(key) ?? NO_TASKS
    const rest = column.filter((t) => t.id !== id)

    let index: number
    if (overColumn !== null) {
      // Отпустили на пустом месте колонки — задача встаёт в конец.
      index = rest.length
    } else {
      const at = rest.findIndex((t) => t.id === overId)
      if (at < 0) return
      // Перенос вниз внутри своей колонки ставит карточку после той, над которой отпустили.
      const from = column.findIndex((t) => t.id === id)
      const to = column.findIndex((t) => t.id === overId)
      index = from >= 0 && from < to ? at + 1 : at
    }

    // Карточку вернули на прежнее место: лишняя запись только зря разбудит синхронизацию.
    const before = groups.get(columnKey(task.due_date)) ?? NO_TASKS
    if (before === column && before[index]?.id === id) return

    // Место задаётся соседом: при активном фильтре номер в видимом списке
    // не совпадает с номером в колонке целиком.
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
            days={dateRange(now, addDays(now, WINDOW_DAYS - 1))}
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

// ------------------------------------------------------------------- колонки

interface StripProps {
  workspaceId: ID
  today: ISODate
  groups: Map<string, Task[]>
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
  labels,
  onOpenTask,
}: StripProps & {
  days: ISODate[]
  scroller?: Ref<HTMLDivElement>
  onScroll?: () => void
}) {
  const columns: (ISODate | null)[] = [null, ...days]

  return (
    <div className="board__scroller" ref={scroller} onScroll={onScroll}>
      {columns.map((date) => (
        <DayColumn
          key={date ?? NO_DATE}
          date={date}
          tasks={groups.get(columnKey(date)) ?? NO_TASKS}
          workspaceId={workspaceId}
          today={today}
          labels={labels}
          onOpenTask={onOpenTask}
        />
      ))}
    </div>
  )
}

// --------------------------------------------------------------------- лента

const RIBBON_BACK = 14
const RIBBON_FORWARD = 30
/** Сколько дней прирастает за раз и сколько их держится в памяти. */
const RIBBON_CHUNK = 14
const RIBBON_MAX = 120
/** На таком расстоянии до края начинаем подгружать дни. */
const RIBBON_EDGE = 900

function Ribbon(props: StripProps) {
  const start = props.today
  const scroller = useRef<HTMLDivElement>(null)
  const [days, setDays] = useState(() =>
    dateRange(addDays(start, -RIBBON_BACK), addDays(start, RIBBON_FORWARD)),
  )
  // День, за который держимся, пока окно дней меняется под руками.
  const anchor = useRef<{ day: ISODate; left: number; scrollLeft: number } | null>(null)

  useLayoutEffect(() => {
    const el = scroller.current
    if (!el) return
    const node = el.querySelector<HTMLElement>(`[data-day="${start}"]`)
    const pinned = el.firstElementChild as HTMLElement | null
    if (node) el.scrollLeft = node.offsetLeft - (pinned?.offsetWidth ?? 0)
  }, [start])

  // Окно сдвинулось — возвращаем полосу туда, где её оставил пользователь.
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

    // Край, который переживёт подрезку с противоположной стороны.
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
