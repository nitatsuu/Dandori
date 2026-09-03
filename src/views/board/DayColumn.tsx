import { useState } from 'react'
import { useDroppable } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { dayLabel, isWeekend, relativeDayLabel, weekdayShort } from '../../db/dates'
import type { ID, ISODate, Label, Task } from '../../db/types'
import { columnId } from './model'
import { AddTaskField } from './AddTaskField'
import { TaskCard } from './TaskCard'

interface Props {
  workspaceId: ID
  /** `null` — закреплённая колонка «Без даты». */
  date: ISODate | null
  today: ISODate
  tasks: Task[]
  labels: Label[]
  onOpenTask: (id: ID) => void
}

export function DayColumn({ workspaceId, date, today, tasks, labels, onOpenTask }: Props) {
  const [adding, setAdding] = useState(false)
  const { setNodeRef, isOver } = useDroppable({ id: columnId(date) })

  const relative = date ? relativeDayLabel(date, today) : null
  const className = [
    'board__col',
    date ? 'board__col--day' : 'board__col--nodate',
    date === today ? 'board__col--today' : '',
    date && isWeekend(date) ? 'board__col--weekend' : '',
    isOver ? 'board__col--over' : '',
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <section className={className} ref={setNodeRef} data-day={date ?? undefined}>
      <header className="board__col-head">
        {date ? (
          <>
            <span className="board__col-date">{dayLabel(date)}</span>
            <span className="board__col-wd">{weekdayShort(date)}</span>
            {relative && <span className="board__col-rel">{relative}</span>}
          </>
        ) : (
          <span className="board__col-date">Без даты</span>
        )}
        <button className="board__add" onClick={() => setAdding(true)} aria-label="Новая задача">
          +
        </button>
      </header>

      <div className="board__list">
        <SortableContext items={tasks.map((t) => t.id)} strategy={verticalListSortingStrategy}>
          {tasks.map((task) => (
            <TaskCard key={task.id} task={task} labels={labels} onOpen={onOpenTask} />
          ))}
        </SortableContext>
        {adding && (
          <AddTaskField workspaceId={workspaceId} date={date} onClose={() => setAdding(false)} />
        )}
      </div>
    </section>
  )
}
