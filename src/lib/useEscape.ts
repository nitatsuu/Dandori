import { useEffect } from 'react'

/** Close on Escape. One listener instead of a copy in every popup. */
export function useEscape(onEscape: () => void): void {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onEscape()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onEscape])
}
