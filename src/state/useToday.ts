import { useEffect, useState } from 'react'
import { today } from '../db/dates'
import type { ISODate } from '../db/types'

/*
 * Сегодняшняя дата, которая сама меняется в полночь.
 *
 * Планировщик держат открытым сутками: вкладка на ноутбуке не закрывается,
 * а установленное на телефон приложение живёт в фоне. Без этого утром
 * «Сегодня» на доске указывало бы на вчера, а просроченное считалось бы текущим.
 */
export function useToday(): ISODate {
  const [date, setDate] = useState(today)

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>

    const check = () => {
      setDate((prev) => {
        const now = today()
        return now === prev ? prev : now
      })
      schedule()
    }

    const schedule = () => {
      const now = new Date()
      const midnight = new Date(now)
      midnight.setHours(24, 0, 0, 0)
      // Секунда сверху: таймер иногда срабатывает за мгновение до полуночи.
      timer = setTimeout(check, midnight.getTime() - now.getTime() + 1000)
    }

    // Телефон усыпляет таймеры в фоне, поэтому проверяем ещё и при возвращении.
    const onVisible = () => {
      if (document.visibilityState === 'visible') check()
    }

    schedule()
    document.addEventListener('visibilitychange', onVisible)

    return () => {
      clearTimeout(timer)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [])

  return date
}
