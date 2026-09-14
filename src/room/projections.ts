import { spareCards } from '../engine/cards'
import { canVote, currentStep, leader, revealedDead, tally, winner, type Winner } from '../engine/state'
import { ROLES, type RoleId } from '../engine/roles'
import { wonBy } from '../engine/summary'
import type { GameState, Outcome, Player, PlayerId } from '../engine/types'
import type { Locale } from '../i18n'
import type { Perspective } from '../ui/screens/circle'
import type { Reading, Slide } from '../ui/screens/dawn'
import { countUp } from '../ui/screens/vote'
import { familyVictim, perspectiveFor } from '../ui/screens/night'
import type { TimerView } from '../ui/screens/timer'
import { actsAt, eligibleAt } from './actions'

/**
 * What the whole town may see.
 *
 * The narrator's phone is the only place the game lives; everything a screen
 * facing the room shows is built here, from `GameState`, as data. It is
 * rendered on the narrator's own device by the table view today and will be
 * sent to a TV through the relay later (docs/BIG-SCREEN.md), so it must be
 * plain JSON and must carry nothing the town does not already know: no
 * roles, no secret outcomes, no voters — counts, not names.
 *
 * `projections.test.ts` asserts that. Any new field goes through it.
 */

export interface TvSeat {
  id: PlayerId
  name: string
  alive: boolean
  /** Burned out today: cannot speak or vote. Announced at dawn, so public. */
  silenced: boolean
  /** The Raven's mark for today. Announced at dawn, so public. */
  extraVote: boolean
  /** Raised a question about their role: the day table already shows it. */
  hasQuestion: boolean
  /** Has cast a ballot today. That a hand went up is public; for whom is not. */
  voted: boolean
}

/**
 * The count coming up: how many ballots are on the seats so far, of how
 * many, and the seat the last one fell on. Null while the ballot is sealed;
 * complete once `shown` reaches `total`.
 */
export interface TvCount {
  shown: number
  total: number
  last: PlayerId | null
}

/** The reading up right now, with its slides already built from public outcomes. */
export interface TvReading {
  kind: Reading
  index: number
  slides: Slide[]
}

export interface TvProjection {
  kind: 'tv'
  locale: Locale
  phase: GameState['phase']
  night: number
  day: number
  players: TvSeat[]
  /** Public outcomes only. */
  log: Outcome[]
  reading: TvReading | null
  timer: TvTimer | null
  /** How far into the night the table is; null outside the night. */
  nightStep: TvNightStep | null
  /** Ballots against each seat today, most first; the count so far while it comes up. Counts only. */
  tally: { target: PlayerId; votes: number }[]
  /** Who the count points at once it is complete, or null on a tie or before. */
  leader: PlayerId | null
  /** How many have voted, for a sealed ballot's running count. */
  voted: number
  /** The count coming up, or null while the ballot is sealed. */
  count: TvCount | null
  winner: Winner
  /**
   * The dead the paper has named for what they were (`revealedDead`): the one
   * place a role reaches the room, and only a day after the death. The leak
   * test allows exactly these ids' roles and no other.
   */
  revealed: { id: PlayerId; roleId: RoleId; trade: number | null }[]
  /**
   * The game is over: a side has won, or the narrator ended it early
   * (`TvContext.over`). The engine's phase stays where the game stopped, so
   * this is what a screen reads to leave the night or the ballot.
   */
  over: boolean
  /**
   * Who was who, once the game is over and never before: every seat's role
   * and trade, the second and last way a role reaches the room. The leak
   * tests allow it only while `over` is true.
   */
  cast: TvCast[]
  /** The edition open on the phone, by day, or null when none is. */
  paper: number | null
  /**
   * The lobby, during setup only: the address players join at, and the
   * roster as it fills, each name marked once a phone holds it. Null and
   * empty once the game has begun.
   */
  join: string | null
  roster: { name: string; joined: boolean }[]
}

/** The clock as the screen should show it: a snapshot, plus the deadline so a
 * screen can count down by itself between projections. */
export interface TvTimer extends TimerView {
  endsAt: number | null
}

/** One seat of the cast, public once the game has ended. */
export interface TvCast {
  id: PlayerId
  roleId: RoleId
  trade: number | null
  team: 'town' | 'crew'
}

/**
 * How far into the night the narrator is, and nothing else: plain numbers
 * from `state.schedule.length` and `state.stepIndex`, never a `RoleId`,
 * never the acting seat. It is the room's only signal that a step is being
 * decided right now — the room already cannot see who or what, by design
 * (`TvProjection` carries no role); this at least says time is passing.
 * Null outside the night, and while nobody has anything to act on.
 */
export interface TvNightStep {
  index: number
  of: number
}

/** The whole table for what it was: only ever built once the game is over. */
const castOf = (state: GameState): TvCast[] =>
  state.players.map((p) => ({ id: p.id, roleId: p.roleId, trade: p.trade, team: ROLES[p.roleId].team }))

export interface TvContext {
  /** The narrator's screen is the ending: a win, or the game ended early from the menu. */
  over?: boolean
  reading?: TvReading | null
  timer?: TvTimer | null
  paper?: number | null
  /**
   * The ballot is sealed: the room sees how many have voted, not for whom,
   * until the narrator reveals. The count and the leader stay on the phone.
   */
  sealed?: boolean
  /**
   * The count is coming up: this many ballots are on the seats. Omitted,
   * every ballot is (the narrator's own table with nothing to reveal).
   */
  shown?: number
  join?: string | null
  roster?: { name: string; joined: boolean }[]
}

/** The ballot as the room may see it: sealed, coming up, or every ballot. */
const ballot = (
  state: GameState,
  context: { sealed?: boolean; shown?: number },
): { tally: TvProjection['tally']; leader: PlayerId | null; voted: number; count: TvCount | null } => {
  const voted = state.votes.length
  if (context.sealed) return { tally: [], leader: null, voted, count: null }
  if (context.shown === undefined) {
    return { tally: tally(state).map((e) => ({ target: e.target, votes: e.votes })), leader: leader(state), voted, count: null }
  }
  const c = countUp(state, context.shown)
  return { tally: c.tally, leader: c.leader, voted, count: { shown: c.shown, total: c.total, last: c.last } }
}

/** Over when a side has won, or when the narrator says so (an early ending has no winner). */
const isOver = (state: GameState, context: { over?: boolean }): boolean =>
  winner(state) !== null || context.over === true

export const tvProjection = (
  state: GameState,
  locale: Locale,
  context: TvContext = {},
): TvProjection => ({
  kind: 'tv',
  locale,
  phase: state.phase,
  night: state.night,
  day: state.day,
  players: state.players.map((p) => ({
    id: p.id,
    name: p.name,
    alive: p.alive,
    silenced: p.silencedOnDay === state.day,
    extraVote: p.extraVotesOnDay === state.day,
    hasQuestion: p.hasQuestion,
    voted: state.votes.some((v) => v.voter === p.id),
  })),
  log: state.log.filter((o) => o.public),
  reading: context.reading ?? null,
  timer: context.timer ?? null,
  nightStep:
    state.phase === 'night' && state.schedule.length > 0
      ? { index: state.stepIndex, of: state.schedule.length }
      : null,
  ...ballot(state, context),
  winner: winner(state),
  revealed: revealedDead(state).map((p) => ({ id: p.id, roleId: p.roleId, trade: p.trade })),
  over: isOver(state, context),
  cast: isOver(state, context) ? castOf(state) : [],
  paper: context.paper ?? null,
  join: state.phase === 'setup' ? (context.join ?? null) : null,
  roster: state.phase === 'setup' ? (context.roster ?? []) : [],
})

/**
 * One player's own view, sealed for their phone alone (docs/BIG-SCREEN.md §4).
 * It carries exactly one role — theirs — and nothing about anyone else but
 * names and who may still be voted for. `projections.test.ts` holds it to
 * that. The role is withheld until the narrator has dealt (`dealt`), so a
 * phone joining during setup does not read "Citizen" off a roster that has
 * not been played yet.
 */
export interface SeatProjection {
  kind: 'seat'
  locale: Locale
  seat: PlayerId
  name: string
  roleId: RoleId | null
  trade: number | null
  alive: boolean
  phase: GameState['phase']
  night: number
  day: number
  canVote: boolean
  vote: PlayerId | null
  /** Who this seat may vote for: the living, themselves excluded. */
  eligible: { id: PlayerId; name: string }[]
  /** How many have voted today, and the count as the room sees it (sealed: empty, null). */
  voted: number
  tally: { target: PlayerId; votes: number }[]
  count: TvCount | null
  winner: Winner
  /** The game is over (a win, or ended early); the phone leaves the night or the ballot on it. */
  over: boolean
  /** This seat was on the winning side; null while the game is on or when nobody won. */
  won: boolean | null
  /** Who was who, once the game is over and never before. */
  cast: TvCast[]
  /**
   * The table as it is filling up, during setup only: the same names the TV's
   * lobby shows, each marked when a phone holds it. A phone that has just taken
   * a seat watches the others arrive instead of being told, untruthfully, that
   * the cards are being dealt (docs/BIG-SCREEN.md §12.3).
   */
  roster: { name: string; joined: boolean }[]
  /**
   * The narrator is in the middle of a reading. The phone holds the morning
   * back until the room has heard it: the dawn belongs to everyone at once,
   * not to whoever looks down first.
   */
  reading: Reading | null
  /** The table, for the phone to draw the ring: names, who is dead, who has voted; public already. */
  players: { id: PlayerId; name: string; alive: boolean; voted: boolean }[]
  /** The night as this seat may see it (docs/BIG-SCREEN.md §10); null by day. */
  tonight: SeatNight | null
}

/**
 * What one phone is shown and asked at night. Every phone gets the step being
 * read, since the narrator says it aloud; the rest is the seat's own
 * knowledge, `perspectiveFor()` as data plus what its card holds: the
 * Family sees the Family and its mark, the Godfather and the Renegade the
 * pick, the Apothecary who is doomed and her vials, the Chameleon the centre,
 * the Detective the card he looked at. A citizen's block is a step and empty
 * lists. `playthrough.test.ts` holds every seat to this at every step.
 */
export interface SeatNight {
  /** The role being read right now: public, the narrator says it. */
  step: RoleId | null
  /** This seat holds the step, or wakes with the Family at the Family's step. */
  acting: boolean
  /** What the role knows of the table tonight; empty lists for a citizen. */
  view: { self: PlayerId[]; crew: PlayerId[]; doomed: PlayerId[]; marked: PlayerId[] }
  /** The seats this step may pick among; empty unless acting. */
  eligible: PlayerId[]
  /** The Apothecary's vials, still available or not; hers alone. */
  vials: { heal: boolean; poison: boolean } | null
  /** The Godfather's one conversion, still available or not; his alone. */
  convertLeft: boolean | null
  /** The Family's pick tonight once recorded; the Godfather's and the Renegade's. */
  victim: PlayerId | null
  /** The cards left in the centre, on the Chameleon's phone at his step. */
  spare: RoleId[]
  /** Who the Detective looked at tonight and what they are; his alone, for the rest of the night. */
  looked: { target: PlayerId; roleId: RoleId } | null
}

const plain = (view: Perspective): SeatNight['view'] => ({
  self: [...view.self],
  crew: [...view.crew],
  doomed: [...view.doomed],
  marked: [...view.marked],
})

export const seatNight = (state: GameState, me: Player, picked: readonly PlayerId[]): SeatNight | null => {
  if (state.phase !== 'night') return null
  const step = currentStep(state)
  const acting = actsAt(me, step)
  // The mark is the acting seats' business; nobody else's phone sees whose it is.
  const view = plain(perspectiveFor(state, me.roleId, acting ? picked : []))
  const crewViewer = me.alive && ROLES[me.roleId].team === 'crew' && me.roleId !== 'PICK_SIDE'
  // perspectiveFor marks every holder of a role as "you" for the narrator's
  // Show; a phone is one seat, so a citizen's phone must not mark the citizens.
  view.self = crewViewer ? [] : [me.id]
  // Who is doomed is the Apothecary's to know at her step, not a moment before.
  if (!(acting && me.roleId === 'MEDIC')) view.doomed = []
  // The dead see the night like everyone else, whatever they were.
  if (!me.alive) {
    view.crew = []
    view.marked = []
  }
  const look = me.roleId === 'INSPECT'
    ? state.pending.find((a) => a.kind === 'target' && a.roleId === 'INSPECT')
    : undefined
  const lookedAt = look !== undefined && look.kind === 'target'
    ? state.players.find((p) => p.id === look.target)
    : undefined
  return {
    step,
    acting,
    view,
    eligible: acting && step !== null ? eligibleAt(state, step) : [],
    vials: me.roleId === 'MEDIC' ? { heal: !state.healUsed, poison: !state.poisonUsed } : null,
    convertLeft: me.roleId === 'CONVERT' ? !state.infectionUsed : null,
    victim: crewViewer && me.roleId !== 'KILLER' ? (familyVictim(state)?.id ?? null) : null,
    spare: acting && me.roleId === 'SWAP' ? spareCards(state.players) : [],
    looked: lookedAt !== undefined ? { target: lookedAt.id, roleId: lookedAt.roleId } : null,
  }
}

export const seatProjection = (
  state: GameState,
  seat: PlayerId,
  locale: Locale,
  context: {
    dealt: boolean
    picked?: readonly PlayerId[]
    sealed?: boolean
    shown?: number
    over?: boolean
    roster?: { name: string; joined: boolean }[]
    reading?: Reading | null
  },
): SeatProjection | null => {
  const me = state.players.find((p) => p.id === seat)
  if (!me) return null
  const voting = state.phase === 'day' && me.alive && canVote(state, seat)
  const won = winner(state)
  const over = isOver(state, context)
  return {
    kind: 'seat',
    locale,
    seat,
    name: me.name,
    roleId: context.dealt ? me.roleId : null,
    trade: context.dealt ? me.trade : null,
    alive: me.alive,
    phase: state.phase,
    night: state.night,
    day: state.day,
    canVote: voting,
    vote: state.votes.find((v) => v.voter === seat)?.target ?? null,
    eligible: voting
      ? state.players.filter((p) => p.alive && p.id !== seat).map((p) => ({ id: p.id, name: p.name }))
      : [],
    ...(() => {
      const b = ballot(state, context)
      return { voted: b.voted, tally: b.tally, count: b.count }
    })(),
    winner: won,
    over,
    won: won === null ? null : wonBy(me, won),
    cast: over ? castOf(state) : [],
    roster: state.phase === 'setup' ? (context.roster ?? []) : [],
    reading: context.reading ?? null,
    players: state.players.map((p) => ({ id: p.id, name: p.name, alive: p.alive, voted: state.votes.some((v) => v.voter === p.id) })),
    // A game the narrator has ended has no night left to play on a phone.
    tonight: context.dealt && context.over !== true ? seatNight(state, me, context.picked ?? []) : null,
  }
}

/** A seat before there is a game: the roster is still names on the narrator's screen. */
export const waitingSeat = (
  seat: PlayerId,
  name: string,
  locale: Locale,
  roster: { name: string; joined: boolean }[] = [],
): SeatProjection => ({
  kind: 'seat',
  locale,
  seat,
  name,
  roleId: null,
  trade: null,
  alive: true,
  phase: 'setup',
  night: 0,
  day: 0,
  canVote: false,
  vote: null,
  eligible: [],
  voted: 0,
  tally: [],
  count: null,
  winner: null,
  over: false,
  won: null,
  cast: [],
  roster,
  reading: null,
  players: [],
  tonight: null,
})
