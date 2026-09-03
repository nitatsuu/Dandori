import { useEffect, useState } from 'react'
import { today } from '../db/dates'
import type { ISODate } from '../db/types'

/*
 * Today's date, which rolls over on its own at midnight.
 *
 * A planner is kept open for days on end: the tab on the laptop is never closed,
 * and the app installed on the phone lives in the background. Without this, in
 * the morning the "today" column on the board would point at yesterday, and
 * overdue tasks would still count as current.
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
      // One extra second: the timer sometimes fires a moment before midnight.
      timer = setTimeout(check, midnight.getTime() - now.getTime() + 1000)
    }

    // The phone puts timers to sleep in the background, so check on return too.
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
