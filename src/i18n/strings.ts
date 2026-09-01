import type { RoleId } from '../engine/roles'
import type { DeathCause } from '../engine/types'

export const LOCALES = ['es', 'en'] as const
export type Locale = (typeof LOCALES)[number]

export interface RoleStrings {
  /** Display name, e.g. "El Padrino". */
  name: string
  /** What the narrator does at this role's step. */
  prompt: string
}

/**
 * Every user-visible string in the app.
 *
 * Outcome lines are functions rather than templates with placeholders because
 * Spanish and English do not share sentence structure — Spanish needs the verb
 * to agree with a plural subject where English does not, and word order
 * differs. A function per line keeps each language readable on its own terms
 * instead of forcing both through one interpolation shape.
 */
export interface Strings {
  appName: string
  locale: Locale
  /** Endonym, for the language switcher. */
  languageName: string

  roles: Record<RoleId, RoleStrings>

  phase: {
    nightFalls: string
    nightFallsBody: string
    townWakes: string
    townWakesBody: string
    quietNight: string
  }

  outcome: {
    death: (name: string, cause: DeathCause) => string
    silenced: (name: string) => string
    extraVote: (name: string) => string
    growl: () => string
  }

  winner: {
    town: string
    crew: string
    lovers: string
  }

  ui: {
    common: {
      next: string
      back: string
      done: string
      cancel: string
      undo: string
      restart: string
      confirm: string
      close: string
    }
    setup: {
      howMany: string
      players: string
      namePlaceholder: string
      rolePlaceholder: string
      tapToEdit: string
      save: string
      start: string
      incomplete: string
      duplicateRoleHint: string
    }
    reveal: {
      /** Shown while the phone is being handed over — no role information. */
      passTo: (name: string) => string
      areYou: (name: string) => string
      /** Shown beneath the hold button, before anything is revealed. */
      shieldScreen: string
      holdToReveal: string
      keepHolding: string
      yourRole: string
      teamTown: string
      teamCrew: string
      released: string
      allSeen: string
      beginFirstNight: string
      showAgain: string
      pickPlayer: string
    }
    night: {
      stepCounter: (current: number, total: number) => string
      noOne: string
      heal: string
      poison: string
      pickOne: string
      pickTwo: string
      endNight: string
      wakeGroup: string
    }
    day: {
      report: string
      whoDies: string
      nobody: string
      nextNight: string
      silencedToday: (name: string) => string
    }
    over: {
      title: string
      playAgain: string
    }
  }
}
