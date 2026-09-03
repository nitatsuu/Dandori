import type { ID, Label, Task } from '../db/types'

export interface TimelineProps {
  /** Уже отфильтрованы по меткам. */
  tasks: Task[]
  labels: Label[]
  onOpenTask: (id: ID) => void
}

export function Timeline(_props: TimelineProps) {
  return null
}
