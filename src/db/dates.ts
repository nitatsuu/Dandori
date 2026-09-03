import type { ISODate } from './types'

/*
 * The whole app works with dates that carry no time of day.
 * A date is a `YYYY-MM-DD` string in the user's local time.
 * A Date object is only an intermediate representation, and it is always read
 * and written through its local components, never the UTC ones.
 */

export function toISODate(d: Date): ISODate {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function fromISODate(s: ISODate): Date {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, m - 1, d)
}

export function today(): ISODate {
  return toISODate(new Date())
}

export function addDays(s: ISODate, n: number): ISODate {
  const d = fromISODate(s)
  d.setDate(d.getDate() + n)
  return toISODate(d)
}

export function addMonths(s: ISODate, n: number): ISODate {
  const d = fromISODate(s)
  const day = d.getDate()
  d.setDate(1)
  d.setMonth(d.getMonth() + n)
  // Keeps January 31 from turning into March 3.
  d.setDate(Math.min(day, daysInMonth(d.getFullYear(), d.getMonth())))
  return toISODate(d)
}

export function daysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate()
}

/** Difference in days: `b - a`. Negative when `b` is earlier than `a`. */
export function diffDays(a: ISODate, b: ISODate): number {
  const ms = fromISODate(b).getTime() - fromISODate(a).getTime()
  return Math.round(ms / 86_400_000)
}

/** List of dates from `from` to `to`, inclusive. */
export function dateRange(from: ISODate, to: ISODate): ISODate[] {
  const out: ISODate[] = []
  for (let d = from; diffDays(d, to) >= 0; d = addDays(d, 1)) out.push(d)
  return out
}

/** Monday of the week the date falls in. */
export function startOfWeek(s: ISODate): ISODate {
  const d = fromISODate(s)
  const shift = (d.getDay() + 6) % 7
  return addDays(s, -shift)
}

export function startOfMonth(s: ISODate): ISODate {
  return `${s.slice(0, 7)}-01`
}

export function endOfMonth(s: ISODate): ISODate {
  const d = fromISODate(s)
  return toISODate(new Date(d.getFullYear(), d.getMonth() + 1, 0))
}

/**
 * Month grid: whole weeks starting on Monday, always full rows.
 * Days from the neighbouring months are part of the grid — tell them apart
 * with `isSameMonth`.
 */
export function monthGrid(anchor: ISODate): ISODate[] {
  const first = startOfWeek(startOfMonth(anchor))
  const last = endOfMonth(anchor)
  const cells = Math.ceil((diffDays(first, last) + 1) / 7) * 7
  return Array.from({ length: cells }, (_, i) => addDays(first, i))
}

export function isSameMonth(a: ISODate, b: ISODate): boolean {
  return a.slice(0, 7) === b.slice(0, 7)
}

export function isWeekend(s: ISODate): boolean {
  const day = fromISODate(s).getDay()
  return day === 0 || day === 6
}

const WEEKDAYS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс']
const MONTHS_GEN = [
  'января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
  'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря',
]
const MONTHS_NOM = [
  'Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
  'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь',
]

export function weekdayShort(s: ISODate): string {
  return WEEKDAYS[(fromISODate(s).getDay() + 6) % 7]
}

export function monthNameNominative(s: ISODate): string {
  return MONTHS_NOM[fromISODate(s).getMonth()]
}

/** Day number with the month name — for day column headers. */
export function dayLabel(s: ISODate): string {
  const d = fromISODate(s)
  return `${d.getDate()} ${MONTHS_GEN[d.getMonth()]}`
}

/** Month name with the year — for the month header. */
export function monthLabel(s: ISODate): string {
  return `${monthNameNominative(s)} ${fromISODate(s).getFullYear()}`
}

/** Relative day label for the day column header. */
export function relativeDayLabel(s: ISODate, now: ISODate = today()): string | null {
  const d = diffDays(now, s)
  if (d === 0) return 'Сегодня'
  if (d === 1) return 'Завтра'
  if (d === -1) return 'Вчера'
  return null
}

/** Russian plural forms for a number of days. */
export function pluralDays(n: number): string {
  const abs = Math.abs(n) % 100
  const last = abs % 10
  if (abs > 10 && abs < 20) return `${n} дней`
  if (last === 1) return `${n} день`
  if (last >= 2 && last <= 4) return `${n} дня`
  return `${n} дней`
}
