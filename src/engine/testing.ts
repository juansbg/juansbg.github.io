import { seeded } from './rng'
import { createGame, type PlayerSetup } from './state'
import type { GameState } from './types'

/**
 * Helpers for tests, not for the app.
 *
 * `createGame` draws trades and a seed from the system's randomness, and the
 * seed decides whether the paper drops a breadcrumb on a given night. A test
 * that asserts what a quiet morning says must not roll one by chance, so it
 * builds its game here: deterministic trades, and a seed whose first roll is
 * silent on every night from 1 to 12 (found by search; `rollClue` reads the
 * chance before anything else, so this holds for any table).
 */
export const QUIET_SEED = 46606

export const quietGame = (setups: readonly PlayerSetup[]): GameState => ({
  ...createGame(setups, seeded(1)),
  seed: QUIET_SEED,
})
