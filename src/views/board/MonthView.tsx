import { useMemo, useState } from 'react'
import { useDroppable } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import {
  addMonths,
  fromISODate,
  isSameMonth,
  isWeekend,
  monthGrid,
  monthLabel,
  weekdayShort,
} from '../../db/dates'
import type { ID, ISODate, Label, Task } from '../../db/types'
import { columnId, NO_TASKS } from './model'
import { AddTaskField } from './AddTaskField'
import { TaskCard } from './TaskCard'

interface Props {
  workspaceId: ID
  today: ISODate
  groups: Map<string, Task[]>
  labels: Label[]
  onOpenTask: (id: ID) => void
}

export function MonthView({ workspaceId, today, groups, labels, onOpenTask }: Props) {
  const [anchor, setAnchor] = useState(today)
  const cells = useMemo(() => monthGrid(anchor), [anchor])

  return (
    <div className="board__month">
      <div className="board__month-nav">
        <button
          className="btn btn--quiet"
          onClick={() => setAnchor(addMonths(anchor, -1))}
          aria-label="Предыдущий месяц"
        >
          ‹
        </button>
        <span className="board__month-title">{monthLabel(anchor)}</span>
        <button
          className="btn btn--quiet"
          onClick={() => setAnchor(addMonths(anchor, 1))}
          aria-label="Следующий месяц"
        >
          ›
        </button>
        <button className="btn" onClick={() => setAnchor(today)}>
          Сегодня
        </button>
      </div>

      <div className="board__weekdays">
        {cells.slice(0, 7).map((date) => (
          <span key={date} className="board__weekday">
            {weekdayShort(date)}
          </span>
        ))}
      </div>

      <div className="board__grid">
        {cells.map((date) => (
          <MonthCell
            key={date}
            workspaceId={workspaceId}
            date={date}
            today={today}
            outside={!isSameMonth(date, anchor)}
            tasks={groups.get(date) ?? NO_TASKS}
            labels={labels}
            onOpenTask={onOpenTask}
          />
        ))}
      </div>
    </div>
  )
}

function MonthCell({
  workspaceId,
  date,
  today,
  outside,
  tasks,
  labels,
  onOpenTask,
}: {
  workspaceId: ID
  date: ISODate
  today: ISODate
  outside: boolean
  tasks: Task[]
  labels: Label[]
  onOpenTask: (id: ID) => void
}) {
  const [adding, setAdding] = useState(false)
  const { setNodeRef, isOver } = useDroppable({ id: columnId(date) })

  const className = [
    'board__cell',
    date === today ? 'board__cell--today' : '',
    isWeekend(date) ? 'board__cell--weekend' : '',
    outside ? 'board__cell--outside' : '',
    isOver ? 'board__cell--over' : '',
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <div className={className} ref={setNodeRef}>
      <div className="board__cell-head">
        <span className="board__cell-num">{fromISODate(date).getDate()}</span>
        <button className="board__add" onClick={() => setAdding(true)} aria-label="Новая задача">
          +
        </button>
      </div>

      <div className="board__cell-list">
        <SortableContext items={tasks.map((t) => t.id)} strategy={verticalListSortingStrategy}>
          {tasks.map((task) => (
            <TaskCard key={task.id} task={task} labels={labels} compact onOpen={onOpenTask} />
          ))}
        </SortableContext>
        {adding && (
          <AddTaskField workspaceId={workspaceId} date={date} onClose={() => setAdding(false)} />
        )}
      </div>
    </div>
  )
}
