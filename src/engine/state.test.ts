import { describe, expect, it } from 'vitest'
import {
  advance,
  canUndo,
  createGame,
  currentStep,
  endNight,
  hunterShot,
  isNightComplete,
  lynch,
  newSession,
  recordAction,
  startNight,
  undo,
  winner,
  type PlayerSetup,
} from './state'
import { STATE_VERSION } from './types'
import type { RoleId } from './roles'

const cast = (roles: RoleId[], names?: string[]): PlayerSetup[] =>
  roles.map((roleId, i) => ({ name: names?.[i] ?? `P${i}`, roleId }))

describe('createGame', () => {
  it('gives every player a distinct id even when names collide', () => {
    const state = createGame(cast(['LOB', 'VID'], ['Ana', 'Ana']))
    expect(state.players.map((p) => p.id)).toEqual([0, 1])
    expect(state.players[0]!.name).toBe(state.players[1]!.name)
  })

  it('grants the Anciano one survivable wolf attack', () => {
    const state = createGame(cast(['ANC', 'LOB']))
    expect(state.players[0]!.wolfAttacksSurvivable).toBe(1)
    expect(state.players[1]!.wolfAttacksSurvivable).toBe(0)
  })

  it('stamps a version so saved games can be migrated later', () => {
    expect(createGame(cast(['ALD'])).version).toBe(STATE_VERSION)
  })
})

describe('stepping through a night', () => {
  it('walks the schedule in order and reports completion', () => {
    let state = startNight(createGame(cast(['PRO', 'VID', 'LOB', 'ALD'])))
    expect(state.schedule).toEqual(['PRO', 'VID', 'LOB'])

    expect(currentStep(state)).toBe('PRO')
    state = recordAction(state, { kind: 'target', roleId: 'PRO', actor: 0, target: 3 })
    expect(currentStep(state)).toBe('VID')

    state = recordAction(state, { kind: 'target', roleId: 'VID', actor: 1, target: 2 })
    state = recordAction(state, { kind: 'target', roleId: 'LOB', actor: 2, target: 3 })

    expect(isNightComplete(state)).toBe(true)
    expect(currentStep(state)).toBeNull()
  })

  it('stops prompting for the Protector once he is dead', () => {
    let state = startNight(createGame(cast(['PRO', 'LOB', 'ALD'])))
    state = recordAction(state, { kind: 'skip', roleId: 'PRO' })
    state = recordAction(state, { kind: 'target', roleId: 'LOB', actor: 1, target: 0 })
    state = endNight(state)

    expect(state.players[0]!.alive).toBe(false)
    expect(startNight(state).schedule).toEqual(['LOB'])
  })

  it('forbids the Protector repeating a target, per the script', () => {
    let state = startNight(createGame(cast(['PRO', 'LOB', 'ALD'])))
    state = recordAction(state, { kind: 'target', roleId: 'PRO', actor: 0, target: 2 })
    state = recordAction(state, { kind: 'skip', roleId: 'LOB' })
    state = startNight(endNight(state))

    // The engine records who was shielded last night; the UI uses this to grey
    // that player out of the Protector's list.
    expect(state.players[2]!.protectedLastNight).toBe(true)
    expect(state.players[1]!.protectedLastNight).toBe(false)
  })
})

describe('undo', () => {
  it('restores the previous state exactly', () => {
    let session = newSession(startNight(createGame(cast(['PRO', 'VID', 'LOB']))))
    const before = structuredClone(session.current)

    session = advance(session, (s) =>
      recordAction(s, { kind: 'target', roleId: 'PRO', actor: 0, target: 2 }),
    )
    expect(session.current.pending).toHaveLength(1)

    session = undo(session)
    expect(session.current).toEqual(before)
  })

  it('does not delete an unrelated action when stepping back past a skip', () => {
    // v1's prevStep() popped the events array unconditionally, so stepping
    // back past a role that recorded nothing destroyed someone else's action.
    let session = newSession(startNight(createGame(cast(['PRO', 'VID', 'LOB']))))

    session = advance(session, (s) =>
      recordAction(s, { kind: 'target', roleId: 'PRO', actor: 0, target: 2 }),
    )
    session = advance(session, (s) => recordAction(s, { kind: 'skip', roleId: 'VID' }))
    session = undo(session)

    expect(session.current.pending).toEqual([
      { kind: 'target', roleId: 'PRO', actor: 0, target: 2 },
    ])
  })

  it('is a no-op at the start of history', () => {
    const session = newSession(createGame(cast(['ALD'])))
    expect(canUndo(session)).toBe(false)
    expect(undo(session)).toEqual(session)
  })
})

describe('win conditions', () => {
  it('village wins when the last wolf dies', () => {
    let state = createGame(cast(['LOB', 'ALD', 'VID']))
    state = lynch(state, 0)
    expect(winner(state)).toBe('village')
  })

  it('wolves win once they equal the villagers', () => {
    let state = createGame(cast(['LOB', 'ALD', 'VID']))
    state = lynch(state, 1)
    expect(winner(state)).toBe('wolves')
  })

  it('lovers win together as the last two alive', () => {
    let state = startNight(createGame(cast(['CUP', 'LOB', 'ALD', 'VID'])))
    state = recordAction(state, { kind: 'pair', roleId: 'CUP', first: 1, second: 2 })
    state = recordAction(state, { kind: 'skip', roleId: 'LOB' })
    state = endNight(state)

    state = lynch(state, 0)
    state = lynch(state, 3)

    expect(state.players.filter((p) => p.alive).map((p) => p.id)).toEqual([1, 2])
    expect(winner(state)).toBe('lovers')
  })

  it('reports no winner while the game is live', () => {
    expect(winner(createGame(cast(['LOB', 'ALD', 'VID', 'PRO'])))).toBeNull()
  })
})

describe('the Cazador', () => {
  it('takes someone with him when lynched', () => {
    let state = createGame(cast(['CAZ', 'LOB', 'ALD', 'VID']))
    state = lynch(state, 0)
    expect(state.awaitingHunterShot).toBe(0)

    state = hunterShot(state, 1)
    expect(state.players[1]!.alive).toBe(false)
    expect(state.awaitingHunterShot).toBeNull()
  })
})

describe('a full multi-night game', () => {
  it('runs start to finish with no DOM and no strings', () => {
    // Deliberately gives two players the same name — the exact configuration
    // that silently corrupts v1.
    let state = createGame(
      cast(
        ['LOB', 'ALB', 'VID', 'PRO', 'BRU', 'PIR', 'ANC', 'ALD'],
        ['Ana', 'Beto', 'Ana', 'Dani', 'Eva', 'Fer', 'Gil', 'Hugo'],
      ),
    )

    // ---- Night 1: Pirómano acts (odd), albino does not ----
    state = startNight(state)
    expect(state.schedule).toEqual(['PRO', 'VID', 'PIR', 'LOB', 'BRU'])

    state = recordAction(state, { kind: 'target', roleId: 'PRO', actor: 3, target: 7 })
    state = recordAction(state, { kind: 'target', roleId: 'VID', actor: 2, target: 0 })
    state = recordAction(state, { kind: 'target', roleId: 'PIR', actor: 5, target: 7 })
    state = recordAction(state, { kind: 'target', roleId: 'LOB', actor: 0, target: 7 })
    state = recordAction(state, { kind: 'skip', roleId: 'BRU' })
    state = endNight(state)

    // Protected, so Hugo lives and the village is not told the wolves tried.
    expect(state.players[7]!.alive).toBe(true)
    expect(state.log.some((o) => o.type === 'attackBlocked' && !o.public)).toBe(true)
    expect(state.players[7]!.silencedOnDay).toBe(1)

    // ---- Day 1 ----
    state = lynch(state, 5)
    expect(state.players[5]!.alive).toBe(false)

    // ---- Night 2: albino acts (even), Pirómano is dead anyway ----
    state = startNight(state)
    expect(state.schedule).toEqual(['PRO', 'VID', 'LOB', 'ALB', 'BRU'])

    state = recordAction(state, { kind: 'target', roleId: 'PRO', actor: 3, target: 2 })
    state = recordAction(state, { kind: 'target', roleId: 'VID', actor: 2, target: 1 })
    state = recordAction(state, { kind: 'target', roleId: 'LOB', actor: 0, target: 6 })
    state = recordAction(state, { kind: 'target', roleId: 'ALB', actor: 1, target: 7 })
    state = recordAction(state, { kind: 'potion', roleId: 'BRU', target: 7, potion: 'heal' })
    state = endNight(state)

    // The Anciano survived his first attack; Hugo was healed by the witch.
    expect(state.players[6]!.alive).toBe(true)
    expect(state.players[6]!.wolfAttacksSurvivable).toBe(0)
    expect(state.players[7]!.alive).toBe(true)

    // The two players called "Ana" are still independent.
    const anas = state.players.filter((p) => p.name === 'Ana')
    expect(anas).toHaveLength(2)
    expect(anas.every((p) => p.alive)).toBe(true)

    // ---- Night 3: Pirómano gone, so no PIR step even though it is odd ----
    state = startNight(state)
    expect(state.schedule).toEqual(['PRO', 'VID', 'LOB', 'BRU'])

    expect(winner(state)).toBeNull()
    expect(state.log.length).toBeGreaterThan(0)
  })
})
