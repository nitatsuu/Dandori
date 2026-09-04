import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createNote, deleteNote, updateNote } from '../db/api'
import { useNotes } from '../db/hooks'
import { emptyOf } from '../lib/empty'
import { renderMarkdown } from '../lib/markdown'
import { useAutosave } from '../lib/useAutosave'
import { useEscape } from '../lib/useEscape'
import type { ID, Note, NoteKind } from '../db/types'
import './Notes.css'

export interface NotesProps {
  workspaceId: ID
  /** A note to open, requested from elsewhere — a task links to it. */
  openNoteId?: ID | null
  /** Called once the request has been honoured, so the caller can clear it. */
  onOpened?: () => void
}

const MENU_W = 168

interface Row {
  note: Note
  depth: number
}

interface Menu {
  id: ID
  x: number
  y: number
}

export function Notes({ workspaceId, openNoteId, onOpened }: NotesProps) {
  // Undefined while the database is still answering; that is not the same as «нет заметок»
  // and an outside request must not be resolved against it.
  const loaded = useNotes(workspaceId)
  const notes = loaded ?? emptyOf<Note>()

  const [selectedId, setSelectedId] = useState<ID | null>(null)
  // Folder expansion is screen state, not data: it is never written to the database.
  const [expanded, setExpanded] = useState<ReadonlySet<ID>>(() => new Set())
  const [renamingId, setRenamingId] = useState<ID | null>(null)
  const [menu, setMenu] = useState<Menu | null>(null)
  // Phone: the tree and the editor do not fit side by side, so show one at a time.
  const [detail, setDetail] = useState(false)
  // The row to scroll to once the folders above it are open and it is in the DOM.
  const [scrollTo, setScrollTo] = useState<ID | null>(null)
  const rowsRef = useRef<HTMLDivElement>(null)

  const selected = notes.find((n) => n.id === selectedId) ?? null
  const openFile = selected?.kind === 'file' ? selected : null

  const rows = useMemo(() => visibleRows(notes, expanded), [notes, expanded])

  /*
   * Opening a note on request from another view.
   *
   * The request is answered during render, the way the rest of the app derives state
   * from a changed prop. Nothing is decided until `useNotes` has answered: until then
   * a note that is missing is indistinguishable from one deleted on another device.
   * Once the list is in, the caller is told either way — a request for a note that is
   * gone would otherwise hang forever.
   */
  const request = openNoteId ?? null
  const [answered, setAnswered] = useState<ID | null>(null)

  if (request !== answered) {
    if (request === null) {
      setAnswered(null)
    } else if (loaded !== undefined) {
      setAnswered(request)
      const note = loaded.find((n) => n.id === request)
      if (note) {
        setSelectedId(note.id)
        setExpanded((prev) => expandTo(prev, loaded, note))
        setScrollTo(note.id)
        if (note.kind === 'file') setDetail(true)
      }
    }
  }

  // Ref to the current callback, so that the notification below does not depend on its identity.
  const openedRef = useRef(onOpened)
  useEffect(() => {
    openedRef.current = onOpened
  })

  // The caller is told after the commit: it answers with a state change of its own.
  useEffect(() => {
    if (answered !== null) openedRef.current?.()
  }, [answered])

  useLayoutEffect(() => {
    if (!scrollTo) return
    const row = rowsRef.current?.querySelector<HTMLElement>(`[data-id="${scrollTo}"]`)
    // On the phone the tree is hidden while the editor is open and the row has no
    // geometry yet: hold the request until the user comes back to the tree.
    if (row && row.offsetParent === null) return
    setScrollTo(null)
    row?.scrollIntoView({ block: 'nearest' })
  }, [scrollTo, detail, rows])

  function toggle(id: ID) {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (!next.delete(id)) next.add(id)
      return next
    })
  }

  function select(note: Note) {
    setSelectedId(note.id)
    if (note.kind === 'folder') toggle(note.id)
    else setDetail(true)
  }

  async function create(kind: NoteKind) {
    const parentId = selected?.kind === 'folder' ? selected.id : null
    const id = await createNote(workspaceId, kind, parentId, '')
    if (parentId) setExpanded((prev) => new Set(prev).add(parentId))
    setSelectedId(id)
    // Put a freshly created item straight into rename mode: the default name suits almost nobody.
    setRenamingId(id)
  }

  function rename(id: ID, name: string) {
    setRenamingId(null)
    const trimmed = name.trim()
    if (trimmed) void updateNote(id, { name: trimmed })
  }

  function remove(note: Note) {
    const what =
      note.kind === 'folder' ? `папку «${note.name}» со всем содержимым` : `заметку «${note.name}»`
    if (!confirm(`Удалить ${what}?`)) return
    // deleteNote takes down the subtree itself, no need to duplicate the walk here.
    void deleteNote(note.id)
  }

  const menuNote = menu ? (notes.find((n) => n.id === menu.id) ?? null) : null

  return (
    <div className={`notes${detail && openFile ? ' notes--detail' : ''}`}>
      <aside className="notes__tree">
        <div className="notes__head">
          <button
            className="notes__head-btn"
            title="Новая заметка"
            aria-label="Новая заметка"
            onClick={() => void create('file')}
          >
            ＋📄
          </button>
          <button
            className="notes__head-btn"
            title="Новая папка"
            aria-label="Новая папка"
            onClick={() => void create('folder')}
          >
            ＋📁
          </button>
        </div>

        <div className="notes__rows" role="tree" ref={rowsRef}>
          {rows.map(({ note, depth }) => (
            <div
              key={note.id}
              data-id={note.id}
              className={`notes__row${note.id === selectedId ? ' notes__row--on' : ''}`}
              style={{ paddingLeft: `${depth * 12 + 4}px` }}
              role="treeitem"
              aria-level={depth + 1}
              aria-selected={note.id === selectedId}
              aria-expanded={note.kind === 'folder' ? expanded.has(note.id) : undefined}
              onClick={() => select(note)}
              onContextMenu={(e) => {
                e.preventDefault()
                setMenu({ id: note.id, x: clampX(e.clientX), y: e.clientY })
              }}
            >
              <span className="notes__twist">
                {note.kind === 'folder' ? (expanded.has(note.id) ? '▾' : '▸') : ''}
              </span>
              <span className="notes__icon">{note.kind === 'folder' ? '📁' : '📄'}</span>

              {note.id === renamingId ? (
                <RenameInput
                  value={note.name}
                  onCommit={(name) => rename(note.id, name)}
                  onCancel={() => setRenamingId(null)}
                />
              ) : (
                <span className="notes__name">{note.name.trim() || 'Без названия'}</span>
              )}

              <button
                className="notes__more"
                title="Действия"
                aria-label="Действия"
                onClick={(e) => {
                  e.stopPropagation()
                  const box = e.currentTarget.getBoundingClientRect()
                  setMenu({ id: note.id, x: clampX(box.right - MENU_W), y: box.bottom })
                }}
              >
                ⋯
              </button>
            </div>
          ))}
        </div>
      </aside>

      <section className="notes__editor">
        {openFile && (
          <NoteEditor key={openFile.id} note={openFile} onBack={() => setDetail(false)} />
        )}
      </section>

      {menuNote && menu && (
        <RowMenu
          x={menu.x}
          y={menu.y}
          onClose={() => setMenu(null)}
          onRename={() => setRenamingId(menuNote.id)}
          onRemove={() => remove(menuNote)}
        />
      )}
    </div>
  )
}

function clampX(x: number): number {
  return Math.max(4, Math.min(x, window.innerWidth - MENU_W - 4))
}

/**
 * Opens every folder on the path to a note. A row inside a collapsed folder is not
 * rendered at all, so without this there would be nothing to select or scroll to.
 * The walk stops on a repeat: a parent chain that loops back on itself would
 * otherwise spin forever.
 */
function expandTo(expanded: ReadonlySet<ID>, notes: Note[], note: Note): ReadonlySet<ID> {
  const byId = new Map(notes.map((n) => [n.id, n]))
  const next = new Set(expanded)
  const seen = new Set<ID>()

  let parent = note.parent_id
  while (parent && !seen.has(parent)) {
    seen.add(parent)
    next.add(parent)
    parent = byId.get(parent)?.parent_id ?? null
  }
  return next
}

/**
 * Flat list of visible rows with their depth.
 * Within a level folders come before files, then by position.
 * A record whose parent is gone is lifted to the root, otherwise it would
 * disappear from the tree entirely.
 */
function visibleRows(notes: Note[], expanded: ReadonlySet<ID>): Row[] {
  const known = new Set(notes.map((n) => n.id))
  const children = new Map<ID | null, Note[]>()

  for (const note of notes) {
    const parent = note.parent_id && known.has(note.parent_id) ? note.parent_id : null
    const list = children.get(parent)
    if (list) list.push(note)
    else children.set(parent, [note])
  }

  for (const list of children.values()) {
    list.sort((a, b) =>
      a.kind === b.kind ? a.position - b.position : a.kind === 'folder' ? -1 : 1,
    )
  }

  const rows: Row[] = []
  const walk = (parent: ID | null, depth: number) => {
    for (const note of children.get(parent) ?? []) {
      rows.push({ note, depth })
      if (note.kind === 'folder' && expanded.has(note.id)) walk(note.id, depth + 1)
    }
  }
  walk(null, 0)
  return rows
}

// ------------------------------------------------------------------ renaming

function RenameInput({
  value,
  onCommit,
  onCancel,
}: {
  value: string
  onCommit: (name: string) => void
  onCancel: () => void
}) {
  const [draft, setDraft] = useState(value)

  return (
    <input
      className="notes__rename"
      value={draft}
      autoFocus
      onFocus={(e) => e.target.select()}
      onClick={(e) => e.stopPropagation()}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => onCommit(draft)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') onCommit(draft)
        if (e.key === 'Escape') onCancel()
      }}
    />
  )
}

// -------------------------------------------------------------- context menu

function RowMenu({
  x,
  y,
  onClose,
  onRename,
  onRemove,
}: {
  x: number
  y: number
  onClose: () => void
  onRename: () => void
  onRemove: () => void
}) {
  useEscape(onClose)

  return (
    <>
      <div
        className="notes__menu-scrim"
        onMouseDown={onClose}
        onContextMenu={(e) => {
          e.preventDefault()
          onClose()
        }}
      />
      <div className="notes__menu" style={{ left: `${x}px`, top: `${y}px` }}>
        <button
          className="notes__menu-item"
          onClick={() => {
            onClose()
            onRename()
          }}
        >
          Переименовать
        </button>
        <button
          className="notes__menu-item notes__menu-item--danger"
          onClick={() => {
            onClose()
            onRemove()
          }}
        >
          Удалить
        </button>
      </div>
    </>
  )
}

// -------------------------------------------------------------------- editor

function NoteEditor({ note, onBack }: { note: Note; onBack: () => void }) {
  const [preview, setPreview] = useState(false)
  const [name, setName] = useAutosave(note.name, (value) => void updateNote(note.id, { name: value }))
  const [content, setContent] = useAutosave(note.content, (value) =>
    void updateNote(note.id, { content: value }),
  )

  const html = useMemo(() => (preview ? renderMarkdown(content) : ''), [preview, content])

  return (
    <>
      <div className="notes__bar">
        <button className="notes__back" onClick={onBack} aria-label="К дереву">
          ‹
        </button>
        <input
          className="notes__title"
          value={name}
          placeholder="Название"
          onChange={(e) => setName(e.target.value)}
        />
        <button className="notes__link" onClick={() => setPreview((v) => !v)}>
          {preview ? 'Править' : 'Просмотр'}
        </button>
      </div>

      {preview ? (
        <div className="md notes__markdown" dangerouslySetInnerHTML={{ __html: html }} />
      ) : (
        <textarea
          className="notes__textarea"
          value={content}
          placeholder="Markdown"
          onChange={(e) => setContent(e.target.value)}
        />
      )}
    </>
  )
}
