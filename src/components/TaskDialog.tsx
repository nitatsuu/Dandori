import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { renderMarkdown } from '../lib/markdown'
import { useAutosave } from '../lib/useAutosave'
import { useEscape } from '../lib/useEscape'
import { createLabel, createNote, deleteLabel, deleteTask, updateLabel, updateTask } from '../db/api'
import { useNotes, useTask } from '../db/hooks'
import { pluralDays } from '../db/dates'
import {
  LABEL_COLORS,
  type CustomField,
  type ID,
  type Label,
  type LabelColor,
  type Note,
} from '../db/types'
import './TaskDialog.css'

/** Same debounce as the shared autosave hook: one write per pause in typing. */
const SAVE_DELAY = 500

interface Props {
  taskId: ID
  workspaceId: ID
  labels: Label[]
  /** Switches to the notes tab and opens the attached note. */
  onOpenNote: (id: ID) => void
  onClose: () => void
}

/** The whole task card: title, description, dates, labels, custom fields. */
export function TaskDialog({ taskId, workspaceId, labels, onOpenNote, onClose }: Props) {
  const task = useTask(taskId)
  const [preview, setPreview] = useState(false)

  useEscape(onClose)

  // The task may have been deleted on another device while this dialog was open.
  // `undefined` means the database has not answered yet, `null` means it is really gone.
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
          onOpenNote={onOpenNote}
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
  onOpenNote,
  onClose,
}: {
  task: NonNullable<ReturnType<typeof useTask>>
  workspaceId: ID
  labels: Label[]
  preview: boolean
  onSetPreview: (v: boolean) => void
  onOpenNote: (id: ID) => void
  onClose: () => void
}) {
  const id = task.id
  const patch = useCallback(
    (p: Parameters<typeof updateTask>[1]) => void updateTask(id, p),
    [id],
  )

  // Title and description are saved on a delay: writing on every keystroke lost
  // characters — the field value comes back from the database asynchronously and
  // would roll back what had already been typed.
  const [title, setTitle] = useAutosave(task.title, (v) => patch({ title: v }))
  const [description, setDescription] = useAutosave(task.description, (v) =>
    patch({ description: v }),
  )

  const html = useMemo(() => (preview ? renderMarkdown(description) : ''), [preview, description])

  /*
   * A `type=date` input fires onChange on every typed character. While someone is
   * still typing the year the browser hands over an intermediate «0202-03-01», and
   * that date would travel into the database and the timeline. Only write dates
   * that look plausible.
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

      {/*
        Separate from the select above. "Не напоминать" only drops the advance
        warning; a task due today or already overdue still shows up in the banner,
        because that is the whole point of a deadline tracker. This is the opt-out
        for the few tasks that should stay quiet regardless.
      */}
      <label className="dialog__mute">
        <input
          type="checkbox"
          checked={task.muted}
          onChange={(e) => patch({ muted: e.target.checked })}
        />
        <span>Не показывать в напоминаниях</span>
      </label>

      <NoteLink task={task} workspaceId={workspaceId} onOpenNote={onOpenNote} />

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

// ----------------------------------------------------------------------- note

/**
 * A note attached to the task. One-way: the task points at the note, the note
 * knows nothing about the task. Deleting the note clears the link rather than
 * leaving a dead one behind.
 */
function NoteLink({
  task,
  workspaceId,
  onOpenNote,
}: {
  task: { id: ID; title: string; note_id: ID | null }
  workspaceId: ID
  onOpenNote: (id: ID) => void
}) {
  const notes = useNotes(workspaceId)
  const [picking, setPicking] = useState(false)

  // Folders hold no text, so only files can be attached.
  const files = (notes ?? []).filter((n: Note) => n.kind === 'file')
  const linked = task.note_id ? (files.find((n) => n.id === task.note_id) ?? null) : null

  async function create() {
    const id = await createNote(workspaceId, 'file', null, task.title)
    await updateTask(task.id, { note_id: id })
    setPicking(false)
  }

  return (
    <div className="dialog__field">
      <div className="dialog__field-head">
        <span className="dialog__field-label">Заметка</span>
        {linked && (
          <button
            className="dialog__link"
            onClick={() => void updateTask(task.id, { note_id: null })}
          >
            Отвязать
          </button>
        )}
      </div>

      {linked ? (
        <button className="notelink" onClick={() => onOpenNote(linked.id)}>
          <span className="notelink__icon">📄</span>
          <span className="notelink__name">{linked.name.trim() || 'Без названия'}</span>
          <span className="dialog__link">Открыть</span>
        </button>
      ) : picking ? (
        <div className="notelink__pick">
          <select
            className="field"
            defaultValue=""
            autoFocus
            onChange={(e) => {
              if (!e.target.value) return
              void updateTask(task.id, { note_id: e.target.value })
              setPicking(false)
            }}
          >
            <option value="">Выбрать заметку</option>
            {files.map((n) => (
              <option key={n.id} value={n.id}>
                {n.name.trim() || 'Без названия'}
              </option>
            ))}
          </select>
          <button className="btn" onClick={() => void create()}>
            Создать
          </button>
          <button className="btn btn--quiet" onClick={() => setPicking(false)}>
            Отмена
          </button>
        </div>
      ) : (
        <button className="btn btn--quiet notelink__add" onClick={() => setPicking(true)}>
          Привязать заметку
        </button>
      )}
    </div>
  )
}

// --------------------------------------------------------------------- labels

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

// --------------------------------------------------------------- custom fields

/*
 * A custom field has to carry the same visual weight as the description box next
 * to it, otherwise it reads as something bolted onto the card. So the pair lives
 * inside one bordered box: the name on a dim line at the top, the value below in
 * the body. Both are plain inputs — nothing to click into an editing mode, and
 * nothing to save.
 */

function CustomFields({
  fields,
  onChange,
}: {
  fields: CustomField[]
  onChange: (f: CustomField[]) => void
}) {
  // Rows written before ids existed get one now, so editing state cannot follow
  // the wrong row after a deletion.
  const missingIds = fields.some((f) => !f.id)
  useEffect(() => {
    if (missingIds) onChange(fields.map((f) => (f.id ? f : { ...f, id: crypto.randomUUID() })))
  }, [missingIds, fields, onChange])

  function add() {
    onChange([...fields, { id: crypto.randomUUID(), name: '', value: '' }])
  }

  return (
    <div className="dialog__field">
      <div className="dialog__field-head">
        <span className="dialog__field-label">Поля</span>
        <button className="dialog__link" onClick={add}>
          Добавить
        </button>
      </div>

      {fields.map((field, i) => (
        <CustomFieldRow
          key={field.id ?? i}
          field={field}
          autoFocus={field.name === '' && field.value === ''}
          onChange={(next) => onChange(fields.map((f, j) => (i === j ? next : f)))}
          onRemove={() => onChange(fields.filter((_, j) => j !== i))}
        />
      ))}
    </div>
  )
}

function CustomFieldRow({
  field,
  autoFocus,
  onChange,
  onRemove,
}: {
  field: CustomField
  autoFocus: boolean
  onChange: (f: CustomField) => void
  onRemove: () => void
}) {
  const [draft, setDraft] = useState(field)
  const current = useRef(field)
  const synced = useRef(field)
  const dirty = useRef(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const changeRef = useRef(onChange)
  useEffect(() => {
    changeRef.current = onChange
  })

  /*
   * The whole row is written at once, not one input at a time.
   * Both inputs live in the same object, so two independent debounced writes
   * would each send a copy built from whatever they captured — and the later
   * one would put the other's field back to its old value.
   */
  const flush = useCallback(() => {
    if (timer.current !== null) {
      clearTimeout(timer.current)
      timer.current = null
    }
    if (!dirty.current) return
    dirty.current = false
    synced.current = current.current
    changeRef.current(current.current)
  }, [])

  function edit(part: Partial<CustomField>) {
    const next = { ...current.current, ...part }
    current.current = next
    setDraft(next)
    dirty.current = true
    if (timer.current !== null) clearTimeout(timer.current)
    timer.current = setTimeout(flush, SAVE_DELAY)
  }

  // An edit arriving from another device is taken only while nothing local is
  // waiting to be written; otherwise it would yank the text from under the caret.
  useEffect(() => {
    if (field.name === synced.current.name && field.value === synced.current.value) return
    synced.current = field
    if (dirty.current) return
    current.current = field
    setDraft(field)
  }, [field])

  useEffect(() => flush, [flush])

  return (
    <div className="cfield">
      <div className="cfield__head">
        <input
          className="cfield__name"
          value={draft.name}
          placeholder="Имя поля"
          autoFocus={autoFocus}
          onChange={(e) => edit({ name: e.target.value })}
        />
        <button className="cfield__del" onClick={onRemove} aria-label="Удалить поле">
          ✕
        </button>
      </div>

      <input
        className="cfield__value"
        value={draft.value}
        placeholder="Значение"
        onChange={(e) => edit({ value: e.target.value })}
      />
    </div>
  )
}
