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
 * Просроченное, до чего иначе пришлось бы скроллить назад.
 * Колонка только отдаёт карточки: своей даты у неё нет, класть в неё нечего.
 * Дроп сюда гасится в Board, но droppable нужен — иначе карточка,
 * отпущенная над колонкой, уехала бы в соседний день.
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
