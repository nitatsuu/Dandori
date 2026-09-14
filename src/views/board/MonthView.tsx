import { useMemo, useState, type MouseEvent as ReactMouseEvent } from 'react'
import { useDroppable } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { addMonths, fromISODate, isSameMonth, isWeekend, monthGrid } from '../../db/dates'
import { useT, type T } from '../../i18n'
import { monthLabel, weekdayShort } from '../../i18n/dates'
import type { ID, ISODate, Label, Task } from '../../db/types'
import { emptyOf } from '../../lib/empty'
import { columnId } from './model'
import { AddTaskField } from './AddTaskField'
import { StartMark } from './StartMark'
import { TaskCard } from './TaskCard'

interface Props {
  workspaceId: ID
  today: ISODate
  groups: Map<string, Task[]>
  /** Tasks marked in a cell for beginning on that day — see `groupStarts`. */
  starts: Map<string, Task[]>
  labels: Label[]
  onOpenTask: (id: ID) => void
  /**
   * Where a tap on a cell leads. Only the phone has one: there the cell is
   * 55 px of colour bars and the day behind it is where the task is read, while
   * on the desk the cell already holds the titles and needs no way out.
   */
  onOpenDay?: (date: ISODate) => void
}

export function MonthView({
  workspaceId,
  today,
  groups,
  starts,
  labels,
  onOpenTask,
  onOpenDay,
}: Props) {
  const [anchor, setAnchor] = useState(today)
  const cells = useMemo(() => monthGrid(anchor), [anchor])
  const t = useT()

  return (
    <div className="board__month">
      <div className="board__month-nav">
        <button
          className="btn btn--quiet"
          onClick={() => setAnchor(addMonths(anchor, -1))}
          aria-label={t('board.prevMonth')}
        >
          ‹
        </button>
        <span className="board__month-title">{monthLabel(anchor, t.lang)}</span>
        <button
          className="btn btn--quiet"
          onClick={() => setAnchor(addMonths(anchor, 1))}
          aria-label={t('board.nextMonth')}
        >
          ›
        </button>
        <button className="btn" onClick={() => setAnchor(today)}>
          {t('board.today')}
        </button>
      </div>

      <div className="board__weekdays">
        {cells.slice(0, 7).map((date) => (
          <span key={date} className="board__weekday">
            {weekdayShort(date, t.lang)}
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
            tasks={groups.get(date) ?? emptyOf<Task>()}
            starts={starts.get(date) ?? emptyOf<Task>()}
            labels={labels}
            onOpenTask={onOpenTask}
            onOpenDay={onOpenDay}
            t={t}
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
  starts,
  labels,
  onOpenTask,
  onOpenDay,
  t,
}: {
  workspaceId: ID
  date: ISODate
  today: ISODate
  outside: boolean
  tasks: Task[]
  starts: Task[]
  labels: Label[]
  onOpenTask: (id: ID) => void
  onOpenDay?: (date: ISODate) => void
  t: T
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

  /*
   * The cell itself is the way to its day; what stands inside it keeps its own
   * meaning. A tap on a colour bar opens that task — the bar of a task that
   * merely begins here as much as the bar of one that stands here — a tap on the
   * plus starts a new one, and only the space around them leads to the day.
   */
  function open(e: ReactMouseEvent<HTMLDivElement>) {
    if (!onOpenDay) return
    const on = '.board__card, .board__start, .board__add, .board__new'
    if ((e.target as HTMLElement).closest(on)) return
    onOpenDay(date)
  }

  return (
    <div className={className} ref={setNodeRef} onClick={open}>
      <div className="board__cell-head">
        <span className="board__cell-num">{fromISODate(date).getDate()}</span>
        <button
          className="board__add"
          onClick={() => setAdding(true)}
          aria-label={t('board.newTask')}
        >
          +
        </button>
      </div>

      <div className="board__cell-list">
        {/* Above the sortable list, as in a day column: a mark is not an item of it. */}
        {starts.map((task) => (
          <StartMark key={task.id} task={task} labels={labels} compact onOpen={onOpenTask} />
        ))}
        <SortableContext items={tasks.map((t) => t.id)} strategy={verticalListSortingStrategy}>
          {tasks.map((task) => (
            <TaskCard
              key={task.id}
              task={task}
              labels={labels}
              column={date}
              compact
              onOpen={onOpenTask}
            />
          ))}
        </SortableContext>
        {adding && (
          <AddTaskField workspaceId={workspaceId} date={date} onClose={() => setAdding(false)} />
        )}
      </div>
    </div>
  )
}
