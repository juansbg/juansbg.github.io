import { describe, expect, it } from 'vitest'
import { COMPLEXITIES } from '../deal'
import { playMany } from './play'
import { POLICIES, type PolicyName } from './policies'
import { seeded } from './rng'
import { seedFor } from './report'
import { share, summarize } from './stats'

/**
 * The balance invariants, checked on every test run.
 *
 * These are the structural failures the first simulation found (docs/ROADMAP.md,
 * section 1) written down so they cannot come back: a deal that decides the
 * game before the town has voted, a game the engine cannot end, a state with
 * nobody alive and no winner. The bounds on the win split are deliberately
 * loose — the bots play badly by design — and exist to catch a rule change
 * that hands one side the game, not to tune it.
 */

const GAMES = 400
const SIZES = [5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]

const everySetting = (f: (policy: PolicyName, players: number, complexity: (typeof COMPLEXITIES)[number]) => void): void => {
  for (const policy of Object.keys(POLICIES) as PolicyName[]) {
    for (const complexity of COMPLEXITIES) {
      for (const players of SIZES) f(policy, players, complexity)
    }
  }
}

describe('every table', () => {
  it('ends, with a winner, and not before the town has voted', () => {
    everySetting((policy, players, complexity) => {
      const random = seeded(seedFor(policy, players, complexity))
      const s = summarize(playMany(GAMES, players, complexity, POLICIES[policy], random))
      const label = `${policy}/${complexity}/${players}`
      expect(s.stalled, `${label} stalled`).toBe(0)
      expect(s.noWinner, `${label} ended with no winner`).toBe(0)
      // A wipe-out has a winner now; it must still be rare enough not to matter.
      expect(share(s.wipe, s), `${label} wiped out`).toBeLessThanOrEqual(1)
      expect(share(s.overOnFirstMorning, s), `${label} over on the first morning`).toBeLessThanOrEqual(5)
    })
  })

  it('gives a detective-led town a fighting chance, and the crew one too', () => {
    for (const complexity of COMPLEXITIES) {
      for (const players of SIZES) {
        const random = seeded(seedFor('detective', players, complexity))
        const s = summarize(playMany(GAMES, players, complexity, POLICIES.detective, random))
        const label = `detective/${complexity}/${players}`
        expect(share(s.town, s), `${label} town wins`).toBeGreaterThanOrEqual(15)
        expect(share(s.crew, s), `${label} crew wins`).toBeGreaterThanOrEqual(15)
      }
    }
  })
})
