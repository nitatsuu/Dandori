import { useState } from 'react'
import { useDroppable } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { isWeekend } from '../../db/dates'
import { useT } from '../../i18n'
import { dayLabel, relativeDayLabel, weekdayShort } from '../../i18n/dates'
import type { ID, ISODate, Label, Task } from '../../db/types'
import { columnId, columnKey } from './model'
import { AddTaskField } from './AddTaskField'
import { StartMark } from './StartMark'
import { TaskCard } from './TaskCard'

interface Props {
  workspaceId: ID
  /** `null` is the pinned «Без даты» column. */
  date: ISODate | null
  today: ISODate
  tasks: Task[]
  /** Tasks that begin on this day and are due on another: marked, not carded. */
  starts: Task[]
  labels: Label[]
  onOpenTask: (id: ID) => void
}

export function DayColumn({ workspaceId, date, today, tasks, starts, labels, onOpenTask }: Props) {
  const [adding, setAdding] = useState(false)
  const { setNodeRef, isOver } = useDroppable({ id: columnId(date) })
  const t = useT()

  const relative = date ? relativeDayLabel(date, t.lang, today) : null
  const className = [
    'board__col',
    date ? '' : 'board__col--nodate',
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
            <span className="board__col-date">{dayLabel(date, t.lang)}</span>
            <span className="board__col-wd">{weekdayShort(date, t.lang)}</span>
            {relative && <span className="board__col-rel">{relative}</span>}
          </>
        ) : (
          <span className="board__col-date">{t('board.noDate')}</span>
        )}
        <button
          className="board__add"
          onClick={() => setAdding(true)}
          aria-label={t('board.newTask')}
        >
          +
        </button>
      </header>

      <div className="board__list">
        {/*
          A group of their own above the sortable list, never inside it: a mark
          is not a sortable item, and one among the cards would give the column
          a second handle on the same task and a place a card could land in
          without taking the position it was aimed at.
        */}
        {starts.length > 0 && (
          <div className="board__starts">
            {starts.map((task) => (
              <StartMark key={task.id} task={task} labels={labels} onOpen={onOpenTask} />
            ))}
          </div>
        )}
        <SortableContext items={tasks.map((x) => x.id)} strategy={verticalListSortingStrategy}>
          {tasks.map((task) => (
            <TaskCard
              key={task.id}
              task={task}
              labels={labels}
              column={columnKey(date)}
              onOpen={onOpenTask}
            />
          ))}
        </SortableContext>
        {adding && (
          <AddTaskField workspaceId={workspaceId} date={date} onClose={() => setAdding(false)} />
        )}
      </div>
    </section>
  )
}
