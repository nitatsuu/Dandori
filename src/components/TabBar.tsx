import { TAB_TITLES, TABS, type Tab } from '../state/ui'
import './TabBar.css'

/** Bottom tab bar. Phone only: on a laptop the tabs live in the header. */
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
