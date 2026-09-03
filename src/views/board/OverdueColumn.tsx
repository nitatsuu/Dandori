import { useDroppable } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import type { ID, Label, Task } from '../../db/types'
import { columnIdOf, OVERDUE } from './model'
import { TaskCard } from './TaskCard'

interface Props {
  tasks: Task[]
  labels: Label[]
  onOpenTask: (id: ID) => void
}

/*
 * Overdue tasks that would otherwise require scrolling back to reach.
 * The column only hands cards out: it has no date of its own, so nothing can be
 * put into it. Drops here are rejected in Board, but the droppable is still
 * needed — without it a card released over this column would land in the
 * neighbouring day instead.
 */
export function OverdueColumn({ tasks, labels, onOpenTask }: Props) {
  const { setNodeRef } = useDroppable({ id: columnIdOf(OVERDUE) })

  return (
    <section className="board__col board__col--overdue" ref={setNodeRef}>
      <header className="board__col-head">
        <span className="board__col-date board__col-date--overdue">Просрочено</span>
      </header>

      <div className="board__list">
        <SortableContext items={tasks.map((t) => t.id)} strategy={verticalListSortingStrategy}>
          {tasks.map((task) => (
            <TaskCard
              key={task.id}
              task={task}
              labels={labels}
              column={OVERDUE}
              showDate
              onOpen={onOpenTask}
            />
          ))}
        </SortableContext>
      </div>
    </section>
  )
}
