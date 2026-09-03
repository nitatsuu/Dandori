import { useCallback, useEffect, useRef, useState } from 'react'

const SAVE_DELAY = 500

/**
 * Текстовое поле с отложенной записью в базу.
 *
 * Значение приезжает и снаружи — с другого устройства через синхронизацию, —
 * поэтому `synced` хранит то, на чём поле и база сошлись. Пока пришедшее из базы
 * совпадает с ним, это эхо нашей же записи: трогать поле нельзя, иначе курсор
 * прыгнет в конец на каждом сохранении. Настоящая чужая правка подхватывается,
 * но только если своих неотправленных нет — перебивать то, что человек печатает
 * прямо сейчас, хуже, чем разойтись с сервером на пару секунд; дальше работает
 * общий для проекта last-write-wins по `updated_at`.
 */
export function useAutosave(remote: string, save: (value: string) => void) {
  const [draft, setDraft] = useState(remote)
  const synced = useRef(remote)
  const pending = useRef<string | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Ссылка на актуальный колбэк: сам flush остаётся стабильным.
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

  // Недописанное не должно пропасть при переключении записи.
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
