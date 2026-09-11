import { canVote, leader, tally } from '../../engine/state'
import type { GameState, Player, PlayerId } from '../../engine/types'
import { strings, type Locale } from '../../i18n'
import { esc } from '../dom'

/**
 * The town's vote, recorded on the day screen.
 *
 * Recording is optional and two taps a vote: the narrator taps the voter,
 * then their pick, and the engine keeps one vote per voter (`castVote`).
 * Tapping the armed voter again takes their vote back. The count lives on
 * the seats as badges and the voters in a row of their own, so the two can
 * go to different places when the table is on a TV (docs/BIG-SCREEN.md:
 * counts only reach the screen everyone sees).
 */

/** The narrator is recording votes; `armed` is the voter whose pick is awaited. */
export interface VoteMode {
  armed: PlayerId | null
}

/**
 * Who may be tapped now. With nobody armed, anyone who can vote today: the
 * dead and the silenced are dimmed. With a voter armed, every living seat
 * is a pick, the voter's own included, which is how a vote is withdrawn.
 */
export const voteChoices = (state: GameState, armed: PlayerId | null): PlayerId[] => {
  const living = state.players.filter((p) => p.alive)
  return (armed === null ? living.filter((p) => canVote(state, p.id)) : living).map((p) => p.id)
}

/** Votes against each seat, the Raven's extra included. Seats with none are absent. */
export const voteCounts = (state: GameState): ReadonlyMap<PlayerId, number> =>
  new Map(tally(state).map((e) => [e.target, e.votes]))

/**
 * The ballots as they come up in the count, one target per ballot, in
 * suspense order: rounds across the seats pointed at, the fewest first, so
 * every seat rises together and the last ballots all fall on the leader.
 * The Raven's extra is a ballot like any other; no voter is in it.
 */
export const countOrder = (state: GameState): PlayerId[] => {
  const entries = [...tally(state)].sort((a, b) => a.votes - b.votes || a.target - b.target)
  const rounds = entries.at(-1)?.votes ?? 0
  const out: PlayerId[] = []
  for (let round = 0; round < rounds; round++) {
    for (const e of entries) if (e.votes > round) out.push(e.target)
  }
  return out
}

/** The count with `shown` ballots up: the seat each fell on, most first, and the one that fell last. */
export interface Count {
  shown: number
  total: number
  /** The seat the last ballot fell on, for the screen to make it land. */
  last: PlayerId | null
  tally: { target: PlayerId; votes: number }[]
  /** Who the count points at once it is complete; null before, and on a tie. */
  leader: PlayerId | null
}

export const countUp = (state: GameState, shown: number): Count => {
  const order = countOrder(state)
  const up = Math.max(0, Math.min(shown, order.length))
  const votes = new Map<PlayerId, number>()
  for (const target of order.slice(0, up)) votes.set(target, (votes.get(target) ?? 0) + 1)
  const entries = [...votes].map(([target, n]) => ({ target, votes: n })).sort((a, b) => b.votes - a.votes || a.target - b.target)
  return {
    shown: up,
    total: order.length,
    last: up === 0 ? null : (order[up - 1] ?? null),
    tally: entries,
    leader: up === order.length ? leader(state) : null,
  }
}

const nameOf = (players: readonly Player[], id: PlayerId): string =>
  players.find((p) => p.id === id)?.name ?? '?'

/**
 * The count so far as a row of names: who is being pointed at, by how many,
 * and by whom. Empty until somebody votes. The seat the town is pointing at
 * carries `data-leader`; a tie has none.
 */
export const tallyMarkup = (state: GameState, locale: Locale): string => {
  const entries = tally(state)
  if (entries.length === 0) return ''
  const t = strings(locale)
  const top = leader(state)
  const rows = entries
    .map((e) => {
      const voters = e.voters.map((v) => nameOf(state.players, v))
      // The Raven's extra vote has no voter; it shows as its own mark.
      if (e.votes > e.voters.length) voters.push(t.ui.day.extraVoteMark)
      return `
        <li class="tally__row"${e.target === top ? ' data-leader' : ''}>
          <span class="tally__count">${e.votes}</span>
          <span class="tally__name">${esc(nameOf(state.players, e.target))}</span>
          <span class="tally__voters">${esc(voters.join(', '))}</span>
        </li>
      `
    })
    .join('')
  return `<ul class="tally" data-tally aria-label="${esc(t.ui.day.tally)}">${rows}</ul>`
}
