/*
 * Stable empty arrays.
 *
 * `useLiveQuery` returns undefined until the database answers, and a `[]`
 * literal must not be substituted for it: a new reference on every render
 * invalidates every useMemo that depends on it.
 */

export const EMPTY = Object.freeze([]) as never[]

export function emptyOf<T>(): T[] {
  return EMPTY as unknown as T[]
}
