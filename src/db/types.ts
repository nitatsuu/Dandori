/** Идентификатор — uuid v4, генерируется на клиенте. */
export type ID = string

/** Дата без времени суток, формат `YYYY-MM-DD`. */
export type ISODate = string

/** Служебная метка времени, в интерфейсе не показывается. */
export type Timestamp = string

/** Цвета меток. Названия задаёт пользователь, в коде их нет. */
export const LABEL_COLORS = [
  'red',
  'orange',
  'amber',
  'green',
  'teal',
  'blue',
  'violet',
  'pink',
  'slate',
] as const

export type LabelColor = (typeof LABEL_COLORS)[number]

/** Поля, общие для всех синхронизируемых записей. */
export interface Synced {
  id: ID
  created_at: Timestamp
  updated_at: Timestamp
  /** Мягкое удаление: иначе удаление на телефоне не доедет до офлайн-ноутбука. */
  deleted: boolean
}

export interface Workspace extends Synced {
  name: string
  position: number
}

export interface Label extends Synced {
  workspace_id: ID
  name: string
  color: LabelColor
  position: number
}

/** Произвольное поле карточки: пользователь сам задаёт имя и значение. */
export interface CustomField {
  name: string
  value: string
}

export interface Task extends Synced {
  workspace_id: ID
  title: string
  description: string
  start_date: ISODate | null
  due_date: ISODate | null
  done: boolean
  /** Напомнить за сколько дней до дедлайна. `null` — не напоминать. */
  remind_days_before: number | null
  /** Порядок внутри своей колонки-дня. */
  position: number
  label_ids: ID[]
  custom_fields: CustomField[]
}

export type NoteKind = 'folder' | 'file'

export interface Note extends Synced {
  workspace_id: ID
  parent_id: ID | null
  kind: NoteKind
  name: string
  /** Пусто у папок. */
  content: string
  position: number
}

/** Таблицы, участвующие в синхронизации. */
export const SYNCED_TABLES = ['workspaces', 'labels', 'tasks', 'notes'] as const
export type SyncedTable = (typeof SYNCED_TABLES)[number]
