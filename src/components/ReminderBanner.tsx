import { useMemo } from 'react'
import { diffDays, pluralDays } from '../db/dates'
import { useToday } from '../state/useToday'
import type { ID, Task } from '../db/types'
import './ReminderBanner.css'

/*
 * The only way this app reminds you of anything.
 * There are no push notifications: the banner is visible only while the app is open.
 */

interface Props {
  tasks: Task[]
  onOpenTask: (id: ID) => void
  onDismiss: () => void
}

interface Entry {
  task: Task
  days: number
}

export function ReminderBanner({ tasks, onOpenTask, onDismiss }: Props) {
  const now = useToday()

  const { overdue, dueToday, soon } = useMemo(() => {
    const overdue: Entry[] = []
    const dueToday: Entry[] = []
    const soon: Entry[] = []

    for (const task of tasks) {
      if (task.done || !task.due_date) continue
      const days = diffDays(now, task.due_date)

      if (days < 0) overdue.push({ task, days })
      else if (days === 0) dueToday.push({ task, days })
      else if (task.remind_days_before !== null && days <= task.remind_days_before) {
        soon.push({ task, days })
      }
    }

    const byDate = (a: Entry, b: Entry) => a.days - b.days
    return {
      overdue: overdue.sort(byDate),
      dueToday: dueToday.sort(byDate),
      soon: soon.sort(byDate),
    }
  }, [tasks, now])

  if (overdue.length === 0 && dueToday.length === 0 && soon.length === 0) return null

  return (
    <div className="reminders">
      <div className="reminders__list">
        {overdue.map(({ task, days }) => (
          <Chip
            key={task.id}
            task={task}
            tone="overdue"
            note={`просрочено на ${pluralDays(-days)}`}
            onOpen={onOpenTask}
          />
        ))}
        {dueToday.map(({ task }) => (
          <Chip key={task.id} task={task} tone="today" note="сегодня" onOpen={onOpenTask} />
        ))}
        {soon.map(({ task, days }) => (
          <Chip
            key={task.id}
            task={task}
            tone="soon"
            note={`через ${pluralDays(days)}`}
            onOpen={onOpenTask}
          />
        ))}
      </div>

      <button className="reminders__close" onClick={onDismiss} title="Скрыть до следующего входа">
        ✕
      </button>
    </div>
  )
}

function Chip({
  task,
  tone,
  note,
  onOpen,
}: {
  task: Task
  tone: 'overdue' | 'today' | 'soon'
  note: string
  onOpen: (id: ID) => void
}) {
  return (
    <button className={`reminders__chip reminders__chip--${tone}`} onClick={() => onOpen(task.id)}>
      <span className="reminders__chip-title">{task.title}</span>
      <span className="reminders__chip-note">{note}</span>
    </button>
  )
}
