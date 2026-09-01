import { describe, expect, it } from 'vitest'
import { growls } from './resolve'
import type { Player } from './types'
import type { RoleId } from './roles'

const seat = (id: number, roleId: RoleId, alive = true): Player => ({
  id,
  name: `P${id}`,
  roleId,
  alive,
  protectedTonight: false,
  protectedLastNight: false,
  wolfAttacksSurvivable: 0,
  loverOf: null,
  silencedOnDay: null,
  extraVotesOnDay: null,
  sect: null,
  fatherOf: null,
})

const circle = (roles: RoleId[], dead: number[] = []): Player[] =>
  roles.map((r, i) => seat(i, r, !dead.includes(i)))

describe("the Domador's growl", () => {
  it('growls when a wolf sits on his left', () => {
    expect(growls(circle(['LOB', 'DOM', 'ALD', 'VID']))).toBe(true)
  })

  it('growls when a wolf sits on his right', () => {
    expect(growls(circle(['DOM', 'LOB', 'ALD', 'VID']))).toBe(true)
  })

  it('growls across the wrap-around of the circle', () => {
    // The tamer is last in seating order, the wolf first — still neighbours.
    expect(growls(circle(['LOB', 'ALD', 'VID', 'DOM']))).toBe(true)
  })

  it('stays quiet when neither neighbour is a wolf', () => {
    expect(growls(circle(['ALD', 'DOM', 'VID', 'LOB']))).toBe(false)
  })

  it('closes the circle over the dead', () => {
    // The wolf is two seats away, but the player between them is dead, so the
    // survivors close up and they become neighbours.
    expect(growls(circle(['DOM', 'ALD', 'LOB', 'VID'], [1]))).toBe(true)
  })

  it('is silent with no tamer in the game', () => {
    expect(growls(circle(['LOB', 'ALD', 'VID']))).toBe(false)
  })

  it('is silent when the tamer is dead', () => {
    expect(growls(circle(['LOB', 'DOM', 'ALD'], [1]))).toBe(false)
  })
})
