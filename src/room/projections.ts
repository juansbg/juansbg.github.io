import { canVote, leader, revealedDead, tally, winner, type Winner } from '../engine/state'
import type { RoleId } from '../engine/roles'
import type { GameState, Outcome, PlayerId } from '../engine/types'
import type { Locale } from '../i18n'
import type { Reading, Slide } from '../ui/screens/dawn'
import type { TimerView } from '../ui/screens/timer'

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
  /** Votes against each seat today, most first. Counts only. */
  tally: { target: PlayerId; votes: number }[]
  /** Who the count points at, or null on a tie or before a vote. */
  leader: PlayerId | null
  /** How many have voted, for a sealed ballot's running count. */
  voted: number
  winner: Winner
  /**
   * The dead the paper has named for what they were (`revealedDead`): the one
   * place a role reaches the room, and only a day after the death. The leak
   * test allows exactly these ids' roles and no other.
   */
  revealed: { id: PlayerId; roleId: RoleId; trade: number | null }[]
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

export interface TvContext {
  reading?: TvReading | null
  timer?: TvTimer | null
  paper?: number | null
  /**
   * The ballot is sealed: the room sees how many have voted, not for whom,
   * until the narrator reveals. The count and the leader stay on the phone.
   */
  sealed?: boolean
  join?: string | null
  roster?: { name: string; joined: boolean }[]
}

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
  })),
  log: state.log.filter((o) => o.public),
  reading: context.reading ?? null,
  timer: context.timer ?? null,
  tally: context.sealed ? [] : tally(state).map((e) => ({ target: e.target, votes: e.votes })),
  leader: context.sealed ? null : leader(state),
  voted: state.votes.length,
  winner: winner(state),
  revealed: revealedDead(state).map((p) => ({ id: p.id, roleId: p.roleId, trade: p.trade })),
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
  winner: Winner
}

export const seatProjection = (
  state: GameState,
  seat: PlayerId,
  locale: Locale,
  context: { dealt: boolean },
): SeatProjection | null => {
  const me = state.players.find((p) => p.id === seat)
  if (!me) return null
  const voting = state.phase === 'day' && me.alive && canVote(state, seat)
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
    winner: winner(state),
  }
}

/** A seat before there is a game: the roster is still names on the narrator's screen. */
export const waitingSeat = (seat: PlayerId, name: string, locale: Locale): SeatProjection => ({
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
  winner: null,
})
