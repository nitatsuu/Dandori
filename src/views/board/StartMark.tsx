import { useT } from '../../i18n'
import type { ID, Label, Task } from '../../db/types'
import { accent } from './model'

interface Props {
  task: Task
  labels: Label[]
  /** In a month cell, where the mark is drawn at the size of the cell's own entries. */
  compact?: boolean
  onOpen: (id: ID) => void
}

/*
 * A task that starts on one day and is due on another: the card stands on the
 * day the task stands on, and this says the work begins here. It is a note
 * about that card and nothing more — it opens the task and that is all. No
 * checkbox and nothing to drag: a start is moved where the other dates are, in
 * the card or by carrying the card itself, and one task with two handles in two
 * columns is two places to be wrong about what was just moved.
 */
export function StartMark({ task, labels, compact, onOpen }: Props) {
  const t = useT()

  return (
    <button
      type="button"
      className={`board__start${compact ? ' board__start--compact' : ''}`}
      style={accent(task, labels)}
      onClick={() => onOpen(task.id)}
    >
      <span className="board__start-word">{t('task.start')}</span>
      <span className="board__start-title">{task.title}</span>
    </button>
  )
}
