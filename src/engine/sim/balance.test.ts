import { crewNextDoor, doorsBetween } from '../resolve'
import type { Outcome } from '../types'
import { describe, expect, it } from 'vitest'
import { COMPLEXITIES, dealRoles, type Complexity } from '../deal'
import { playGame, playMany } from './play'
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

describe('the paper’s breadcrumbs, over many games', () => {
  it('are true of the game every single time', () => {
    const random = seeded(2026)
    let clues = 0
    for (let i = 0; i < 300; i++) {
      const roles = dealRoles(5 + (i % 11), COMPLEXITIES[i % 3] as Complexity, random)
      playGame(roles, POLICIES.detective, random, (state) => {
        const night = state.night
        const tonight = state.log.filter((o) => o.night === night)
        const victims = tonight
          .filter((o): o is Extract<Outcome, { type: 'death' }> => o.type === 'death' && (o.cause === 'killers' || o.cause === 'rogue'))
          .map((o) => o.target)
        for (const o of tonight) {
          if (o.type !== 'clue') continue
          clues += 1
          const holder = state.players.find((p) => p.trade === o.trade)
          expect(holder, 'a clue names a trade someone holds').toBeDefined()
          expect(holder!.alive, 'a clue comes from the living').toBe(true)
          const c = o.clue
          if (c.kind === 'neighbour') {
            expect(c.crew).toBe(crewNextDoor(state.players, holder!.id))
          } else {
            expect(victims.some((v) => doorsBetween(holder!.id, v, state.players.length) === c.doors)).toBe(true)
          }
        }
        expect(tonight.filter((o) => o.type === 'clue').length).toBeLessThanOrEqual(1)
      })
    }
    expect(clues).toBeGreaterThan(100)
  })
})
