import { useCallback, useEffect, useMemo, useState } from 'react'
import { renderMarkdown } from '../lib/markdown'
import { useAutosave } from '../lib/useAutosave'
import { useEscape } from '../lib/useEscape'
import { createLabel, deleteLabel, deleteTask, updateLabel, updateTask } from '../db/api'
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

  useEscape(onClose)

  // Задачу могли удалить на другом устройстве, пока карточка была открыта.
  // `undefined` — база ещё не ответила, `null` — задачи действительно нет.
  useEffect(() => {
    if (task === null) onClose()
  }, [task, onClose])

  if (!task) return null

  return (
    <div className="dialog__scrim" onMouseDown={onClose}>
      <div className="dialog" onMouseDown={(e) => e.stopPropagation()}>
        <Body
          key={task.id}
          task={task}
          workspaceId={workspaceId}
          labels={labels}
          preview={preview}
          onSetPreview={setPreview}
          onClose={onClose}
        />
      </div>
    </div>
  )
}

function Body({
  task,
  workspaceId,
  labels,
  preview,
  onSetPreview,
  onClose,
}: {
  task: NonNullable<ReturnType<typeof useTask>>
  workspaceId: ID
  labels: Label[]
  preview: boolean
  onSetPreview: (v: boolean) => void
  onClose: () => void
}) {
  const id = task.id
  const patch = useCallback(
    (p: Parameters<typeof updateTask>[1]) => void updateTask(id, p),
    [id],
  )

  // Название и описание пишутся с задержкой: запись на каждое нажатие клавиши
  // приводила к потере символов — значение поля приходит из базы асинхронно
  // и успевало откатить уже набранное.
  const [title, setTitle] = useAutosave(task.title, (v) => patch({ title: v }))
  const [description, setDescription] = useAutosave(task.description, (v) =>
    patch({ description: v }),
  )

  const html = useMemo(() => (preview ? renderMarkdown(description) : ''), [preview, description])

  /*
   * Поле `type=date` шлёт onChange на каждый набранный символ. Пока человек
   * печатает год, браузер успевает отдать промежуточное «0202-03-01», и такая
   * дата уезжает в базу и в таймлайн. Записываем только правдоподобные даты.
   */
  function patchDate(key: 'start_date' | 'due_date', raw: string) {
    if (raw === '') return patch({ [key]: null })
    const year = Number(raw.slice(0, 4))
    if (!/^\d{4}-\d{2}-\d{2}$/.test(raw) || year < 1970 || year > 2999) return
    patch({ [key]: raw })
  }

  async function remove() {
    if (!confirm(`Удалить задачу «${task.title}»?`)) return
    await deleteTask(task.id)
    onClose()
  }

  return (
    <>
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
        value={title}
        placeholder="Название"
        onChange={(e) => setTitle(e.target.value)}
      />

      <div className="dialog__dates">
        <Field label="Начало">
          <input
            className="field"
            type="date"
            min="1970-01-01"
            max="2999-12-31"
            value={task.start_date ?? ''}
            onChange={(e) => patchDate('start_date', e.target.value)}
          />
        </Field>
        <Field label="Дедлайн">
          <input
            className="field"
            type="date"
            min="1970-01-01"
            max="2999-12-31"
            value={task.due_date ?? ''}
            onChange={(e) => patchDate('due_date', e.target.value)}
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
          <button className="dialog__link" onClick={() => onSetPreview(!preview)}>
            {preview ? 'Править' : 'Просмотр'}
          </button>
        }
      >
        {preview ? (
          <div className="md dialog__markdown" dangerouslySetInnerHTML={{ __html: html }} />
        ) : (
          <textarea
            className="field dialog__textarea"
            value={description}
            placeholder="Markdown"
            onChange={(e) => setDescription(e.target.value)}
          />
        )}
      </Field>

      <CustomFields
        fields={task.custom_fields}
        onChange={(custom_fields) => patch({ custom_fields })}
      />

      <div className="dialog__foot">
        <button className="btn btn--quiet btn--danger" onClick={() => void remove()}>
          Удалить задачу
        </button>
      </div>
    </>
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

type LabelMode = 'pick' | 'new' | 'manage'

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
  const [mode, setMode] = useState<LabelMode>('pick')
  const [name, setName] = useState('')
  const [color, setColor] = useState<LabelColor>('blue')

  async function add() {
    if (!name.trim()) return
    const id = await createLabel(workspaceId, name, color)
    onChange([...selected, id])
    setName('')
    setMode('pick')
  }

  function toggle(id: ID) {
    onChange(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id])
  }

  async function remove(label: Label) {
    if (!confirm(`Удалить метку «${label.name}»? Она снимется со всех задач.`)) return
    await deleteLabel(label.id)
  }

  return (
    <div className="dialog__field">
      <div className="dialog__field-head">
        <span className="dialog__field-label">Метки</span>
        <span className="dialog__links">
          {labels.length > 0 && (
            <button
              className="dialog__link"
              onClick={() => setMode(mode === 'manage' ? 'pick' : 'manage')}
            >
              {mode === 'manage' ? 'Готово' : 'Правка'}
            </button>
          )}
          <button
            className="dialog__link"
            onClick={() => setMode(mode === 'new' ? 'pick' : 'new')}
          >
            {mode === 'new' ? 'Отмена' : 'Новая'}
          </button>
        </span>
      </div>

      {mode === 'manage' ? (
        <div className="labels__manage">
          {labels.map((label) => (
            <LabelRow key={label.id} label={label} onRemove={() => void remove(label)} />
          ))}
        </div>
      ) : (
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
      )}

      {mode === 'new' && (
        <div className="labels__new">
          <ColorPicker value={color} onChange={setColor} />
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

function LabelRow({ label, onRemove }: { label: Label; onRemove: () => void }) {
  const [name, setName] = useAutosave(label.name, (v) => {
    if (v.trim()) void updateLabel(label.id, { name: v.trim() })
  })

  return (
    <div className="labels__row">
      <ColorPicker
        value={label.color}
        onChange={(color) => void updateLabel(label.id, { color })}
      />
      <input className="field" value={name} onChange={(e) => setName(e.target.value)} />
      <button className="btn btn--quiet labels__del" onClick={onRemove} aria-label="Удалить метку">
        ✕
      </button>
    </div>
  )
}

function ColorPicker({
  value,
  onChange,
}: {
  value: LabelColor
  onChange: (c: LabelColor) => void
}) {
  return (
    <div className="labels__colors">
      {LABEL_COLORS.map((c) => (
        <button
          key={c}
          className={`labels__swatch${c === value ? ' labels__swatch--on' : ''}`}
          style={{ background: `var(--label-${c})` }}
          onClick={() => onChange(c)}
          aria-label={c}
        />
      ))}
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
        <button
          className="dialog__link"
          onClick={() => onChange([...fields, { name: '', value: '' }])}
        >
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
