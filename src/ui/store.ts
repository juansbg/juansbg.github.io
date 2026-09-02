import { newSession, type Session, type TimelineEntry } from '../engine/state'
import type { GameState } from '../engine/types'
import { STATE_VERSION } from '../engine/types'
import type { Locale } from '../i18n'
import type { Layout } from './screens/night'

/**
 * How many moves of history survive a reload.
 *
 * Each snapshot is a whole GameState (~1.5 KB for eight players), so this
 * bounds the save at well under localStorage's budget while keeping a full
 * game's worth of log and rewind.
 */
export const HISTORY_LIMIT = 80

/** Which screen the app is on. Derived from phase, except for the reveal. */
export type Screen = 'setup' | 'reveal' | 'night' | 'day' | 'over'

export interface AppState {
  session: Session
  locale: Locale
  screen: Screen
  /** Index into the pass-around order during onboarding. */
  revealIndex: number
  /** In 'single' mode the reveal shows one player and returns to the game. */
  revealMode: 'onboarding' | 'single'
  /** Where to return after a single-player reveal. */
  revealReturnTo: Screen
  /** Circle or list for choosing people — the narrator's preference. */
  layout: Layout
}

const KEY = 'omerta:v1'

interface Saved {
  version: number
  game: GameState
  locale: Locale
  screen: Screen
  revealIndex: number
  layout?: Layout
  /** The last HISTORY_LIMIT snapshots and the moves that led from them. */
  past?: GameState[]
  timeline?: TimelineEntry[]
}

/**
 * Autosave.
 *
 * The engine's GameState is JSON-serializable by design, which is what makes
 * this a few lines rather than a project. Losing a game to a phone call was
 * the worst failure mode of every previous version.
 *
 * History is persisted too, capped at HISTORY_LIMIT moves. Without it the log
 * came back empty after any reload, and the "rewind to here" buttons had
 * nothing to rewind to — which defeats the point of having a log at all.
 */
export const save = (state: AppState): void => {
  try {
    const { past, timeline } = state.session
    const keep = Math.max(0, past.length - HISTORY_LIMIT)
    const payload: Saved = {
      version: STATE_VERSION,
      game: state.session.current,
      locale: state.locale,
      screen: state.screen,
      revealIndex: state.revealIndex,
      layout: state.layout,
      past: past.slice(keep),
      timeline: timeline.slice(keep),
    }
    localStorage.setItem(KEY, JSON.stringify(payload))
  } catch {
    // Private browsing, blocked storage, quota. The game continues in memory.
  }
}

export const load = ():
  | Pick<AppState, 'session' | 'locale' | 'screen' | 'revealIndex' | 'layout'>
  | null => {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw === null) return null

    const parsed = JSON.parse(raw) as Saved
    if (!MIGRATABLE.includes(parsed.version)) return null
    if (!Array.isArray(parsed.game?.players)) return null

    // Saves from before history was persisted simply have none. The two
    // arrays must stay the same length; a mismatch means a corrupt save,
    // and an empty history is the safe reading of that.
    const past = Array.isArray(parsed.past) ? parsed.past.map(migrate) : []
    const timeline = Array.isArray(parsed.timeline) ? parsed.timeline : []
    const game = migrate(parsed.game)
    const session: Session =
      past.length === timeline.length
        ? { current: game, past, timeline }
        : newSession(game)

    return {
      session,
      locale: parsed.locale,
      screen: parsed.screen,
      revealIndex: parsed.revealIndex ?? 0,
      // Older saves predate the toggle; the circle is the default.
      layout: parsed.layout ?? 'circle',
    }
  } catch {
    return null
  }
}

/** State versions this build can still read. Anything older is dropped. */
const MIGRATABLE: readonly number[] = [1, STATE_VERSION]

/** A snapshot as an older build may have written it. */
type SavedGame = Omit<GameState, 'healUsed' | 'poisonUsed'> &
  Partial<Pick<GameState, 'healUsed' | 'poisonUsed'>>

/**
 * Brings an older snapshot up to the current shape.
 *
 * Version 1 did not track the Apothecary's vials; a game saved then simply has
 * both unspent, which is the generous reading and the only one available.
 */
const migrate = (game: SavedGame): GameState => ({
  ...game,
  healUsed: game.healUsed ?? false,
  poisonUsed: game.poisonUsed ?? false,
})

export const clear = (): void => {
  try {
    localStorage.removeItem(KEY)
  } catch {
    // Nothing to do — see save().
  }
}

const ROSTER_KEY = 'omerta:roster'

/**
 * The names from the last game, remembered across resets.
 *
 * The same group plays again and again; retyping eight names every time is
 * the single most tedious thing about running the game. Kept separately from
 * the game save so that resetting the game does not forget the people.
 */
export const loadRoster = (): string[] => {
  try {
    const raw = localStorage.getItem(ROSTER_KEY)
    const parsed: unknown = raw === null ? [] : JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.filter((n): n is string => typeof n === 'string') : []
  } catch {
    return []
  }
}

export const saveRoster = (names: readonly string[]): void => {
  try {
    localStorage.setItem(ROSTER_KEY, JSON.stringify(names))
  } catch {
    // See save().
  }
}

export const clearRoster = (): void => {
  try {
    localStorage.removeItem(ROSTER_KEY)
  } catch {
    // See save().
  }
}
