import { describe, expect, it } from 'vitest'
import { playGame, playMany } from './play'
import { POLICIES, detectiveVote, randomNight } from './policies'
import { seeded } from './rng'
import { formatTable, summarize } from './stats'
import { createGame, endNight, recordAction, startNight } from '../state'

describe('the bot', () => {
  it('plays the same game twice from the same seed', () => {
    const roles = ['KILLER', 'INSPECT', 'GUARD', 'PLAIN', 'PLAIN', 'MEDIC', 'AVENGE'] as const
    const a = playGame(roles, POLICIES.detective, seeded(7))
    const b = playGame(roles, POLICIES.detective, seeded(7))
    expect(a).toEqual(b)
  })

  it('always finishes with a winner', () => {
    const results = playMany(200, 9, 'complex', POLICIES.random, seeded(1))
    for (const r of results) {
      expect(r.winner).not.toBeNull()
      expect(r.stalled).toBe(false)
    }
  })

  it('records only legal moves for the Family', () => {
    // The Family never picks its own; the bot must respect the engine's rule.
    const state = startNight(createGame([
      { name: 'a', roleId: 'KILLER' },
      { name: 'b', roleId: 'CONVERT' },
      { name: 'c', roleId: 'PLAIN' },
    ]))
    const random = seeded(3)
    for (let i = 0; i < 50; i++) {
      const action = randomNight(state, 'KILLER', random)
      expect(action.kind).toBe('target')
      if (action.kind === 'target') expect(action.target).toBe(2)
    }
  })

  it('hangs the crew member the Detective found', () => {
    let state = startNight(createGame([
      { name: 'a', roleId: 'INSPECT' },
      { name: 'b', roleId: 'KILLER' },
      { name: 'c', roleId: 'PLAIN' },
      { name: 'd', roleId: 'PLAIN' },
      { name: 'e', roleId: 'PLAIN' },
    ]))
    state = recordAction(state, { kind: 'target', roleId: 'INSPECT', actor: 0, target: 1 })
    state = recordAction(state, { kind: 'target', roleId: 'KILLER', actor: null, target: 4 })
    state = endNight(state)
    expect(detectiveVote(state, seeded(1))).toBe(1)
  })
})

describe('the summary', () => {
  it('counts what the report prints', () => {
    const results = playMany(50, 8, 'standard', POLICIES.random, seeded(2))
    const s = summarize(results)
    expect(s.games).toBe(50)
    expect(s.town + s.crew + s.lovers + s.martyr + s.noWinner).toBe(50)
    expect(s.nights.p10).toBeLessThanOrEqual(s.nights.p90)
    expect(s.nights.p90).toBeLessThanOrEqual(s.nights.max)
    const table = formatTable([{ policy: 'random', players: 8, complexity: 'standard', summary: s }])
    expect(table).toContain('== town policy: random ==')
    expect(table).toMatch(/^8 {3}standard/m)
  })
})
