import { COMPLEXITIES } from '../deal'
import { playMany } from './play'
import { POLICIES, type PolicyName } from './policies'
import { seeded } from './rng'
import { formatTable, summarize, type TableRow } from './stats'

/**
 * The balance report: `npm run sim [games]`.
 *
 * Plays every table size at every complexity under both town policies and
 * prints one row per setting. docs/ROADMAP.md keeps the last run; rerun it
 * after any change to the dealer, the resolver or the win conditions and
 * paste the table over the old one.
 */

export const TABLE_SIZES: readonly number[] = [5, 6, 7, 8, 9, 10, 12, 15]

/** One seed per setting, so a row can be replayed on its own. */
export const seedFor = (policy: PolicyName, players: number, complexity: string): number =>
  players * 1000 + complexity.length + (policy === 'random' ? 0 : 500)

export const runTable = (games: number, sizes: readonly number[] = TABLE_SIZES): TableRow[] => {
  const rows: TableRow[] = []
  for (const policy of Object.keys(POLICIES) as PolicyName[]) {
    for (const complexity of COMPLEXITIES) {
      for (const players of sizes) {
        const random = seeded(seedFor(policy, players, complexity))
        const results = playMany(games, players, complexity, POLICIES[policy], random)
        rows.push({ policy, players, complexity, summary: summarize(results) })
      }
    }
  }
  return rows
}

export const main = (args: readonly string[]): string => {
  const games = Math.max(1, Number(args[0] ?? 3000) || 3000)
  return `${games} games per row\n\n${formatTable(runTable(games))}`
}
