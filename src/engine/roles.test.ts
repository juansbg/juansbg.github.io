import { describe, expect, it } from 'vitest'
import { ROLE_IDS, isRoleId } from './roles'

describe('role identifiers', () => {
  it('are unique', () => {
    expect(new Set(ROLE_IDS).size).toBe(ROLE_IDS.length)
  })

  it('are all three-letter uppercase acronyms', () => {
    for (const id of ROLE_IDS) expect(id).toMatch(/^[A-Z]{3}$/)
  })

  it('includes the roles the old trees were missing', () => {
    // Abominable Sectario is in the narrator script but was in neither
    // implementation; NIA is the little girl, distinct from NIN.
    expect(isRoleId('SEC')).toBe(true)
    expect(isRoleId('NIA')).toBe(true)
  })

  it('rejects unknown acronyms', () => {
    expect(isRoleId('XXX')).toBe(false)
  })
})
