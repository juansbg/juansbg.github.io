import { newSession, type Session } from '../engine/state'
import type { GameState } from '../engine/types'
import { STATE_VERSION } from '../engine/types'
import type { Locale } from '../i18n'

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
}

const KEY = 'omerta:v1'

interface Saved {
  version: number
  game: GameState
  locale: Locale
  screen: Screen
  revealIndex: number
}

/**
 * Autosave.
 *
 * The engine's GameState is JSON-serializable by design, which is what makes
 * this three lines rather than a project. Losing a game to a phone call was
 * the worst failure mode of every previous version.
 *
 * Undo history is deliberately NOT persisted: it can grow without bound and a
 * narrator resuming a game hours later does not expect to undo into it.
 */
export const save = (state: AppState): void => {
  try {
    const payload: Saved = {
      version: STATE_VERSION,
      game: state.session.current,
      locale: state.locale,
      screen: state.screen,
      revealIndex: state.revealIndex,
    }
    localStorage.setItem(KEY, JSON.stringify(payload))
  } catch {
    // Private browsing, blocked storage, quota. The game continues in memory.
  }
}

export const load = (): Pick<AppState, 'session' | 'locale' | 'screen' | 'revealIndex'> | null => {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw === null) return null

    const parsed = JSON.parse(raw) as Saved
    // A future version bump migrates here rather than stranding the save.
    if (parsed.version !== STATE_VERSION) return null
    if (!Array.isArray(parsed.game?.players)) return null

    return {
      session: newSession(parsed.game),
      locale: parsed.locale,
      screen: parsed.screen,
      revealIndex: parsed.revealIndex ?? 0,
    }
  } catch {
    return null
  }
}

export const clear = (): void => {
  try {
    localStorage.removeItem(KEY)
  } catch {
    // Nothing to do — see save().
  }
}
