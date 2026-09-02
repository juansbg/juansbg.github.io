import { describe, expect, it } from 'vitest'
import { ROLE_IDS, ROLES } from '../engine/roles'
import { accentOf, outcomeAccentOf } from './accent'

describe('accentOf', () => {
  it('maps every role to its team, or to occult', () => {
    for (const id of ROLE_IDS) {
      const accent = accentOf(id)
      if (accent === 'occult') {
        // Occult roles are still town: the hollow mark is a flavour, not a side.
        expect(ROLES[id].team).toBe('town')
      } else {
        expect(accent).toBe(ROLES[id].team)
      }
    }
  })

  it('never emits the system accent for a role', () => {
    for (const id of ROLE_IDS) expect(accentOf(id)).not.toBe('system')
  })
})

describe('outcomeAccentOf', () => {
  it('colours a crew killing as crew and a lynching as town', () => {
    expect(
      outcomeAccentOf({ type: 'death', night: 1, public: true, target: 1, cause: 'killers' }),
    ).toBe('crew')
    expect(
      outcomeAccentOf({ type: 'death', night: 1, public: true, target: 1, cause: 'lynch' }),
    ).toBe('town')
  })
})

