import { ROLES, isCrewRole, type RoleId, type Team } from './roles'
import { winner, type Winner } from './state'
import type { DeathCause, GameState, Player } from './types'

/**
 * A finished game, folded down to what the table wants to remember about
 * it: who sat where, who was what, who won, who was hanged and who was
 * found in the morning. Pure data from a `GameState`, small enough to keep
 * hundreds of; the statistics screen reads a list of these and never the
 * saved games themselves, which the store forgets on a restart.
 *
 * Nothing here is secret once the game is over: the final edition already
 * names every seat's role.
 */

export const SUMMARY_VERSION = 1

export interface SeatRecord {
  name: string
  roleId: RoleId
  team: Team
  trade: number | null
  /** Still standing when the game ended. */
  alive: boolean
  /** How and when they died, if they did. A day death carries the night before it. */
  death: { night: number; cause: DeathCause } | null
  /** On the side that won: their team's win, the pair's, or the martyr's own. */
  won: boolean
}

export interface GameSummary {
  version: typeof SUMMARY_VERSION
  /** The game's seed, drawn once at createGame: one per game, so a game is never counted twice. */
  seed: number
  /** Wall-clock milliseconds when the game ended, as given by the caller. */
  endedAt: number
  winner: Exclude<Winner, null>
  players: number
  nights: number
  seats: SeatRecord[]
  /**
   * The Detective's looks, and how many of them found the Family. Measured
   * against the cards as they were at the end, so a citizen the Godfather
   * took in counts as Family even if the look came first.
   */
  looks: number
  hits: number
}

const wonBy = (p: Player, won: Exclude<Winner, null>): boolean => {
  switch (won) {
    case 'town':
      return ROLES[p.roleId].team === 'town'
    case 'crew':
      return isCrewRole(p.roleId)
    case 'lovers':
      return p.alive && p.loverOf !== null
    case 'martyr':
      return p.roleId === 'MARTYR'
  }
}

/** The game folded down, or null while it is still being played. */
export const summarise = (state: GameState, endedAt: number): GameSummary | null => {
  const won = winner(state)
  if (won === null) return null

  const deaths = new Map<number, { night: number; cause: DeathCause }>()
  for (const o of state.log) {
    if (o.type === 'death' && !deaths.has(o.target)) deaths.set(o.target, { night: o.night, cause: o.cause })
  }

  const seats: SeatRecord[] = state.players.map((p) => ({
    name: p.name,
    roleId: p.roleId,
    team: ROLES[p.roleId].team,
    trade: p.trade,
    alive: p.alive,
    death: deaths.get(p.id) ?? null,
    won: wonBy(p, won),
  }))

  const looks = state.log.filter((o) => o.type === 'inspected')
  const hits = looks.filter((o) => {
    const target = state.players.find((p) => p.id === o.target)
    return target !== undefined && isCrewRole(target.roleId)
  }).length

  return {
    version: SUMMARY_VERSION,
    seed: state.seed,
    endedAt,
    winner: won,
    players: state.players.length,
    nights: state.night,
    seats,
    looks: looks.length,
    hits,
  }
}

// ---------------------------------------------------------------------------
// Across games
// ---------------------------------------------------------------------------

/** One person's record across every game they sat in, matched by name. */
export interface NameStats {
  /** The spelling from their most recent game. */
  name: string
  games: number
  wins: number
  /** Dealt to the Family (or taken in), by the end of the game. */
  family: number
  /** Executed by the town. */
  hanged: number
  /** Died at night, by any hand. */
  killed: number
  /** Alive when the game ended. */
  survived: number
}

export interface TableStats {
  games: number
  town: number
  crew: number
  lovers: number
  martyr: number
  /** Nights played, in total; divide by games for the average. */
  nights: number
  looks: number
  hits: number
}

export interface RosterStats {
  table: TableStats
  /** Most games first, then alphabetical. */
  names: NameStats[]
}

/** The same key the lobby uses to seat a phone by name: trimmed, case-folded. */
export const nameKey = (name: string): string => name.trim().toLowerCase()

export const aggregate = (games: readonly GameSummary[]): RosterStats => {
  const table: TableStats = { games: 0, town: 0, crew: 0, lovers: 0, martyr: 0, nights: 0, looks: 0, hits: 0 }
  const byName = new Map<string, NameStats>()

  for (const g of games) {
    table.games += 1
    table[g.winner] += 1
    table.nights += g.nights
    table.looks += g.looks
    table.hits += g.hits
    for (const s of g.seats) {
      const key = nameKey(s.name)
      if (key === '') continue
      const row = byName.get(key) ?? {
        name: s.name,
        games: 0,
        wins: 0,
        family: 0,
        hanged: 0,
        killed: 0,
        survived: 0,
      }
      row.name = s.name
      row.games += 1
      if (s.won) row.wins += 1
      if (s.team === 'crew') row.family += 1
      if (s.death?.cause === 'lynch') row.hanged += 1
      else if (s.death !== null) row.killed += 1
      if (s.alive) row.survived += 1
      byName.set(key, row)
    }
  }

  const names = [...byName.values()].sort(
    (a, b) => b.games - a.games || a.name.localeCompare(b.name),
  )
  return { table, names }
}
