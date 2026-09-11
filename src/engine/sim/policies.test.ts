import { describe, expect, it } from 'vitest'
import { seeded } from '../rng'
import type { RoleId } from '../roles'
import { endNight, recordAction, startNight, type PlayerSetup } from '../state'
import { quietGame } from '../testing'
import type { GameState, Outcome } from '../types'
import { clueVote } from './policies'

const setup = (roles: RoleId[]): PlayerSetup[] => roles.map((roleId, i) => ({ name: `P${i}`, roleId }))

/** Six seats, the Family at 0, the Detective at 3; a quiet first night, then the day. */
const day = (): GameState => {
  let state = quietGame(setup(['KILLER', 'PLAIN', 'PLAIN', 'INSPECT', 'PLAIN', 'GUARD']))
  state = startNight(state)
  state = recordAction(state, { kind: 'target', roleId: 'GUARD', actor: 5, target: 1 })
  state = recordAction(state, { kind: 'target', roleId: 'INSPECT', actor: 3, target: 4 })
  state = recordAction(state, { kind: 'target', roleId: 'KILLER', actor: 0, target: 1 })
  return endNight(state)
}

const withClue = (state: GameState, holder: number, crew: boolean): GameState => {
  const trade = state.players[holder]!.trade as number
  const clue: Outcome = { type: 'clue', night: 1, trade, clue: { kind: 'neighbour', crew }, public: true }
  return { ...state, log: [...state.log, clue] }
}

const votes = (state: GameState, runs = 60): Set<number> => {
  const random = seeded(3)
  const out = new Set<number>()
  for (let i = 0; i < runs; i++) out.add(clueVote(state, random))
  return out
}

describe('a town that reads the paper', () => {
  it('never hangs a living citizen who has claimed a trade, nor the Detective’s cleared', () => {
    const picks = votes(day())
    // Trade-holders 1, 2, 4 are believed; 4 was also inspected. Left: the Family (0), the Detective (3), the Bodyguard (5).
    expect([...picks].sort()).toEqual([0, 3, 5])
  })

  it('points at the neighbours of a trade the paper put next to the Family', () => {
    // Seat 1's neighbours in the living ring are 0 and 2; 2 has a trade and is believed.
    const picks = votes(withClue(day(), 1, true))
    expect([...picks]).toEqual([0])
  })

  it('clears the neighbours of a trade the paper said sleeps safely', () => {
    // Seat 4's neighbours are 3 and 5: both cleared, leaving only the Family.
    const picks = votes(withClue(day(), 4, false))
    expect([...picks]).toEqual([0])
  })

  it('reads an old breadcrumb against the seating of its own night', () => {
    // Night 1 clue on seat 2 (neighbours 1 and 3 that night). Then seat 1 dies on night 2:
    // in the ring today 2's neighbours would be 0 and 3, but the clue still points at 1 and 3.
    let state = withClue(day(), 2, true)
    const death: Outcome = { type: 'death', night: 2, target: 1, cause: 'killers', public: true }
    state = {
      ...state,
      night: 2,
      log: [...state.log, death],
      players: state.players.map((p) => (p.id === 1 ? { ...p, alive: false } : p)),
    }
    // 1 is dead, 3 is the Detective (alive, suspected once, not cleared): the town hangs 3, never 0 on the clue's account.
    const picks = votes(state)
    expect([...picks]).toEqual([3])
  })
})
