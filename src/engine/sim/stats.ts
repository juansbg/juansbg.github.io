import type { Complexity } from '../deal'
import type { GameResult } from './play'
import type { PolicyName } from './policies'

/** What a batch of games at one setting looked like. Counts, not shares. */
export interface Summary {
  games: number
  town: number
  crew: number
  lovers: number
  martyr: number
  wipe: number
  stalled: number
  noWinner: number
  overOnFirstMorning: number
  overOnFirstDay: number
  longerThanEight: number
  nights: { mean: number; p10: number; p90: number; max: number }
}

const quantile = (sorted: readonly number[], q: number): number =>
  sorted[Math.floor(q * (sorted.length - 1))] ?? 0

export const summarize = (results: readonly GameResult[]): Summary => {
  const count = (f: (r: GameResult) => boolean): number => results.filter(f).length
  const nights = results.map((r) => r.nights).sort((a, b) => a - b)
  const games = results.length
  return {
    games,
    town: count((r) => r.winner === 'town'),
    crew: count((r) => r.winner === 'crew'),
    lovers: count((r) => r.winner === 'lovers'),
    martyr: count((r) => r.winner === 'martyr'),
    wipe: count((r) => r.wipe),
    stalled: count((r) => r.stalled),
    noWinner: count((r) => r.winner === null),
    overOnFirstMorning: count((r) => r.overOnFirstMorning),
    overOnFirstDay: count((r) => r.overOnFirstDay),
    longerThanEight: count((r) => r.nights > 8),
    nights: {
      mean: games === 0 ? 0 : nights.reduce((a, b) => a + b, 0) / games,
      p10: quantile(nights, 0.1),
      p90: quantile(nights, 0.9),
      max: nights[nights.length - 1] ?? 0,
    },
  }
}

/** A count as a whole-number percentage of the batch. */
export const share = (count: number, summary: Summary): number =>
  summary.games === 0 ? 0 : Math.round((100 * count) / summary.games)

export interface TableRow {
  policy: PolicyName
  players: number
  complexity: Complexity
  summary: Summary
}

const HEADER =
  'n   cx        town  crew  lov  mar wipe | nights avg  p10  p90  max | over@N1  over@D1  >8n  stalled'

/** The report, one block per policy, as fixed-width text. */
export const formatTable = (rows: readonly TableRow[]): string => {
  const lines: string[] = []
  let policy: PolicyName | null = null
  for (const row of rows) {
    if (row.policy !== policy) {
      policy = row.policy
      if (lines.length > 0) lines.push('')
      lines.push(`== town policy: ${policy} ==`, HEADER)
    }
    const s = row.summary
    const pct = (n: number): string => String(share(n, s)).padStart(4)
    const num = (n: number): string => String(n).padStart(3)
    lines.push(
      `${String(row.players).padEnd(3)} ${row.complexity.padEnd(9)}` +
        ` ${pct(s.town)} ${pct(s.crew)} ${pct(s.lovers)} ${pct(s.martyr)} ${pct(s.wipe)} |` +
        ` ${s.nights.mean.toFixed(1).padStart(9)}  ${num(s.nights.p10)}  ${num(s.nights.p90)}  ${num(s.nights.max)} |` +
        `    ${pct(s.overOnFirstMorning)}     ${pct(s.overOnFirstDay)} ${pct(s.longerThanEight)}     ${pct(s.stalled)}`,
    )
  }
  return lines.join('\n')
}
