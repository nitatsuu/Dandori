import { useState } from 'react'
import { createTask } from '../../db/api'
import { useEscape } from '../../lib/useEscape'
import type { ID, ISODate } from '../../db/types'

interface Props {
  workspaceId: ID
  /** `null` — задача создаётся без даты. */
  date: ISODate | null
  onClose: () => void
}

/** Инлайн-создание задачи прямо в колонке: Enter — создать, Escape — закрыть. */
export function AddTaskField({ workspaceId, date, onClose }: Props) {
  const [title, setTitle] = useState('')
  useEscape(onClose)

  async function submit() {
    const value = title.trim()
    if (!value) {
      onClose()
      return
    }
    // Поле остаётся открытым: подряд обычно заводят несколько задач.
    setTitle('')
    await createTask(workspaceId, { title: value, due_date: date })
  }

  return (
    <input
      className="field board__new"
      value={title}
      placeholder="Задача"
      autoFocus
      onChange={(e) => setTitle(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') void submit()
      }}
      onBlur={() => {
        if (!title.trim()) onClose()
      }}
    />
  )
}
