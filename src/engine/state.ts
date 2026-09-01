import { isWolfRole, type RoleId } from './roles'
import { scheduleFor } from './schedule'
import { applyDeaths, resolveNight } from './resolve'
import {
  STATE_VERSION,
  type DeathCause,
  type GameState,
  type NightAction,
  type Outcome,
  type Player,
  type PlayerId,
} from './types'

export interface PlayerSetup {
  name: string
  roleId: RoleId
}

const newPlayer = (id: PlayerId, setup: PlayerSetup): Player => ({
  id,
  name: setup.name,
  roleId: setup.roleId,
  alive: true,
  protectedTonight: false,
  protectedLastNight: false,
  // The Anciano survives his first wolf attack.
  wolfAttacksSurvivable: setup.roleId === 'ANC' ? 1 : 0,
  loverOf: null,
  silencedOnDay: null,
  extraVotesOnDay: null,
  sect: null,
  fatherOf: null,
})

export const createGame = (setups: readonly PlayerSetup[]): GameState => ({
  version: STATE_VERSION,
  phase: 'setup',
  night: 0,
  day: 0,
  // Identity is the index, assigned once. Names are display data only and may
  // repeat freely — nothing downstream is allowed to key off them.
  players: setups.map((s, i) => newPlayer(i, s)),
  schedule: [],
  stepIndex: 0,
  pending: [],
  log: [],
  infectionUsed: false,
  awaitingHunterShot: null,
})

export const startNight = (state: GameState): GameState => {
  const night = state.night + 1
  const players = state.players.map((p) => ({
    ...p,
    // The Protector may not shield the same player two nights running.
    protectedLastNight: p.protectedTonight,
    protectedTonight: false,
  }))

  return {
    ...state,
    phase: 'night',
    night,
    players,
    schedule: scheduleFor(players, night),
    stepIndex: 0,
    pending: [],
  }
}

/** The role the narrator is being prompted for right now, if any. */
export const currentStep = (state: GameState): RoleId | null =>
  state.schedule[state.stepIndex] ?? null

export const isNightComplete = (state: GameState): boolean =>
  state.stepIndex >= state.schedule.length

/**
 * Records what the narrator chose and advances one step.
 *
 * v1 recorded the *previous* step's answer on entering the next one
 * (`configureLastStep` fired one step late), which is what made stepping
 * backwards corrupt the event list. Here the action is recorded for the step
 * it belongs to, at the moment it is taken.
 */
export const recordAction = (state: GameState, action: NightAction): GameState => ({
  ...state,
  pending: [...state.pending, action],
  stepIndex: state.stepIndex + 1,
})

/** Resolves the night and moves to the day. */
export const endNight = (state: GameState): GameState => {
  const { players, outcomes, infectionUsed, awaitingHunterShot } = resolveNight(state)

  return {
    ...state,
    phase: 'day',
    day: state.day + 1,
    players,
    pending: [],
    log: [...state.log, ...outcomes],
    infectionUsed,
    awaitingHunterShot,
  }
}

/** The village votes someone out. */
export const lynch = (state: GameState, target: PlayerId): GameState =>
  killDuringDay(state, target, 'lynch')

/** The Cazador's revenge shot, taken after he dies. */
export const hunterShot = (state: GameState, target: PlayerId): GameState => {
  const next = killDuringDay(state, target, 'hunter')
  return { ...next, awaitingHunterShot: null }
}

const killDuringDay = (
  state: GameState,
  target: PlayerId,
  cause: DeathCause,
): GameState => {
  const players = state.players.map((p) => ({ ...p }))
  const outcomes: Outcome[] = []
  const deaths = new Map<PlayerId, DeathCause>([[target, cause]])

  const { awaitingHunterShot } = applyDeaths(players, deaths, state.night, outcomes)

  return {
    ...state,
    players,
    log: [...state.log, ...outcomes],
    // A hunter killed by this death owes a shot, unless one is already owed.
    awaitingHunterShot: state.awaitingHunterShot ?? awaitingHunterShot,
  }
}

export type Winner = 'village' | 'wolves' | 'lovers' | null

/**
 * Lovers on opposite teams win together if they are the last two alive, which
 * is why this is checked before the team counts.
 */
export const winner = (state: GameState): Winner => {
  const living = state.players.filter((p) => p.alive)
  if (living.length === 0) return null

  if (living.length === 2) {
    const [a, b] = living as [Player, Player]
    if (a.loverOf === b.id && b.loverOf === a.id) return 'lovers'
  }

  const wolves = living.filter((p) => isWolfRole(p.roleId)).length
  if (wolves === 0) return 'village'
  if (wolves >= living.length - wolves) return 'wolves'
  return null
}

// ---------------------------------------------------------------------------
// Undo
// ---------------------------------------------------------------------------

/**
 * A game plus its history, so the narrator can step back safely.
 *
 * v1's `prevStep()` unconditionally popped the events array, so stepping back
 * past a role that had recorded nothing deleted an unrelated event. Restoring
 * a whole prior snapshot cannot do that, and it is cheap because GameState is
 * small and JSON-serializable by design.
 */
export interface Session {
  readonly current: GameState
  readonly past: readonly GameState[]
}

export const newSession = (state: GameState): Session => ({ current: state, past: [] })

export const advance = (
  session: Session,
  change: (state: GameState) => GameState,
): Session => ({
  current: change(session.current),
  past: [...session.past, session.current],
})

export const canUndo = (session: Session): boolean => session.past.length > 0

export const undo = (session: Session): Session => {
  const previous = session.past[session.past.length - 1]
  if (previous === undefined) return session
  return { current: previous, past: session.past.slice(0, -1) }
}
