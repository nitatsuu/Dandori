import { useEffect, useRef, useState } from 'react'
import { createWorkspace, deleteWorkspace, exportAll, renameWorkspace } from '../db/api'
import type { ID, Label, Workspace } from '../db/types'
import { signOut } from '../auth/useSession'
import { TAB_TITLES, TABS, THEMES, type Tab, type Theme } from '../state/ui'
import { LabelFilter } from './LabelFilter'
import { SyncBadge } from './SyncBadge'
import './Header.css'

interface Props {
  workspaces: Workspace[]
  currentId: ID | null
  onSelectWorkspace: (id: ID) => void
  tab: Tab
  onSelectTab: (tab: Tab) => void
  labels: Label[]
  activeLabels: ID[]
  onToggleLabel: (id: ID) => void
  theme: Theme
  onSetTheme: (theme: Theme) => void
}

const THEME_TITLES: Record<Theme, string> = {
  system: 'Как в системе',
  light: 'Светлая',
  dark: 'Тёмная',
}

export function Header(props: Props) {
  const current = props.workspaces.find((w) => w.id === props.currentId) ?? null

  return (
    <header className="header">
      <WorkspaceMenu
        workspaces={props.workspaces}
        current={current}
        onSelect={props.onSelectWorkspace}
      />

      <nav className="header__tabs">
        {TABS.map((tab) => (
          <button
            key={tab}
            className={`header__tab${tab === props.tab ? ' header__tab--on' : ''}`}
            onClick={() => props.onSelectTab(tab)}
          >
            {TAB_TITLES[tab]}
          </button>
        ))}
      </nav>

      <div className="header__right">
        {props.tab !== 'notes' && (
          <LabelFilter
            labels={props.labels}
            active={props.activeLabels}
            onToggle={props.onToggleLabel}
          />
        )}
        <SyncBadge />
        <SettingsMenu
          current={current}
          theme={props.theme}
          onSetTheme={props.onSetTheme}
          canDelete={props.workspaces.length > 1}
        />
      </div>
    </header>
  )
}

// ------------------------------------------------------------- воркспейсы

function WorkspaceMenu({
  workspaces,
  current,
  onSelect,
}: {
  workspaces: Workspace[]
  current: Workspace | null
  onSelect: (id: ID) => void
}) {
  const [open, setOpen] = useState(false)
  const ref = useOutsideClick<HTMLDivElement>(() => setOpen(false))

  async function add() {
    const name = prompt('Название воркспейса')
    if (name === null) return
    setOpen(false)
    onSelect(await createWorkspace(name))
  }

  return (
    <div className="menu" ref={ref}>
      <button className="header__ws" onClick={() => setOpen((v) => !v)}>
        <span className="header__ws-name">{current?.name ?? '—'}</span>
        <span className="header__caret">▾</span>
      </button>

      {open && (
        <div className="menu__pop">
          {workspaces.map((w) => (
            <button
              key={w.id}
              className={`menu__item${w.id === current?.id ? ' menu__item--on' : ''}`}
              onClick={() => {
                onSelect(w.id)
                setOpen(false)
              }}
            >
              {w.name}
            </button>
          ))}
          <div className="menu__sep" />
          <button className="menu__item" onClick={add}>
            Новый воркспейс
          </button>
        </div>
      )}
    </div>
  )
}

// --------------------------------------------------------------- настройки

function SettingsMenu({
  current,
  theme,
  onSetTheme,
  canDelete,
}: {
  current: Workspace | null
  theme: Theme
  onSetTheme: (t: Theme) => void
  canDelete: boolean
}) {
  const [open, setOpen] = useState(false)
  const ref = useOutsideClick<HTMLDivElement>(() => setOpen(false))

  async function rename() {
    if (!current) return
    const name = prompt('Новое название', current.name)
    if (name === null) return
    await renameWorkspace(current.id, name)
    setOpen(false)
  }

  async function remove() {
    if (!current) return
    const ok = confirm(
      `Удалить воркспейс «${current.name}»? Вместе с ним удалятся его задачи, метки и заметки.`,
    )
    if (!ok) return
    await deleteWorkspace(current.id)
    setOpen(false)
  }

  async function exportJson() {
    const json = await exportAll()
    const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }))
    const a = document.createElement('a')
    a.href = url
    a.download = `dandori-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(url)
    setOpen(false)
  }

  return (
    <div className="menu" ref={ref}>
      <button className="btn btn--quiet header__gear" onClick={() => setOpen((v) => !v)}>
        ⚙
      </button>

      {open && (
        <div className="menu__pop menu__pop--right">
          <div className="menu__label">Тема</div>
          {THEMES.map((t) => (
            <button
              key={t}
              className={`menu__item${t === theme ? ' menu__item--on' : ''}`}
              onClick={() => onSetTheme(t)}
            >
              {THEME_TITLES[t]}
            </button>
          ))}

          <div className="menu__sep" />
          <button className="menu__item" onClick={rename} disabled={!current}>
            Переименовать воркспейс
          </button>
          <button className="menu__item menu__item--danger" onClick={remove} disabled={!canDelete}>
            Удалить воркспейс
          </button>

          <div className="menu__sep" />
          <button className="menu__item" onClick={exportJson}>
            Экспорт в JSON
          </button>
          <button className="menu__item" onClick={() => void signOut()}>
            Выйти
          </button>
        </div>
      )}
    </div>
  )
}

function useOutsideClick<T extends HTMLElement>(onOutside: () => void) {
  const ref = useRef<T>(null)

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onOutside()
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [onOutside])

  return ref
}
