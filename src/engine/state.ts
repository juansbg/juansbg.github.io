import { shuffle, systemRandom, type Random } from './deal'
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
  type Vote,
} from './types'

export interface PlayerSetup {
  name: string
  roleId: RoleId
}

/**
 * How many trades the string tables name. A table of twenty citizens still
 * gets distinct ones. `i18n.test.ts` holds both languages to this number.
 */
export const TRADE_COUNT = 24

const newPlayer = (id: PlayerId, setup: PlayerSetup, trade: number | null): Player => ({
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
  trade,
})

/**
 * Trades go to the citizens in a shuffled order, so two games at the same
 * table never seat the same baker. The source of randomness is injected for
 * the tests and the simulator; the app passes nothing and gets the system's.
 */
export const createGame = (
  setups: readonly PlayerSetup[],
  random: Random = systemRandom,
): GameState => {
  const pool = shuffle(Array.from({ length: TRADE_COUNT }, (_, i) => i), random)
  let dealt = 0
  return {
    version: STATE_VERSION,
    phase: 'setup',
    night: 0,
    day: 0,
    // Identity is the index, assigned once. Names are display data only and may
    // repeat freely — nothing downstream is allowed to key off them.
    players: setups.map((s, i) => newPlayer(i, s, s.roleId === 'PLAIN' ? (pool[dealt++] ?? null) : null)),
    schedule: [],
    stepIndex: 0,
    pending: [],
    votes: [],
    log: [],
    infectionUsed: false,
    healUsed: false,
    poisonUsed: false,
    awaitingHunterShot: null,
    seed: Math.floor(random() * 2 ** 32),
  }
}

/**
 * Trades follow the roles, not the seats: a table is created with everyone a
 * Citizen, then dealt, then perhaps edited by hand, and only the citizens who
 * are left should hold one. Called when the roles are settled (the deal, an
 * edit); citizens keep the trade they had, anyone else loses theirs, and a
 * citizen without one draws from what is free.
 */
export const assignTrades = (state: GameState, random: Random = systemRandom): GameState => {
  const held = new Set<number>()
  const players = state.players.map((p) => {
    if (p.roleId !== 'PLAIN') return { ...p, trade: null }
    if (p.trade !== null && !held.has(p.trade)) {
      held.add(p.trade)
      return p
    }
    return { ...p, trade: null }
  })
  const free = shuffle(
    Array.from({ length: TRADE_COUNT }, (_, i) => i).filter((i) => !held.has(i)),
    random,
  )
  return {
    ...state,
    players: players.map((p) =>
      p.roleId === 'PLAIN' && p.trade === null ? { ...p, trade: free.shift() ?? null } : p,
    ),
  }
}

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
    // A day that ended without an execution takes its votes with it.
    votes: [],
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

// ---------------------------------------------------------------------------
// The day's vote
// ---------------------------------------------------------------------------

/**
 * Can this player vote today? The dead cannot, and neither can whoever the
 * Arsonist silenced for the day.
 */
export const canVote = (state: GameState, voter: PlayerId): boolean => {
  const p = state.players.find((x) => x.id === voter)
  return p !== undefined && p.alive && p.silencedOnDay !== state.day
}

/**
 * Records one person's vote, replacing any they had already cast. A vote from
 * someone who cannot vote, for someone dead, or for themselves is ignored and
 * the state comes back unchanged, so a stale tap cannot corrupt the tally.
 */
export const castVote = (state: GameState, voter: PlayerId, target: PlayerId): GameState => {
  const chosen = state.players.find((p) => p.id === target)
  if (!canVote(state, voter) || voter === target || !chosen?.alive) return state
  return {
    ...state,
    votes: [...state.votes.filter((v) => v.voter !== voter), { voter, target }],
  }
}

/** Takes a vote back. */
export const withdrawVote = (state: GameState, voter: PlayerId): GameState =>
  state.votes.some((v) => v.voter === voter)
    ? { ...state, votes: state.votes.filter((v) => v.voter !== voter) }
    : state

export interface TallyEntry {
  target: PlayerId
  /** Votes against, counting the Raven's extra for the day. */
  votes: number
  voters: PlayerId[]
}

/**
 * The count so far, most votes first, seats in order among equals. The Raven's
 * extra vote counts against its target even if nobody else voted for them.
 */
export const tally = (state: GameState): TallyEntry[] => {
  const entries = new Map<PlayerId, TallyEntry>()
  const entry = (target: PlayerId): TallyEntry => {
    let e = entries.get(target)
    if (!e) {
      e = { target, votes: 0, voters: [] }
      entries.set(target, e)
    }
    return e
  }
  for (const v of state.votes) {
    const e = entry(v.target)
    e.votes += 1
    e.voters.push(v.voter)
  }
  for (const p of state.players) {
    if (p.alive && p.extraVotesOnDay === state.day) entry(p.id).votes += 1
  }
  return [...entries.values()].sort((a, b) => b.votes - a.votes || a.target - b.target)
}

/** Who the tally points at, or null when nobody has voted or the top is tied. */
export const leader = (state: GameState): PlayerId | null => {
  const [first, second] = tally(state)
  if (!first || first.votes === 0) return null
  if (second && second.votes === first.votes) return null
  return first.target
}

/**
 * The village votes someone out.
 *
 * If votes were recorded they go into the log first as a public tally, so
 * the town's record shows who chose whom before it shows who died.
 */
export const lynch = (state: GameState, target: PlayerId): GameState => {
  const votes: Vote[] = state.votes
  const record: Outcome[] =
    votes.length === 0
      ? []
      : [{ type: 'tally', night: state.night, day: state.day, votes: [...votes], public: true }]
  return killDuringDay({ ...state, votes: [], log: [...state.log, ...record] }, target, 'lynch')
}

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

/**
 * The dead the paper has had a day to investigate (docs/GAZETTE.md §4): a
 * player whose death was recorded on night N is named for what they were
 * from the morning of day N + 1, always. A death by day is logged under the
 * same night number, so a hanging on day 1 is revealed on day 2 as well.
 * This is the one rule that makes a role public, so everything that shows a
 * dead player's role to the room goes through it.
 */
export const revealedDead = (state: GameState): Player[] => {
  const since = new Map<PlayerId, number>()
  for (const o of state.log) {
    if (o.type === 'death' && !since.has(o.target)) since.set(o.target, o.night)
  }
  return state.players.filter((p) => !p.alive && (since.get(p.id) ?? Infinity) < state.day)
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

  // Nobody left is not "no winner": every road to a wipe-out runs through the
  // last crew member dying (the Gunman hanged with two left and shooting the
  // other, a pair of lovers as the last two), and no crew left is the town's
  // condition. The crew count below answers it; a null here left the app on a
  // day screen with an empty table and no way out.
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
    /** One person's vote by day: `voter` and `target`, or `voter` alone when withdrawn. */
    | 'vote'
  readonly roleId?: RoleId
  readonly action?: NightAction
  readonly target?: PlayerId
  readonly voter?: PlayerId
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
