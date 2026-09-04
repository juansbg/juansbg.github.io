import { strings, type Locale } from '../../i18n'
import { esc } from '../dom'

/**
 * The discussion timer.
 *
 * A countdown the narrator starts once the morning has been read, so the
 * town argues against a clock instead of until someone gives up. The model
 * is a plain object of a length and either a deadline (running) or the
 * seconds left (paused), so it survives a reload as-is: the deadline is a
 * wall-clock time, and a phone call or the PWA updating itself mid-argument
 * costs nothing.
 *
 * Nothing here ticks. `app.ts` owns the interval and asks `remaining()` for
 * the seconds to paint, which keeps the model pure and the tests instant.
 */
export interface Timer {
  /** The full length, in seconds. */
  length: number
  /** Wall-clock time the countdown reaches zero, or null while paused. */
  endsAt: number | null
  /** Seconds left while paused. Meaningless while `endsAt` is set. */
  left: number
}

/** The lengths on offer in ⋯, in seconds. */
export const TIMER_LENGTHS = [60, 120, 180, 300] as const
export const DEFAULT_TIMER_LENGTH = 180

export const freshTimer = (length = DEFAULT_TIMER_LENGTH): Timer => ({
  length,
  endsAt: null,
  left: length,
})

/** Seconds left, never negative. Whole seconds, rounded up: 0 means over. */
export const remaining = (timer: Timer, now: number): number =>
  timer.endsAt === null ? timer.left : Math.max(0, Math.ceil((timer.endsAt - now) / 1000))

export const isRunning = (timer: Timer): boolean => timer.endsAt !== null

/** Starting a timer that has run out starts it over: one tap, no reset first. */
export const startTimer = (timer: Timer, now: number): Timer => {
  const left = remaining(timer, now)
  const from = left === 0 ? timer.length : left
  return { ...timer, endsAt: now + from * 1000, left: from }
}

export const pauseTimer = (timer: Timer, now: number): Timer => ({
  ...timer,
  endsAt: null,
  left: remaining(timer, now),
})

/** A clock that has run out is not paused by a tap: it is started over. */
export const toggleTimer = (timer: Timer, now: number): Timer =>
  isRunning(timer) && remaining(timer, now) > 0 ? pauseTimer(timer, now) : startTimer(timer, now)

export const resetTimer = (timer: Timer): Timer => freshTimer(timer.length)

/** A new length always starts the clock over: the old count meant nothing. */
export const withLength = (_timer: Timer, length: number): Timer => freshTimer(length)

/** m:ss, so 3:00 and 0:07 — a clock, not a duration. */
export const formatClock = (seconds: number): string => {
  const s = Math.max(0, Math.floor(seconds))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

export type TimerPhase = 'idle' | 'running' | 'paused' | 'done'

/** What the clock row needs to paint, computed once per render. */
export interface TimerView {
  phase: TimerPhase
  seconds: number
}

export const viewOf = (timer: Timer, now: number): TimerView => {
  const seconds = remaining(timer, now)
  const phase: TimerPhase = isRunning(timer)
    ? seconds === 0 ? 'done' : 'running'
    : seconds === 0
      ? 'done'
      : seconds === timer.length
        ? 'idle'
        : 'paused'
  return { phase, seconds }
}

/**
 * The clock row on the day screen. The face is one wide button — tap to
 * start, tap to pause — with the digits large enough to read from across
 * the table; the reset sits beside it in the usual icon square. The digits
 * carry `data-timer-digits` so the tick can repaint them in place without
 * rebuilding the screen every second.
 */
export const timerMarkup = (view: TimerView, locale: Locale): string => {
  const t = strings(locale).ui.timer
  const label =
    view.phase === 'done' ? t.timeUp : view.phase === 'paused' ? t.paused : t.label
  const action = view.phase === 'running' ? t.pause : t.start
  return `
    <div class="clock" data-timer data-phase="${view.phase}">
      <button class="clock__face" type="button" data-timer-toggle
              aria-label="${esc(action)}" aria-pressed="${view.phase === 'running'}">
        <span class="clock__label" data-timer-label>${esc(label)}</span>
        <span class="clock__digits" data-timer-digits>${formatClock(view.seconds)}</span>
      </button>
      <button class="icon-btn" type="button" data-timer-reset
              aria-label="${esc(t.reset)}" title="${esc(t.reset)}"${view.phase === 'idle' ? ' disabled' : ''}>↺</button>
    </div>
  `
}
