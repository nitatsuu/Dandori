/*
 * Стабильные пустые массивы.
 *
 * `useLiveQuery` возвращает undefined, пока база не ответила, и подставлять
 * вместо него литерал `[]` нельзя: новая ссылка на каждый рендер сбрасывает
 * все useMemo, которые от него зависят.
 */

export const EMPTY = Object.freeze([]) as never[]

export function emptyOf<T>(): T[] {
  return EMPTY as unknown as T[]
}
