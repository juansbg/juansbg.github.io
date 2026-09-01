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
  wolfAttacksSurvivable: roleId === 'ANC' ? 1 : 0,
  loverOf: null,
  silencedOnDay: null,
  extraVotesOnDay: null,
  sect: null,
  fatherOf: null,
})

const table = (roles: RoleId[]): Player[] => roles.map((r, i) => makePlayer(i, r))

describe('night timing rules from the narrator script', () => {
  it('prompts the Pirómano on odd nights only', () => {
    expect(actsOnNight(ROLES.PIR.activity, 1)).toBe(true)
    expect(actsOnNight(ROLES.PIR.activity, 2)).toBe(false)
    expect(actsOnNight(ROLES.PIR.activity, 3)).toBe(true)
  })

  it('prompts the albino wolf on even nights only', () => {
    expect(actsOnNight(ROLES.ALB.activity, 1)).toBe(false)
    expect(actsOnNight(ROLES.ALB.activity, 2)).toBe(true)
    expect(actsOnNight(ROLES.ALB.activity, 4)).toBe(true)
  })

  it('prompts the Actor for the first three nights only', () => {
    expect(actsOnNight(ROLES.ACT.activity, 3)).toBe(true)
    expect(actsOnNight(ROLES.ACT.activity, 4)).toBe(false)
  })

  it('prompts first-night roles once', () => {
    expect(actsOnNight(ROLES.CUP.activity, 1)).toBe(true)
    expect(actsOnNight(ROLES.CUP.activity, 2)).toBe(false)
  })

  it('never prompts passive roles', () => {
    for (const id of ['ALD', 'ANC', 'CAZ', 'DOM', 'NIA'] as const) {
      expect(actsOnNight(ROLES[id].activity, 1)).toBe(false)
    }
  })
})

describe('scheduleFor', () => {
  const cast: RoleId[] = ['NIN', 'CUP', 'PRO', 'VID', 'PIR', 'LOB', 'ALB', 'BRU', 'ALD']

  it('orders the first night as the narrator script reads', () => {
    expect(scheduleFor(table(cast), 1)).toEqual([
      'NIN', 'CUP', 'PRO', 'VID', 'PIR', 'LOB', 'BRU',
    ])
  })

  it('drops first-night roles and swaps Pirómano for the albino on night 2', () => {
    expect(scheduleFor(table(cast), 2)).toEqual(['PRO', 'VID', 'LOB', 'ALB', 'BRU'])
  })

  it('brings the Pirómano back on night 3', () => {
    expect(scheduleFor(table(cast), 3)).toEqual(['PRO', 'VID', 'PIR', 'LOB', 'BRU'])
  })

  it('omits roles whose only holder is dead', () => {
    const players = table(cast)
    const seer = players.find((p) => p.roleId === 'VID')!
    seer.alive = false
    expect(scheduleFor(players, 2)).not.toContain('VID')
  })

  it('keeps a role while any holder of it still lives', () => {
    const players = table(['LOB', 'LOB', 'VID'])
    players[0]!.alive = false
    expect(scheduleFor(players, 1)).toContain('LOB')
  })

  it('does not confuse two players who share a name', () => {
    // The v1 failure this engine exists to prevent: both players are called
    // "Ana", and killing one must not remove the other's role from the night.
    const players = table(['LOB', 'VID'])
    players[0]!.name = 'Ana'
    players[1]!.name = 'Ana'
    players[0]!.alive = false

    expect(scheduleFor(players, 1)).toEqual(['VID'])
    expect(players[1]!.alive).toBe(true)
  })
})
