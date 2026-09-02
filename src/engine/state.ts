import { isCrewRole, type RoleId } from './roles'
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
  wolfAttacksSurvivable: setup.roleId === 'SURVIVE' ? 1 : 0,
  loverOf: null,
  silencedOnDay: null,
  extraVotesOnDay: null,
  sect: null,
  fatherOf: null,
  hasQuestion: false,
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
  healUsed: false,
  poisonUsed: false,
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
    schedule: scheduleFor(players, night, { infectionUsed: state.infectionUsed }),
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
  const { players, outcomes, infectionUsed, healUsed, poisonUsed, awaitingHunterShot } =
    resolveNight(state)

  return {
    ...state,
    phase: 'day',
    day: state.day + 1,
    players,
    pending: [],
    log: [...state.log, ...outcomes],
    infectionUsed,
    healUsed,
    poisonUsed,
    awaitingHunterShot,
  }
}

/** The village votes someone out. */
export const lynch = (state: GameState, target: PlayerId): GameState =>
  killDuringDay(state, target, 'lynch')

/** The Cazador's revenge shot, taken after he dies. */
export const hunterShot = (state: GameState, target: PlayerId): GameState => {
  const next = killDuringDay(state, target, 'revenge')
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

export type Winner = 'town' | 'crew' | 'lovers' | 'martyr' | null

/**
 * Independent win conditions are checked before the team counts, because both
 * can be true at once and the individual one takes precedence.
 */
export const winner = (state: GameState): Winner => {
  const living = state.players.filter((p) => p.alive)

  // The martyr wins the moment the town executes him — including when that
  // execution also ends the game for everyone else.
  const martyrExecuted = state.log.some(
    (o) =>
      o.type === 'death' &&
      o.cause === 'lynch' &&
      state.players.find((p) => p.id === o.target)?.roleId === 'MARTYR',
  )
  if (martyrExecuted) return 'martyr'

  if (living.length === 0) return null

  if (living.length === 2) {
    const [a, b] = living as [Player, Player]
    if (a.loverOf === b.id && b.loverOf === a.id) return 'lovers'
  }

  const crew = living.filter((p) => isCrewRole(p.roleId)).length
  if (crew === 0) return 'town'
  if (crew >= living.length - crew) return 'crew'
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
  /**
   * What each snapshot in `past` led to. Same length as `past`, so entry i
   * describes the move made *from* `past[i]`.
   *
   * Structured, not prose — the timeline is rendered per language like
   * everything else.
   */
  readonly timeline: readonly TimelineEntry[]
}

/**
 * One recorded move.
 *
 * Every step is kept, including those that announced nothing: a night where
 * the detective looked at someone and nothing happened is exactly the kind of
 * thing a narrator needs to check back on.
 */
export interface TimelineEntry {
  readonly night: number
  readonly kind:
    /** Pre-game bookkeeping — kept for rewinding, hidden from the log. */
    | 'setup'
    | 'nightStart'
    | 'action'
    | 'nightEnd'
    | 'lynch'
    | 'hunterShot'
  readonly roleId?: RoleId
  readonly action?: NightAction
  readonly target?: PlayerId
}

export const newSession = (state: GameState): Session => ({
  current: state,
  past: [],
  timeline: [],
})

export const advance = (
  session: Session,
  change: (state: GameState) => GameState,
  entry?: TimelineEntry,
): Session => ({
  current: change(session.current),
  past: [...session.past, session.current],
  timeline: [
    ...session.timeline,
    entry ?? { night: session.current.night, kind: 'setup' },
  ],
})

export const canUndo = (session: Session): boolean => session.past.length > 0

export const undo = (session: Session): Session => {
  const previous = session.past[session.past.length - 1]
  if (previous === undefined) return session
  return {
    current: previous,
    past: session.past.slice(0, -1),
    timeline: session.timeline.slice(0, -1),
  }
}

/**
 * Rewinds to the state just before timeline entry `index`.
 *
 * Restoring a whole snapshot means a revert cannot leave the game
 * half-rolled-back, which is exactly the failure v1's event-popping had.
 */
export const revertTo = (session: Session, index: number): Session => {
  const target = session.past[index]
  if (target === undefined) return session
  return {
    current: target,
    past: session.past.slice(0, index),
    timeline: session.timeline.slice(0, index),
  }
}

// ---------------------------------------------------------------------------
// Seating
// ---------------------------------------------------------------------------

/**
 * Player ids are seating positions, so rearranging the table means renumbering.
 *
 * Only legal during setup: once the game starts, ids are referenced from the
 * log, pending actions and lovers, and renumbering would corrupt all of them.
 * Before that nothing points at an id, so reassigning 0..n-1 is safe.
 */
const reseat = (state: GameState, order: readonly Player[]): GameState => {
  if (state.phase !== 'setup') return state
  return { ...state, players: order.map((p, i) => ({ ...p, id: i })) }
}

/** Swaps two seats. The narrator taps one player, then the other. */
export const swapSeats = (state: GameState, a: PlayerId, b: PlayerId): GameState => {
  const order = [...state.players]
  const ia = order.findIndex((p) => p.id === a)
  const ib = order.findIndex((p) => p.id === b)
  if (ia === -1 || ib === -1 || ia === ib) return state
  const pa = order[ia] as Player
  const pb = order[ib] as Player
  order[ia] = pb
  order[ib] = pa
  return reseat(state, order)
}

/** Nudges one seat clockwise (+1) or anticlockwise (-1), wrapping around. */
export const moveSeat = (state: GameState, id: PlayerId, direction: 1 | -1): GameState => {
  const order = [...state.players]
  const from = order.findIndex((p) => p.id === id)
  if (from === -1 || order.length < 2) return state
  const to = (from + direction + order.length) % order.length
  const [moved] = order.splice(from, 1)
  order.splice(to, 0, moved as Player)
  return reseat(state, order)
}
