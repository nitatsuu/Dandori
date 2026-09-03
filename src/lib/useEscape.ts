import { useEffect } from 'react'

/** Закрытие по Escape. Один слушатель вместо копии в каждом всплывающем окне. */
export function useEscape(onEscape: () => void): void {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onEscape()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onEscape])
}
