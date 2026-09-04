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
  hasQuestion: false,
  trade: null,
})

const circle = (roles: RoleId[], dead: number[] = []): Player[] =>
  roles.map((r, i) => seat(i, r, !dead.includes(i)))

describe("the Domador's growl", () => {
  it('growls when a wolf sits on his left', () => {
    expect(growls(circle(['KILLER', 'SENSE', 'PLAIN', 'INSPECT']))).toBe(true)
  })

  it('growls when a wolf sits on his right', () => {
    expect(growls(circle(['SENSE', 'KILLER', 'PLAIN', 'INSPECT']))).toBe(true)
  })

  it('growls across the wrap-around of the circle', () => {
    // The tamer is last in seating order, the wolf first — still neighbours.
    expect(growls(circle(['KILLER', 'PLAIN', 'INSPECT', 'SENSE']))).toBe(true)
  })

  it('stays quiet when neither neighbour is a wolf', () => {
    expect(growls(circle(['PLAIN', 'SENSE', 'INSPECT', 'KILLER']))).toBe(false)
  })

  it('closes the circle over the dead', () => {
    // The wolf is two seats away, but the player between them is dead, so the
    // survivors close up and they become neighbours.
    expect(growls(circle(['SENSE', 'PLAIN', 'KILLER', 'INSPECT'], [1]))).toBe(true)
  })

  it('is silent with no tamer in the game', () => {
    expect(growls(circle(['KILLER', 'PLAIN', 'INSPECT']))).toBe(false)
  })

  it('is silent when the tamer is dead', () => {
    expect(growls(circle(['KILLER', 'SENSE', 'PLAIN'], [1]))).toBe(false)
  })
})
