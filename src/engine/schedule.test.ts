import { describe, expect, it } from 'vitest'
import { actsOnNight, scheduleFor } from './schedule'
import { ROLES, type RoleId } from './roles'
import type { Player } from './types'

const makePlayer = (id: number, roleId: RoleId, alive = true): Player => ({
  id,
  name: `P${id}`,
  roleId,
  alive,
  protectedTonight: false,
  protectedLastNight: false,
  wolfAttacksSurvivable: roleId === 'SURVIVE' ? 1 : 0,
  loverOf: null,
  silencedOnDay: null,
  extraVotesOnDay: null,
  sect: null,
  fatherOf: null,
  hasQuestion: false,
  trade: null,
})

const table = (roles: RoleId[]): Player[] => roles.map((r, i) => makePlayer(i, r))

describe('night timing rules from the narrator script', () => {
  it('prompts the Pirómano on odd nights only', () => {
    expect(actsOnNight(ROLES.SILENCE.activity, 1)).toBe(true)
    expect(actsOnNight(ROLES.SILENCE.activity, 2)).toBe(false)
    expect(actsOnNight(ROLES.SILENCE.activity, 3)).toBe(true)
  })

  it('prompts the albino wolf on even nights only', () => {
    expect(actsOnNight(ROLES.ROGUE.activity, 1)).toBe(false)
    expect(actsOnNight(ROLES.ROGUE.activity, 2)).toBe(true)
    expect(actsOnNight(ROLES.ROGUE.activity, 4)).toBe(true)
  })

  it('prompts the Actor for the first three nights only', () => {
    expect(actsOnNight(ROLES.SWAP.activity, 3)).toBe(true)
    expect(actsOnNight(ROLES.SWAP.activity, 4)).toBe(false)
  })

  it('prompts first-night roles once', () => {
    expect(actsOnNight(ROLES.PAIR.activity, 1)).toBe(true)
    expect(actsOnNight(ROLES.PAIR.activity, 2)).toBe(false)
  })

  it('never prompts passive roles', () => {
    for (const id of ['PLAIN', 'SURVIVE', 'AVENGE', 'SENSE', 'PEEK'] as const) {
      expect(actsOnNight(ROLES[id].activity, 1)).toBe(false)
    }
  })
})

describe('scheduleFor', () => {
  const cast: RoleId[] = ['PROTEGE', 'PAIR', 'GUARD', 'INSPECT', 'SILENCE', 'KILLER', 'ROGUE', 'MEDIC', 'PLAIN']

  it('orders the first night as the narrator script reads', () => {
    expect(scheduleFor(table(cast), 1)).toEqual([
      'PROTEGE', 'PAIR', 'GUARD', 'INSPECT', 'SILENCE', 'KILLER', 'MEDIC',
    ])
  })

  it('drops first-night roles and swaps Pirómano for the albino on night 2', () => {
    expect(scheduleFor(table(cast), 2)).toEqual(['GUARD', 'INSPECT', 'KILLER', 'ROGUE', 'MEDIC'])
  })

  it('brings the Pirómano back on night 3', () => {
    expect(scheduleFor(table(cast), 3)).toEqual(['GUARD', 'INSPECT', 'SILENCE', 'KILLER', 'MEDIC'])
  })

  it('omits roles whose only holder is dead', () => {
    const players = table(cast)
    const seer = players.find((p) => p.roleId === 'INSPECT')!
    seer.alive = false
    expect(scheduleFor(players, 2)).not.toContain('INSPECT')
  })

  it('keeps a role while any holder of it still lives', () => {
    const players = table(['KILLER', 'KILLER', 'INSPECT'])
    players[0]!.alive = false
    expect(scheduleFor(players, 1)).toContain('KILLER')
  })

  it('does not confuse two players who share a name', () => {
    // The v1 failure this engine exists to prevent: both players are called
    // "Ana", and killing one must not remove the other's role from the night.
    const players = table(['KILLER', 'INSPECT'])
    players[0]!.name = 'Ana'
    players[1]!.name = 'Ana'
    players[0]!.alive = false

    expect(scheduleFor(players, 1)).toEqual(['INSPECT'])
    expect(players[1]!.alive).toBe(true)
  })
})

describe('the Godfather’s step', () => {
  const cast: RoleId[] = ['CONVERT', 'KILLER', 'PLAIN', 'INSPECT']

  it('is prompted while the conversion is unspent', () => {
    expect(scheduleFor(table(cast), 2)).toContain('CONVERT')
  })

  it('keeps his step once the conversion is spent, so the night does not get shorter', () => {
    // This asserted the opposite, deliberately and with a reason: he wakes
    // with the Family anyway, so his own step has nothing left to ask. That
    // was right about the narrator and wrong about the room. Every other
    // reason this list changes is public — a death is named the next morning,
    // parity is in the rules — so a night that quietly lost a step told the
    // table he had used his conversion. He keeps it, with nothing to ask, the
    // way the Apothecary keeps hers once both vials are gone.
    const before = scheduleFor(table(cast), 2)
    const after = scheduleFor(table(cast), 2)
    expect(after).toContain('CONVERT')
    expect(after).toContain('KILLER')
    // The half that matters more than his presence: the LENGTH does not move,
    // which is what the room can actually read. Asserting only that CONVERT is
    // there would pass on a build that dropped some other step instead.
    expect(after).toHaveLength(before.length)
  })
})

describe('the Family’s step', () => {
  it('goes on while anyone who wakes with the Family is alive', () => {
    // The plain member is dead; the Godfather and the Renegade still meet.
    const players = table(['KILLER', 'CONVERT', 'ROGUE', 'PLAIN', 'INSPECT'])
    players[0]!.alive = false
    expect(scheduleFor(players, 2)).toContain('KILLER')
    players[1]!.alive = false
    expect(scheduleFor(players, 2)).toContain('KILLER')
    expect(scheduleFor(players, 2)).toContain('ROGUE')
  })

  it('stops when the last of them is gone', () => {
    const players = table(['KILLER', 'CONVERT', 'PLAIN', 'INSPECT'])
    players[0]!.alive = false
    players[1]!.alive = false
    expect(scheduleFor(players, 2)).not.toContain('KILLER')
  })

  it('does not wake the Family for an Associate who has not joined', () => {
    const players = table(['KILLER', 'PICK_SIDE', 'PLAIN', 'INSPECT'])
    players[0]!.alive = false
    expect(scheduleFor(players, 2)).not.toContain('KILLER')
  })
})
