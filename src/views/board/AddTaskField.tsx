import { useState } from 'react'
import { createTask } from '../../db/api'
import { useEscape } from '../../lib/useEscape'
import type { ID, ISODate } from '../../db/types'

interface Props {
  workspaceId: ID
  /** `null` creates the task without a date. */
  date: ISODate | null
  onClose: () => void
}

/** Inline task creation right in the column: Enter creates, Escape closes. */
export function AddTaskField({ workspaceId, date, onClose }: Props) {
  const [title, setTitle] = useState('')
  useEscape(onClose)

  async function submit() {
    const value = title.trim()
    if (!value) {
      onClose()
      return
    }
    // Keep the field open: people usually add several tasks in a row.
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
