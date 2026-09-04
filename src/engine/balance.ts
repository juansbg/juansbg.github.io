import { crewSize, type Complexity } from './deal'
import { playMany } from './sim/play'
import { POLICIES } from './sim/policies'
import { seeded } from './sim/rng'
import { summarize } from './sim/stats'

/**
 * What the dealer is about to do to a table, in one line for the setup screen:
 * how many of them will be Family, and which way the table leans.
 *
 * The lean comes from the simulator's detective-led bots, a thousand games
 * per setting, seeded so it never flickers between renders and cached so it
 * costs a few milliseconds once. The bots play badly by design, so the band
 * for "about even" is wide: only a table the bots settle by two to one is
 * said to lean.
 */

export type Lean = 'town' | 'even' | 'crew'

export interface Balance {
  players: number
  crew: number
  /** Town wins per hundred, from the bots. Indicative, not a measurement. */
  townShare: number
  lean: Lean
}

const GAMES = 1000
const LEANS_TOWN = 65
const LEANS_CREW = 35

const cache = new Map<string, Balance>()

export const balanceOf = (players: number, complexity: Complexity): Balance => {
  const key = `${players}/${complexity}`
  const hit = cache.get(key)
  if (hit) return hit

  const random = seeded(players * 100 + complexity.length)
  const s = summarize(playMany(GAMES, players, complexity, POLICIES.detective, random))
  const townShare = Math.round((100 * s.town) / s.games)
  const lean: Lean = townShare >= LEANS_TOWN ? 'town' : townShare <= LEANS_CREW ? 'crew' : 'even'
  const balance: Balance = { players, crew: crewSize(players), townShare, lean }
  cache.set(key, balance)
  return balance
}
