import { describe, expect, it } from 'vitest'
import { NIGHT_ROLES, ROLE_IDS, ROLES, isCrewRole, isRoleId } from './roles'

describe('role identifiers', () => {
  it('are unique', () => {
    expect(new Set(ROLE_IDS).size).toBe(ROLE_IDS.length)
  })

  it('describe function rather than theme', () => {
    // IDs must stay re-skinnable: nothing here may name a wolf, a mafioso, or
    // any other fiction. Display names belong in src/i18n/.
    for (const id of ROLE_IDS) expect(id).toMatch(/^[A-Z][A-Z_]*$/)
  })

  it('keys match their own definitions', () => {
    for (const id of ROLE_IDS) expect(ROLES[id].id).toBe(id)
  })

  it('rejects unknown ids', () => {
    expect(isRoleId('NOPE')).toBe(false)
    // The old werewolf acronyms are gone.
    expect(isRoleId('LOB')).toBe(false)
  })
})

describe('the role table', () => {
  it('puts every night role in a distinct script position', () => {
    const orders = NIGHT_ROLES.map((r) => r.order)
    expect(new Set(orders).size).toBe(orders.length)
    expect([...orders]).toEqual([...orders].sort((a, b) => a - b))
  })

  it('wakes the killers as a group and nobody else', () => {
    const grouped = ROLE_IDS.filter((id) => ROLES[id].wakesAsGroup)
    expect(grouped).toEqual(['KILLER'])
  })

  it('assigns exactly the killers’ side to the crew', () => {
    const crew = ROLE_IDS.filter(isCrewRole)
    expect(crew.sort()).toEqual(['CONVERT', 'KILLER', 'PICK_SIDE', 'ROGUE'])
  })

  it('excludes passive roles from the night schedule', () => {
    const nightIds = NIGHT_ROLES.map((r) => r.id)
    for (const id of ['PLAIN', 'SURVIVE', 'SENSE', 'AVENGE', 'PEEK', 'MARTYR'] as const) {
      expect(nightIds).not.toContain(id)
    }
  })

  it('flags the roles whose rules are convention rather than script', () => {
    const conventional = ROLE_IDS.filter((id) => ROLES[id].notInScript)
    expect(conventional.sort()).toEqual(['AVENGE', 'MARTYR', 'PEEK', 'PICK_SIDE'])
  })

  it('lets only the guard shield itself, and never twice running', () => {
    const guard = ROLES.GUARD.target
    expect(guard).toMatchObject({ mayTargetSelf: true, mayRepeatConsecutively: false })

    const inspect = ROLES.INSPECT.target
    expect(inspect).toMatchObject({ mayTargetSelf: false })
  })
})
