import { useEffect, useState } from 'react'
import { marked } from 'marked'
import { createLabel, deleteTask, updateTask } from '../db/api'
import { useTask } from '../db/hooks'
import { pluralDays } from '../db/dates'
import { LABEL_COLORS, type CustomField, type ID, type Label, type LabelColor } from '../db/types'
import './TaskDialog.css'

interface Props {
  taskId: ID
  workspaceId: ID
  labels: Label[]
  onClose: () => void
}

/** Карточка целиком: название, описание, даты, метки, произвольные поля. */
export function TaskDialog({ taskId, workspaceId, labels, onClose }: Props) {
  const task = useTask(taskId)
  const [preview, setPreview] = useState(false)

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  // Задачу могли удалить на другом устройстве, пока карточка была открыта.
  useEffect(() => {
    if (task === undefined) return
    if (!task) onClose()
  }, [task, onClose])

  if (!task) return null

  const patch = (p: Parameters<typeof updateTask>[1]) => void updateTask(task.id, p)

  async function remove() {
    if (!task) return
    if (!confirm(`Удалить задачу «${task.title}»?`)) return
    await deleteTask(task.id)
    onClose()
  }

  return (
    <div className="dialog__scrim" onMouseDown={onClose}>
      <div className="dialog" onMouseDown={(e) => e.stopPropagation()}>
        <div className="dialog__head">
          <label className="dialog__done">
            <input
              type="checkbox"
              checked={task.done}
              onChange={(e) => patch({ done: e.target.checked })}
            />
            <span>Готово</span>
          </label>
          <button className="btn btn--quiet dialog__close" onClick={onClose}>
            ✕
          </button>
        </div>

        <input
          className="dialog__title"
          value={task.title}
          placeholder="Название"
          onChange={(e) => patch({ title: e.target.value })}
        />

        <div className="dialog__dates">
          <Field label="Начало">
            <input
              className="field"
              type="date"
              value={task.start_date ?? ''}
              onChange={(e) => patch({ start_date: e.target.value || null })}
            />
          </Field>
          <Field label="Дедлайн">
            <input
              className="field"
              type="date"
              value={task.due_date ?? ''}
              onChange={(e) => patch({ due_date: e.target.value || null })}
            />
          </Field>
          <Field label="Напомнить">
            <select
              className="field"
              value={task.remind_days_before ?? ''}
              onChange={(e) =>
                patch({ remind_days_before: e.target.value === '' ? null : Number(e.target.value) })
              }
              disabled={!task.due_date}
            >
              <option value="">Не напоминать</option>
              {[1, 2, 3, 7, 14, 30].map((n) => (
                <option key={n} value={n}>
                  За {pluralDays(n)}
                </option>
              ))}
            </select>
          </Field>
        </div>

        <LabelPicker
          workspaceId={workspaceId}
          labels={labels}
          selected={task.label_ids}
          onChange={(label_ids) => patch({ label_ids })}
        />

        <Field
          label="Описание"
          aside={
            <button className="dialog__link" onClick={() => setPreview((v) => !v)}>
              {preview ? 'Править' : 'Просмотр'}
            </button>
          }
        >
          {preview ? (
            <div
              className="dialog__markdown"
              dangerouslySetInnerHTML={{ __html: marked.parse(task.description) as string }}
            />
          ) : (
            <textarea
              className="field dialog__textarea"
              value={task.description}
              placeholder="Markdown"
              onChange={(e) => patch({ description: e.target.value })}
            />
          )}
        </Field>

        <CustomFields
          fields={task.custom_fields}
          onChange={(custom_fields) => patch({ custom_fields })}
        />

        <div className="dialog__foot">
          <button className="btn btn--quiet btn--danger" onClick={remove}>
            Удалить задачу
          </button>
        </div>
      </div>
    </div>
  )
}

function Field({
  label,
  aside,
  children,
}: {
  label: string
  aside?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <div className="dialog__field">
      <div className="dialog__field-head">
        <span className="dialog__field-label">{label}</span>
        {aside}
      </div>
      {children}
    </div>
  )
}

// ---------------------------------------------------------------------- метки

function LabelPicker({
  workspaceId,
  labels,
  selected,
  onChange,
}: {
  workspaceId: ID
  labels: Label[]
  selected: ID[]
  onChange: (ids: ID[]) => void
}) {
  const [adding, setAdding] = useState(false)
  const [name, setName] = useState('')
  const [color, setColor] = useState<LabelColor>('blue')

  async function add() {
    if (!name.trim()) return
    const id = await createLabel(workspaceId, name, color)
    onChange([...selected, id])
    setName('')
    setAdding(false)
  }

  function toggle(id: ID) {
    onChange(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id])
  }

  return (
    <div className="dialog__field">
      <div className="dialog__field-head">
        <span className="dialog__field-label">Метки</span>
        <button className="dialog__link" onClick={() => setAdding((v) => !v)}>
          {adding ? 'Отмена' : 'Новая'}
        </button>
      </div>

      <div className="labels">
        {labels.map((label) => (
          <button
            key={label.id}
            className={`labels__pill${selected.includes(label.id) ? ' labels__pill--on' : ''}`}
            style={{ '--pill': `var(--label-${label.color})` } as React.CSSProperties}
            onClick={() => toggle(label.id)}
          >
            {label.name}
          </button>
        ))}
      </div>

      {adding && (
        <div className="labels__new">
          <div className="labels__colors">
            {LABEL_COLORS.map((c) => (
              <button
                key={c}
                className={`labels__swatch${c === color ? ' labels__swatch--on' : ''}`}
                style={{ background: `var(--label-${c})` }}
                onClick={() => setColor(c)}
                aria-label={c}
              />
            ))}
          </div>
          <input
            className="field"
            value={name}
            placeholder="Название метки"
            autoFocus
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && void add()}
          />
          <button className="btn btn--primary" onClick={() => void add()}>
            Добавить
          </button>
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------- произвольные поля

function CustomFields({
  fields,
  onChange,
}: {
  fields: CustomField[]
  onChange: (f: CustomField[]) => void
}) {
  function patch(i: number, part: Partial<CustomField>) {
    onChange(fields.map((f, j) => (i === j ? { ...f, ...part } : f)))
  }

  return (
    <div className="dialog__field">
      <div className="dialog__field-head">
        <span className="dialog__field-label">Поля</span>
        <button className="dialog__link" onClick={() => onChange([...fields, { name: '', value: '' }])}>
          Добавить
        </button>
      </div>

      {fields.map((field, i) => (
        <div className="cfield" key={i}>
          <input
            className="field cfield__name"
            value={field.name}
            placeholder="Имя"
            onChange={(e) => patch(i, { name: e.target.value })}
          />
          <input
            className="field"
            value={field.value}
            placeholder="Значение"
            onChange={(e) => patch(i, { value: e.target.value })}
          />
          <button
            className="btn btn--quiet cfield__del"
            onClick={() => onChange(fields.filter((_, j) => j !== i))}
            aria-label="Удалить поле"
          >
            ✕
          </button>
        </div>
      ))}
    </div>
  )
}
