import { TAB_TITLES, TABS, type Tab } from '../state/ui'
import './TabBar.css'

/** Нижняя панель вкладок. Только на телефоне: на ноутбуке вкладки живут в шапке. */
export function TabBar({ tab, onSelect }: { tab: Tab; onSelect: (t: Tab) => void }) {
  return (
    <nav className="tabbar">
      {TABS.map((t) => (
        <button
          key={t}
          className={`tabbar__item${t === tab ? ' tabbar__item--on' : ''}`}
          onClick={() => onSelect(t)}
        >
          {TAB_TITLES[t]}
        </button>
      ))}
    </nav>
  )
}
