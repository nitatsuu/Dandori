import {
  useRef,
  type CSSProperties,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import { useSortable } from '@dnd-kit/sortable'
import { toggleTaskDone } from '../../db/api'
import type { ID, Label, Task } from '../../db/types'
import { accent, cardClass, labelColors } from './model'

interface Props {
  task: Task
  labels: Label[]
  compact?: boolean
  onOpen: (id: ID) => void
}

/** Порог, ниже которого отпускание считается кликом, а не перетаскиванием. */
const CLICK_SLOP = 5

export function TaskCard({ task, labels, compact, onOpen }: Props) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: task.id,
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
      <CardBody task={task} labels={labels} />
    </div>
  )
}

/** Тело карточки: то же самое рисуется под пальцем в DragOverlay. */
export function CardBody({ task, labels }: { task: Task; labels: Label[] }) {
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
        {colors.length > 0 && (
          <span className="board__dots">
            {colors.map((color, i) => (
              <i key={i} className="board__dot" style={{ background: `var(--label-${color})` }} />
            ))}
          </span>
        )}
      </span>
    </>
  )
}
