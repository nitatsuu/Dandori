import type { BoardMode } from '../state/ui'
import type { ID, Label, Task } from '../db/types'

export interface BoardProps {
  workspaceId: ID
  /** Уже отфильтрованы по меткам. */
  tasks: Task[]
  labels: Label[]
  mode: BoardMode
  onSetMode: (mode: BoardMode) => void
  onOpenTask: (id: ID) => void
}

export function Board(_props: BoardProps) {
  return null
}
