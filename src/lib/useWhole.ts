import { useCallback, useEffect, useRef, useState } from 'react'
import type { ChangeEvent } from 'react'
import { SAVE_DELAY } from './useAutosave'

interface Options {
  /** A field that may not be left empty gives back what is stored instead. */
  clearable?: boolean
  /**
   * Whether a whole value waits the pause out. It has to wherever the write
   * reaches the database — that is what keeps a card from hopping columns on
   * the «1» of a «16». A write that only reaches a draft beside the field
   * costs nothing, so it goes at once and is there for whatever reads it next,
   * without a button having to take the focus away first.
   */
  wait?: boolean
}

/**
 * A field that keeps what is being typed into it and tells the task only what
 * is whole, once the typing stops.
 *
 * A `type=date` field hands over an empty value while a segment is still being
 * filled, and a `type=time` one does the same. Written through the task and
 * handed straight back, that emptiness reached the browser as a value it had
 * not asked for, and the browser dropped the segments already typed: «16» over
 * «15» came out «06», and starting a date over lost it altogether. So the text
 * lives here, every key lands in it, and the task hears a value only once
 * there is a whole one to hear.
 *
 * Whole is not finished, though: a day being typed into «16» is «1» first, and
 * «1» is a date the task would take — and taking it moves the card to another
 * column and drops it at the end of that one. So a whole value waits out the
 * same pause every typed field in the app waits, and the wait ends early when
 * the field is left or goes with it, so that nothing is lost to a dialog closed
 * on the last keystroke.
 *
 * An empty field is how a date or an hour is taken off, and it is the one case
 * that waits for the field to be left: mid-edit an emptiness means nothing.
 *
 * The buffer is its own rather than `useAutosave`'s: that one holds the text it
 * writes, and here the text and the value are two things — half of a date is
 * kept and not written, and an emptiness is written without being waited out.
 * They share the pause, which is the part that has to agree.
 */
export function useWhole(
  remote: string,
  /** What the text is worth to the task, or `null` while it is less than a value. */
  whole: (text: string) => string | null,
  write: (value: string | null) => void,
  { clearable = true, wait = true }: Options = {},
) {
  const [text, setText] = useState(remote)
  const focused = useRef(false)
  /** A whole value waiting out the pause, or `null` when there is none. */
  const waiting = useRef<string | null>(null)
  /** The last value handed to the task, until it comes back around; `''` is a clearing. */
  const sent = useRef<string | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  /*
   * Everything the commit below reads, as the last render left it. It runs from
   * the unmount as well as from the blur, and there is no render to read from
   * by then.
   */
  const latest = useRef({ text, remote, whole, write, clearable })
  useEffect(() => {
    latest.current = { text, remote, whole, write, clearable }
  })

  const stop = useCallback(() => {
    if (timer.current === null) return
    clearTimeout(timer.current)
    timer.current = null
  }, [])

  /** Hands the task a value and holds on to it until the task answers with it. */
  const send = useCallback((value: string | null) => {
    sent.current = value ?? ''
    latest.current.write(value)
  }, [])

  const flush = useCallback(() => {
    stop()
    const value = waiting.current
    if (value === null) return
    waiting.current = null
    send(value)
  }, [send, stop])

  /*
   * What leaving the field does — and the field going away is the same moment.
   * The card is closed with Escape or by a click on the scrim, and neither ever
   * blurs anything: Escape is a keydown on the document and the scrim closes on
   * mousedown, before the browser has moved the focus. A deadline rubbed out
   * and then closed on was staying on the task.
   */
  const commit = useCallback(() => {
    stop()
    const { text, remote, whole, clearable } = latest.current
    /*
     * What the task holds, which is the last value sent to it while one is on
     * its way there: `remote` still carries the one before it. Against `remote`
     * alone the ✕ wrote the same clearing twice — its mousedown commits and its
     * click unmounts, a millisecond apart — and a date deleted while a write of
     * ours was in flight was not cleared at all, so the echo brought it back.
     */
    const held = sent.current ?? remote
    if (text === '') {
      /*
       * The emptiness is the last word: a value still waiting would land after
       * it and put the date back. It is written here and never on the pause —
       * halfway through an edit an empty field means nothing at all.
       */
      waiting.current = null
      if (!clearable) setText(held)
      else if (held !== '') send(null)
      return
    }
    flush()
    // Left holding half a value: the field shows again what the task holds.
    if (whole(text) === null) setText(held)
  }, [flush, send, stop])

  useEffect(() => {
    // Our own write, come back around: from here the field and the task agree.
    if (remote === sent.current) sent.current = null
    /*
     * Two writers reach this field: the owner typing into it and the other
     * device through sync. While the caret is here the one typing wins — the
     * value is not pulled out from under him, and his write is the later of the
     * two by the clock, which is how the whole project settles a disagreement.
     * What arrived meanwhile goes on screen the moment he leaves, in onBlur.
     */
    if (focused.current) return
    /*
     * A value from before our own write, arriving while that write is still on
     * its way: taking it would put the old date back on screen for as long as
     * the round trip lasts. What the task holds is ours, a moment from now.
     */
    if (sent.current !== null) return
    setText(remote)
  }, [remote])

  // The pause ends with the field rather than taking the value with it.
  useEffect(() => commit, [commit])

  return {
    value: text,
    onFocus() {
      focused.current = true
    },
    onChange(e: ChangeEvent<HTMLInputElement>) {
      const next = e.target.value
      setText(next)
      /*
       * A keystroke that leaves less than a value on the screen takes the wait
       * back with it: there is nothing whole to tell until one is typed again,
       * and a value from before the segment was rubbed out is not it. Typing
       * back what the task already holds cancels it the same way — what it
       * holds is the last value sent to it, since `remote` still carries the
       * one before that until the write has been round the database.
       */
      const held = sent.current ?? remote
      const value = whole(next)
      waiting.current = value !== null && value !== held ? value : null
      stop()
      if (waiting.current === null) return
      if (!wait) return flush()
      timer.current = setTimeout(flush, SAVE_DELAY)
    },
    onBlur() {
      focused.current = false
      commit()
      /*
       * What arrived from the other device while he was typing goes on screen
       * now. Not while a write of ours is on its way, though: `remote` is the
       * value from before it until it lands, and it would pull the field back.
       */
      if (sent.current === null) setText(remote)
    },
  }
}

/**
 * The date the task can be told. A `type=date` field hands over intermediate
 * values while the year is being typed — «0202-03-01» on the way to 2026 — and
 * they would travel into the database and onto the timeline.
 */
export function wholeDate(text: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return null
  const year = Number(text.slice(0, 4))
  return year >= 1970 && year <= 2999 ? text : null
}

/**
 * The hour the task can be told. A `type=time` field hands over «HH:MM», and
 * «HH:MM:SS» where the browser was told to take seconds. The frame is minutes,
 * so the rest is dropped.
 */
export function wholeTime(text: string): string | null {
  return /^\d{2}:\d{2}(:\d{2})?$/.test(text) ? text.slice(0, 5) : null
}
