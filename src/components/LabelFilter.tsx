import { useState } from 'react'
import type { ID, Label } from '../db/types'
import './LabelFilter.css'

interface Props {
  labels: Label[]
  active: ID[]
  onToggle: (id: ID) => void
}

/** Label filter. It applies to every view of the current workspace at once. */
export function LabelFilter({ labels, active, onToggle }: Props) {
  const [open, setOpen] = useState(false)
  if (labels.length === 0) return null

  return (
    <div className="lfilter">
      <button
        className={`btn btn--quiet lfilter__btn${active.length ? ' lfilter__btn--on' : ''}`}
        onClick={() => setOpen((v) => !v)}
      >
        Метки{active.length > 0 && ` · ${active.length}`}
      </button>

      {open && (
        <>
          <div className="lfilter__scrim" onClick={() => setOpen(false)} />
          <div className="lfilter__pop">
            {labels.map((label) => (
              <button
                key={label.id}
                className={`lfilter__row${active.includes(label.id) ? ' lfilter__row--on' : ''}`}
                onClick={() => onToggle(label.id)}
              >
                <span
                  className="lfilter__dot"
                  style={{ background: `var(--label-${label.color})` }}
                />
                <span className="lfilter__name">{label.name}</span>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
