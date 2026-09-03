import {
  useRef,
  type CSSProperties,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import { useSortable } from '@dnd-kit/sortable'
import { toggleTaskDone } from '../../db/api'
import { dayLabel } from '../../db/dates'
import { labelColors, labelVar } from '../../lib/labels'
import type { ID, Label, Task } from '../../db/types'
import { accent, cardClass } from './model'

interface Props {
  task: Task
  labels: Label[]
  /** Ключ колонки, в которой нарисована карточка: по нему опознаётся цель дропа. */
  column: string
  compact?: boolean
  /** Дата на карточке нужна там, где её не видно по шапке колонки. */
  showDate?: boolean
  onOpen: (id: ID) => void
}

/** Порог, ниже которого отпускание считается кликом, а не перетаскиванием. */
const CLICK_SLOP = 5

export function TaskCard({ task, labels, column, compact, showDate, onOpen }: Props) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: task.id,
    data: { column },
  })
  const pressed = useRef<{ x: number; y: number } | null>(null)

  const style = {
    transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined,
    transition,
    ...accent(task, labels),
  } as CSSProperties

  function onPointerDown(e: ReactPointerEvent) {
    pressed.current = { x: e.clientX, y: e.clientY }
  }

  // Карточку, которую только что таскали, открывать не нужно.
  function onClick(e: ReactMouseEvent) {
    const from = pressed.current
    pressed.current = null
    if (from && Math.hypot(e.clientX - from.x, e.clientY - from.y) > CLICK_SLOP) return
    onOpen(task.id)
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cardClass(task, { compact, dragging: isDragging })}
      {...attributes}
      {...listeners}
      onPointerDown={onPointerDown}
      onClick={onClick}
    >
      <CardBody task={task} labels={labels} showDate={showDate} />
    </div>
  )
}

/** Тело карточки: то же самое рисуется под пальцем в DragOverlay. */
export function CardBody({
  task,
  labels,
  showDate,
}: {
  task: Task
  labels: Label[]
  showDate?: boolean
}) {
  const colors = labelColors(task, labels)

  return (
    <>
      <input
        type="checkbox"
        className="board__check"
        checked={task.done}
        aria-label="Готово"
        // Гасим и mousedown, и touchstart: на них висит запуск перетаскивания карточки.
        onMouseDown={(e) => e.stopPropagation()}
        onTouchStart={(e) => e.stopPropagation()}
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
        onChange={() => void toggleTaskDone(task.id)}
      />
      <span className="board__card-main">
        <span className="board__card-title">{task.title}</span>
        {showDate && task.due_date && (
          <span className="board__card-date">{dayLabel(task.due_date)}</span>
        )}
        {colors.length > 0 && (
          <span className="board__dots">
            {colors.map((color, i) => (
              <i key={i} className="board__dot" style={{ background: labelVar(color) }} />
            ))}
          </span>
        )}
      </span>
    </>
  )
}
