import { dealRoles, type Complexity, type Random } from '../deal'
import type { RoleId } from '../roles'
import {
  createGame,
  currentStep,
  endNight,
  hunterShot,
  isNightComplete,
  lynch,
  recordAction,
  startNight,
  winner,
  type Winner,
} from '../state'
import type { GameState } from '../types'
import type { Policies } from './policies'

/**
 * Plays whole games against the engine, the way the app does: the schedule
 * asks for each role, a policy answers, the night resolves, the Gunman shoots
 * if he is owed a shot, the town votes, and the winner is checked after every
 * death the app would check it after.
 *
 * The engine is pure and every move is a function, which is what makes this a
 * page of code rather than a project. Nothing here may reach into the UI.
 */

/** A night beyond this is a stall: the engine has stopped making progress. */
export const MAX_NIGHTS = 40

export interface GameResult {
  winner: Winner
  /** Nights played. A game that ends on the first morning played one. */
  nights: number
  dead: number
  roles: RoleId[]
  /** Over before the town ever voted. */
  overOnFirstMorning: boolean
  /** Over before the second night. */
  overOnFirstDay: boolean
  /** Nobody left alive. */
  wipe: boolean
  /** Hit MAX_NIGHTS without a winner. */
  stalled: boolean
}

const nobodyAlive = (state: GameState): boolean => state.players.every((p) => !p.alive)

/** The app checks for a winner after the Gunman's shot, so the bot does too. */
const settle = (state: GameState, policies: Policies, random: Random): GameState => {
  let g = state
  while (g.awaitingHunterShot !== null && !nobodyAlive(g)) {
    g = hunterShot(g, policies.shot(g, random))
  }
  return g
}

const over = (state: GameState): boolean => winner(state) !== null || nobodyAlive(state)

export const playGame = (
  roles: readonly RoleId[],
  policies: Policies,
  random: Random,
): GameResult => {
  let g = createGame(roles.map((roleId, i) => ({ name: `P${i}`, roleId })), random)
  let overOnFirstMorning = false
  let overOnFirstDay = false
  let stalled = false

  for (;;) {
    g = startNight(g)
    while (!isNightComplete(g)) {
      const roleId = currentStep(g)
      if (roleId === null) break
      g = recordAction(g, policies.night(g, roleId, random))
    }
    g = settle(endNight(g), policies, random)
    if (over(g)) {
      overOnFirstMorning = g.night === 1
      break
    }

    g = settle(lynch(g, policies.vote(g, random)), policies, random)
    if (over(g)) {
      overOnFirstDay = g.day === 1
      break
    }
    if (g.night >= MAX_NIGHTS) {
      stalled = true
      break
    }
  }

  return {
    winner: winner(g),
    nights: g.night,
    dead: g.players.filter((p) => !p.alive).length,
    roles: [...roles],
    overOnFirstMorning,
    overOnFirstDay,
    wipe: nobodyAlive(g),
    stalled,
  }
}

/** Deals a table with the real dealer and plays it. */
export const playDeal = (
  players: number,
  complexity: Complexity,
  policies: Policies,
  random: Random,
): GameResult => playGame(dealRoles(players, complexity, random), policies, random)

/** Many games at one setting, one generator, so the whole run is reproducible. */
export const playMany = (
  games: number,
  players: number,
  complexity: Complexity,
  policies: Policies,
  random: Random,
): GameResult[] => Array.from({ length: games }, () => playDeal(players, complexity, policies, random))
