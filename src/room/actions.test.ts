import { describe, expect, it } from 'vitest'
import type { RoleId } from '../engine/roles'
import { currentStep, endNight, recordAction, startNight, type PlayerSetup } from '../engine/state'
import { quietGame } from '../engine/testing'
import type { GameState } from '../engine/types'
import { acceptAction, acceptMark, actsAt, eligibleAt } from './actions'

const cast = (roles: RoleId[]): PlayerSetup[] => roles.map((roleId, i) => ({ name: `P${i}`, roleId }))

/** Seats: 0 Godfather, 1 Family, 2 Detective, 3 Bodyguard, 4 Apothecary, 5 and 6 citizens, 7 the Binding. */
const table = (): GameState =>
  startNight(quietGame(cast(['CONVERT', 'KILLER', 'INSPECT', 'GUARD', 'MEDIC', 'PLAIN', 'PLAIN', 'PAIR'])))

/** Walks the night to the step named, skipping everything before it. */
const at = (state: GameState, step: RoleId): GameState => {
  let s = state
  while (currentStep(s) !== null && currentStep(s) !== step) {
    s = recordAction(s, { kind: 'skip', roleId: currentStep(s) as RoleId })
  }
  expect(currentStep(s)).toBe(step)
  return s
}

describe('who acts at a step', () => {
  it('is the holder of the role, or anyone who wakes with the Family at its step', () => {
    const s = table()
    const [godfather, family, detective, , , citizen] = s.players
    expect(actsAt(detective!, 'INSPECT')).toBe(true)
    expect(actsAt(citizen!, 'INSPECT')).toBe(false)
    expect(actsAt(family!, 'KILLER')).toBe(true)
    expect(actsAt(godfather!, 'KILLER')).toBe(true)
    expect(actsAt(citizen!, 'KILLER')).toBe(false)
    expect(actsAt({ ...detective!, alive: false }, 'INSPECT')).toBe(false)
    expect(actsAt(detective!, null)).toBe(false)
  })

  it('an Associate who has not chosen does not wake with the Family', () => {
    const s = startNight(quietGame(cast(['KILLER', 'PICK_SIDE', 'PLAIN', 'PLAIN', 'PLAIN'])))
    expect(actsAt(s.players[1]!, 'KILLER')).toBe(false)
    expect(actsAt(s.players[1]!, 'PICK_SIDE')).toBe(true)
  })

  it('offers the engine’s targets, and nobody for a step with no target', () => {
    const s = at(table(), 'KILLER')
    // The Family never picks its own.
    expect(eligibleAt(s, 'KILLER')).toEqual([2, 3, 4, 5, 6, 7])
    expect(eligibleAt(s, 'CONVERT')).toEqual([])
  })
})

describe('a night action from a phone', () => {
  it('is refused from a seat that is not acting, and accepted from the one that is', () => {
    const s = table()
    expect(currentStep(s)).toBe('PAIR')
    expect(acceptAction(s, 3, { kind: 'pair', first: 0, second: 1 })).toBeNull()
    expect(acceptAction(s, 7, { kind: 'pair', first: 0, second: 1 })).toEqual({ kind: 'pair', roleId: 'PAIR', first: 0, second: 1 })
    expect(acceptAction(s, 7, { kind: 'pair', first: 1, second: 1 })).toBeNull()
    // The wrong shape for the step.
    expect(acceptAction(s, 7, { kind: 'target', target: 1 })).toBeNull()
  })

  it('lets any Family phone name the hit, never one of the Family', () => {
    const s = at(table(), 'KILLER')
    expect(acceptAction(s, 0, { kind: 'target', target: 5 })).toEqual({ kind: 'target', roleId: 'KILLER', actor: 0, target: 5 })
    expect(acceptAction(s, 1, { kind: 'target', target: 5 })).toEqual({ kind: 'target', roleId: 'KILLER', actor: 1, target: 5 })
    expect(acceptAction(s, 1, { kind: 'target', target: 0 })).toBeNull()
    expect(acceptAction(s, 5, { kind: 'target', target: 6 })).toBeNull()
    expect(acceptAction(s, 1, { kind: 'target', target: 99 })).toBeNull()
    expect(acceptAction(s, 1, { kind: 'skip' })).toEqual({ kind: 'skip', roleId: 'KILLER' })
  })

  it('takes the Family’s mark from a Family phone only, at a step that picks one seat', () => {
    const s = at(table(), 'KILLER')
    expect(acceptMark(s, 0, 5)).toEqual([5])
    expect(acceptMark(s, 1, null)).toEqual([])
    expect(acceptMark(s, 1, 0)).toBeNull()
    expect(acceptMark(s, 5, 6)).toBeNull()
    expect(acceptMark(at(table(), 'PAIR'), 7, 0)).toBeNull()
  })

  it('lets the Godfather take the victim in only while there is one and a conversion left', () => {
    const none = at(table(), 'CONVERT')
    expect(acceptAction(none, 0, { kind: 'confirm' })).toBeNull()
    expect(acceptAction(none, 0, { kind: 'skip' })).toEqual({ kind: 'skip', roleId: 'CONVERT' })

    let hit = at(table(), 'KILLER')
    hit = recordAction(hit, { kind: 'target', roleId: 'KILLER', actor: 1, target: 5 })
    expect(currentStep(hit)).toBe('CONVERT')
    expect(acceptAction(hit, 0, { kind: 'confirm' })).toEqual({ kind: 'confirm', roleId: 'CONVERT' })
    expect(acceptAction(hit, 1, { kind: 'confirm' })).toBeNull()
    expect(acceptAction({ ...hit, infectionUsed: true }, 0, { kind: 'confirm' })).toBeNull()
  })

  it('pours the cure only on the doomed and each vial only once', () => {
    let s = at(table(), 'KILLER')
    s = recordAction(s, { kind: 'target', roleId: 'KILLER', actor: 1, target: 5 })
    s = recordAction(s, { kind: 'skip', roleId: 'CONVERT' })
    expect(currentStep(s)).toBe('MEDIC')
    expect(acceptAction(s, 4, { kind: 'potion', target: 5, potion: 'heal' })).toEqual({ kind: 'potion', roleId: 'MEDIC', target: 5, potion: 'heal' })
    expect(acceptAction(s, 4, { kind: 'potion', target: 6, potion: 'heal' })).toBeNull()
    expect(acceptAction(s, 4, { kind: 'potion', target: 6, potion: 'kill' })).toEqual({ kind: 'potion', roleId: 'MEDIC', target: 6, potion: 'kill' })
    expect(acceptAction({ ...s, healUsed: true }, 4, { kind: 'potion', target: 5, potion: 'heal' })).toBeNull()
    expect(acceptAction({ ...s, poisonUsed: true }, 4, { kind: 'potion', target: 6, potion: 'kill' })).toBeNull()
    expect(acceptAction(s, 3, { kind: 'potion', target: 5, potion: 'heal' })).toBeNull()
    expect(acceptAction(s, 4, { kind: 'skip' })).toEqual({ kind: 'skip', roleId: 'MEDIC' })
  })

  it('makes the Associate choose a side, and only a side', () => {
    const s = startNight(quietGame(cast(['KILLER', 'PICK_SIDE', 'PLAIN', 'PLAIN', 'PLAIN'])))
    expect(currentStep(s)).toBe('PICK_SIDE')
    expect(acceptAction(s, 1, { kind: 'chooseRole', newRole: 'KILLER' })).toEqual({ kind: 'chooseRole', roleId: 'PICK_SIDE', newRole: 'KILLER' })
    expect(acceptAction(s, 1, { kind: 'chooseRole', newRole: 'PLAIN' })).toEqual({ kind: 'chooseRole', roleId: 'PICK_SIDE', newRole: 'PLAIN' })
    expect(acceptAction(s, 1, { kind: 'chooseRole', newRole: 'INSPECT' })).toBeNull()
    expect(acceptAction(s, 1, { kind: 'skip' })).toBeNull()
    expect(acceptAction(s, 0, { kind: 'chooseRole', newRole: 'KILLER' })).toBeNull()
  })

  it('lets the Chameleon take a card from the centre only', () => {
    const s = at(startNight(quietGame(cast(['KILLER', 'SWAP', 'INSPECT', 'PLAIN', 'PLAIN']))), 'SWAP')
    expect(acceptAction(s, 1, { kind: 'chooseRole', newRole: 'GUARD' })).toEqual({ kind: 'chooseRole', roleId: 'SWAP', newRole: 'GUARD' })
    expect(acceptAction(s, 1, { kind: 'chooseRole', newRole: 'INSPECT' })).toBeNull()
    expect(acceptAction(s, 1, { kind: 'chooseRole', newRole: 'PLAIN' })).toBeNull()
    expect(acceptAction(s, 1, { kind: 'skip' })).toEqual({ kind: 'skip', roleId: 'SWAP' })
  })

  it('records the Cultist’s split only with someone on both sides', () => {
    const s = startNight(quietGame(cast(['KILLER', 'SPLIT', 'PLAIN', 'PLAIN', 'PLAIN'])))
    expect(currentStep(s)).toBe('SPLIT')
    expect(acceptAction(s, 1, { kind: 'split', sectOne: [0, 2] })).toEqual({ kind: 'split', roleId: 'SPLIT', sectOne: [0, 2], sectTwo: [1, 3, 4] })
    expect(acceptAction(s, 1, { kind: 'split', sectOne: [] })).toBeNull()
    expect(acceptAction(s, 1, { kind: 'split', sectOne: [0, 1, 2, 3, 4] })).toBeNull()
    expect(acceptAction(s, 1, { kind: 'split', sectOne: [0, 0] })).toBeNull()
    expect(acceptAction(s, 1, { kind: 'split', sectOne: [0, 42] })).toBeNull()
  })

  it('accepts nothing by day', () => {
    let s = table()
    while (currentStep(s) !== null) s = recordAction(s, { kind: 'skip', roleId: currentStep(s) as RoleId })
    s = endNight(s)
    expect(acceptAction(s, 2, { kind: 'target', target: 0 })).toBeNull()
    expect(acceptMark(s, 1, 2)).toBeNull()
  })
})
