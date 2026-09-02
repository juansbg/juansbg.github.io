import type { GameState, Outcome, Player, PlayerId } from '../engine/types'
import type { RoleId } from '../engine/roles'
import type { Winner } from '../engine/state'
import { en } from './en'
import { es } from './es'
import { LOCALES, type Locale, type Strings } from './strings'

export { LOCALES, type Locale, type Strings } from './strings'

const TABLES: Record<Locale, Strings> = { es, en }

export const strings = (locale: Locale): Strings => TABLES[locale]

export const isLocale = (value: string): value is Locale =>
  (LOCALES as readonly string[]).includes(value)

/** Best-effort match of the browser's language, falling back to Spanish. */
export const detectLocale = (languages: readonly string[]): Locale => {
  for (const tag of languages) {
    const base = tag.toLowerCase().split('-')[0]
    if (base !== undefined && isLocale(base)) return base
  }
  return 'es'
}

const nameOf = (players: readonly Player[], id: PlayerId): string =>
  players.find((p) => p.id === id)?.name ?? '?'

/**
 * Turns one structured outcome into a sentence.
 *
 * Returns null for outcomes with nothing to say publicly. This is the whole
 * point of the engine emitting data rather than prose: the same outcome can be
 * rendered in any language, and switching language re-renders the entire log
 * rather than leaving half of it in the old one.
 */
export const renderOutcome = (
  outcome: Outcome,
  players: readonly Player[],
  locale: Locale,
): string | null => {
  const t = strings(locale)

  switch (outcome.type) {
    case 'death':
      return t.outcome.death(nameOf(players, outcome.target), outcome.cause)
    case 'silenced':
      return t.outcome.silenced(nameOf(players, outcome.target))
    case 'extraVote':
      return t.outcome.extraVote(nameOf(players, outcome.target))
    case 'growl':
      return t.outcome.growl()
    case 'cardTaken':
      return t.outcome.cardTaken(t.roles[outcome.role].name)
    // Everything else is either secret (the detective's look, a blocked
    // attack) or bookkeeping the narrator does not read aloud.
    default:
      return null
  }
}

/**
 * The lines the narrator reads to the table after a given night.
 *
 * Only public outcomes appear. A blocked attack is deliberately absent: the
 * town must not learn that the killers chose someone and failed.
 */
export const morningReport = (
  state: GameState,
  night: number,
  locale: Locale,
): string[] => {
  const lines = state.log
    .filter((o) => o.night === night && o.public)
    .map((o) => renderOutcome(o, state.players, locale))
    .filter((line): line is string => line !== null)

  return lines.length > 0 ? lines : [strings(locale).phase.quietNight]
}

/**
 * The role whose colour an outcome should carry.
 *
 * v1 coloured every morning-report card by the role that caused it, which is
 * what made the report readable at a glance — a red card is a killing, a
 * purple one is the Apothecary. This is the structured version of that idea.
 */
export const outcomeAccent = (outcome: Outcome): RoleId | 'town' => {
  switch (outcome.type) {
    case 'death':
      switch (outcome.cause) {
        case 'killers': return 'KILLER'
        case 'rogue': return 'ROGUE'
        case 'poison': return 'MEDIC'
        case 'heartbreak': return 'PAIR'
        case 'revenge': return 'AVENGE'
        case 'lynch': return 'town'
      }
    // eslint-disable-next-line no-fallthrough
    case 'attackBlocked':
      return outcome.by
    case 'inspected':
      return 'INSPECT'
    case 'protected':
      return 'GUARD'
    case 'lovers':
      return 'PAIR'
    case 'father':
      return 'PROTEGE'
    case 'converted':
      return 'CONVERT'
    case 'silenced':
      return 'SILENCE'
    case 'extraVote':
      return 'EXTRA_VOTE'
    case 'sectSplit':
      return 'SPLIT'
    case 'growl':
      return 'SENSE'
    case 'roleChanged':
      return outcome.to
    case 'cardTaken':
      return 'SWAP'
  }
}

export const renderWinner = (winner: Winner, locale: Locale): string | null => {
  if (winner === null) return null
  const t = strings(locale)
  return winner === 'town' ? t.winner.town
    : winner === 'crew' ? t.winner.crew
    : winner === 'martyr' ? t.winner.martyr
    : t.winner.lovers
}
