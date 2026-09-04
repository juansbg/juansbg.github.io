import { describe, expect, it } from 'vitest'
import {
  formatClock,
  freshTimer,
  pauseTimer,
  remaining,
  resetTimer,
  startTimer,
  timerMarkup,
  toggleTimer,
  viewOf,
  withLength,
} from './timer'
import { LOCALES, strings } from '../../i18n'

const T0 = 1_700_000_000_000

describe('the discussion timer', () => {
  it('starts out full and still', () => {
    const timer = freshTimer(180)
    expect(remaining(timer, T0)).toBe(180)
    expect(viewOf(timer, T0)).toEqual({ phase: 'idle', seconds: 180 })
  })

  it('counts down from a wall-clock deadline once started', () => {
    const timer = startTimer(freshTimer(180), T0)
    expect(remaining(timer, T0)).toBe(180)
    expect(remaining(timer, T0 + 1_500)).toBe(179)
    expect(remaining(timer, T0 + 180_000)).toBe(0)
    // Never negative, however late the tick.
    expect(remaining(timer, T0 + 999_000)).toBe(0)
    expect(viewOf(timer, T0 + 60_000).phase).toBe('running')
  })

  it('keeps the seconds left across a pause and a reload', () => {
    const running = startTimer(freshTimer(180), T0)
    const paused = pauseTimer(running, T0 + 30_000)
    expect(paused.endsAt).toBeNull()
    expect(paused.left).toBe(150)
    // The paused model is plain JSON: what a save writes is what a load gets.
    const thawed = JSON.parse(JSON.stringify(paused)) as typeof paused
    expect(remaining(thawed, T0 + 999_000)).toBe(150)
    expect(viewOf(thawed, T0 + 999_000).phase).toBe('paused')
    // Resuming picks up where it left off.
    expect(remaining(startTimer(paused, T0 + 60_000), T0 + 70_000)).toBe(140)
  })

  it('reads as done at zero, and one tap then starts it over', () => {
    const over = startTimer(freshTimer(60), T0)
    expect(viewOf(over, T0 + 60_000).phase).toBe('done')
    const again = toggleTimer(over, T0 + 61_000)
    expect(remaining(again, T0 + 61_000)).toBe(60)
    expect(viewOf(again, T0 + 61_000).phase).toBe('running')
  })

  it('resets to its own length, and a new length resets it too', () => {
    const running = startTimer(freshTimer(120), T0)
    expect(resetTimer(running)).toEqual(freshTimer(120))
    expect(withLength(running, 300)).toEqual(freshTimer(300))
  })

  it('formats as a clock', () => {
    expect(formatClock(180)).toBe('3:00')
    expect(formatClock(7)).toBe('0:07')
    expect(formatClock(0)).toBe('0:00')
    expect(formatClock(-3)).toBe('0:00')
  })
})

describe('the clock row', () => {
  it.each(LOCALES)('offers start, then pause, then time is up (%s)', (locale) => {
    const t = strings(locale).ui.timer
    const idle = timerMarkup({ phase: 'idle', seconds: 180 }, locale)
    expect(idle).toContain('data-timer-toggle')
    expect(idle).toContain('3:00')
    expect(idle).toContain(`aria-label="${t.start}"`)
    expect(idle).toContain(t.label)
    // Nothing to reset yet.
    expect(idle.match(/data-timer-reset[^>]*/)?.[0]).toContain('disabled')

    const running = timerMarkup({ phase: 'running', seconds: 42 }, locale)
    expect(running).toContain('0:42')
    expect(running).toContain(`aria-label="${t.pause}"`)
    expect(running.match(/data-timer-reset[^>]*/)?.[0]).not.toContain('disabled')

    const done = timerMarkup({ phase: 'done', seconds: 0 }, locale)
    expect(done).toContain('data-phase="done"')
    expect(done).toContain(t.timeUp)
  })
})
