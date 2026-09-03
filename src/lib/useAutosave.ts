import { useCallback, useEffect, useRef, useState } from 'react'

const SAVE_DELAY = 500

/**
 * A text field that writes to the database on a delay.
 *
 * The value can also arrive from outside — from another device through sync — so
 * `synced` holds what the field and the database last agreed on. As long as what
 * comes from the database matches it, this is an echo of our own write: the field
 * must not be touched, or the caret would jump to the end on every save. A real
 * edit from elsewhere is picked up, but only when there is nothing unsent of our
 * own — overwriting what the person is typing right now is worse than being a
 * couple of seconds out of step with the server; from there the project-wide
 * last-write-wins by `updated_at` takes over.
 */
export function useAutosave(remote: string, save: (value: string) => void) {
  const [draft, setDraft] = useState(remote)
  const synced = useRef(remote)
  const pending = useRef<string | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Ref to the current callback, so that flush itself stays stable.
  const saveRef = useRef(save)
  useEffect(() => {
    saveRef.current = save
  })

  const flush = useCallback(() => {
    if (timer.current !== null) {
      clearTimeout(timer.current)
      timer.current = null
    }
    const value = pending.current
    if (value === null) return
    pending.current = null
    synced.current = value
    saveRef.current(value)
  }, [])

  useEffect(() => {
    if (remote === synced.current) return
    synced.current = remote
    if (pending.current !== null) return
    setDraft(remote)
  }, [remote])

  // An unfinished edit must not be lost when switching to another row.
  useEffect(() => flush, [flush])

  const change = useCallback(
    (value: string) => {
      setDraft(value)
      pending.current = value
      if (timer.current !== null) clearTimeout(timer.current)
      timer.current = setTimeout(flush, SAVE_DELAY)
    },
    [flush],
  )

  return [draft, change] as const
}
