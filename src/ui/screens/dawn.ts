import type { DeathCause, GameState, Outcome, Player } from '../../engine/types'
import { outcomeAccent, renderOutcome, strings, type Locale } from '../../i18n'
import { outcomeAccentOf, type Accent } from '../accent'
import { sigilMarkup } from '../sigils'
import { esc } from '../dom'

/**
 * The dawn slideshow: the night's public outcomes, one full screen at a time.
 *
 * The morning report is a list the narrator reads from. This is the same
 * information staged as a performance — one death per screen, the name in
 * Bebas at the display maximum, and the ground turned Vendetta for the length
 * of the sentence. The narrator taps through it, or holds the phone up to the
 * table; either way nothing on it is secret, because it is built from the
 * same public outcomes the report already shows.
 *
 * The bar is not rendered while a slide is up (`app.ts`): the day screen
 * behind it shows every role, so the slideshow must be a dead end that closes
 * only by its own button.
 */

export interface Slide {
  /** A death. The ground goes red, the ink goes Midnight. */
  lethal: boolean
  /** The victim's name, set as the headline. Absent on calm slides. */
  name: string | null
  /** The sentence. On a death it comes from the bank; otherwise the report line. */
  line: string
  /** The mark's content: the sigil of the cause, or the town's scales. Markup, not text. */
  mark: string
  accent: Accent
  kind: Outcome['type'] | 'quiet'
}

/**
 * Which line of the bank a death would get on its own. Fixed by night and
 * seat rather than drawn at random, so the same death reads the same after
 * an undo, a reload or a language switch — the sentence must not change
 * under the narrator.
 */
export const pickLine = (night: number, seat: number, size: number): number =>
  (night * 7 + seat) % size

/**
 * The line every death in the log actually gets: its own pick, or the next
 * free one if an earlier death of the same cause already took it. So nobody
 * in a game is read a sentence somebody else already got, as long as the
 * bank lasts. Walking the whole log in order keeps it deterministic, and
 * undoing the latest death leaves everyone else's line where it was.
 */
export const deathLines = (
  log: readonly Outcome[],
  sizeOf: (cause: DeathCause) => number,
): Map<Outcome, number> => {
  const taken = new Map<DeathCause, Set<number>>()
  const lines = new Map<Outcome, number>()
  for (const outcome of log) {
    if (outcome.type !== 'death') continue
    const size = sizeOf(outcome.cause)
    if (size === 0) continue
    const used = taken.get(outcome.cause) ?? new Set<number>()
    let line = pickLine(outcome.night, outcome.target, size)
    for (let tries = 0; tries < size && used.has(line); tries++) line = (line + 1) % size
    used.add(line)
    taken.set(outcome.cause, used)
    lines.set(outcome, line)
  }
  return lines
}

const nameOf = (players: readonly Player[], id: number): string =>
  players.find((p) => p.id === id)?.name ?? '?'

const slideOf = (
  outcome: Outcome,
  players: readonly Player[],
  locale: Locale,
  lines: ReadonlyMap<Outcome, number>,
): Slide | null => {
  const t = strings(locale)
  const source = outcomeAccent(outcome)
  const mark = source === 'town' ? '⚖' : sigilMarkup(source)
  const accent = outcomeAccentOf(outcome)

  if (outcome.type === 'death') {
    const name = nameOf(players, outcome.target)
    const bank = t.ui.dawn.death[outcome.cause]
    const line = bank[lines.get(outcome) ?? 0]?.(name) ?? ''
    return { lethal: true, name, line, mark, accent, kind: 'death' }
  }

  const line = renderOutcome(outcome, players, locale)
  if (line === null) return null
  return { lethal: false, name: null, line, mark, accent, kind: outcome.type }
}

/**
 * Tonight's public record, split where the night turned into the day: the
 * town's vote is the first thing that happens by daylight, so everything
 * before the tally (or the execution, if no votes were recorded) was the
 * night's, and it and everything after (the Gunman's answer, a binding
 * following) is the day's.
 */
const tonight = (state: GameState): { night: Outcome[]; day: Outcome[] } => {
  const all = state.log.filter((o) => o.night === state.night && o.public)
  const cut = all.findIndex(
    (o) => o.type === 'tally' || (o.type === 'death' && o.cause === 'lynch'),
  )
  return cut === -1 ? { night: all, day: [] } : { night: all.slice(0, cut), day: all.slice(cut) }
}

const slidesOf = (outcomes: readonly Outcome[], state: GameState, locale: Locale): Slide[] => {
  const bank = strings(locale).ui.dawn.death
  const lines = deathLines(state.log, (cause) => bank[cause].length)
  return outcomes
    .map((o) => slideOf(o, state.players, locale, lines))
    .filter((s): s is Slide => s !== null)
}

/** The slides for the night just ended; a single quiet slide if nothing was public. */
export const dawnSlides = (state: GameState, locale: Locale): Slide[] => {
  const slides = slidesOf(tonight(state).night, state, locale)

  if (slides.length > 0) return slides
  return [{
    lethal: false,
    name: null,
    line: strings(locale).phase.quietNight,
    mark: '☀',
    accent: 'system',
    kind: 'quiet',
  }]
}

/**
 * The slides for the town's verdict: the execution and whatever it dragged
 * along. Empty until the town has voted today.
 */
export const verdictSlides = (state: GameState, locale: Locale): Slide[] =>
  slidesOf(tonight(state).day, state, locale)

export type Reading = 'dawn' | 'verdict'

export const dawnMarkup = (
  slides: readonly Slide[],
  index: number,
  night: number,
  locale: Locale,
  reading: Reading = 'dawn',
): string => {
  const t = strings(locale)
  const slide = slides[Math.min(index, slides.length - 1)]
  if (!slide) return ''
  const last = index >= slides.length - 1
  const heading = reading === 'dawn' ? t.ui.timeline.nightStart(night) : t.ui.dawn.verdict(night)

  // A death: the name is the headline and the sentence sits under it. Anything
  // else is a single display line — there is no victim to announce.
  const body = slide.name !== null
    ? `<h1 class="dawn__name">${esc(slide.name)}</h1>
       <p class="dawn__line">${esc(slide.line)}</p>`
    : `<h1 class="dawn__name dawn__name--line">${esc(slide.line)}</h1>`

  return `
    <section class="screen screen--dawn" data-dawn data-accent="${slide.accent}" data-kind="${slide.kind}"${slide.lethal ? ' data-lethal' : ''}>
      <p class="dawn__counter">
        ${esc(heading)} · ${esc(t.ui.night.stepCounter(index + 1, slides.length))}
      </p>
      <div class="dawn__body" data-dawn-next>
        <span class="mark dawn__mark" aria-hidden="true">${slide.mark}</span>
        ${body}
      </div>
      <div class="actions actions--row">
        <button class="btn btn--ghost" type="button" data-dawn-prev ${index === 0 ? 'disabled' : ''}>${esc(t.ui.common.back)}</button>
        ${
          last
            ? `<button class="btn btn--primary" type="button" data-dawn-close>${esc(t.ui.common.done)}</button>`
            : `<button class="btn btn--primary" type="button" data-dawn-next>${esc(t.ui.common.next)}</button>`
        }
      </div>
    </section>
  `
}
