import { describe, expect, it } from 'vitest'
import { ROLE_IDS, ROLES } from '../engine/roles'
import { accentOf, monogram, outcomeAccentOf } from './accent'
import { strings } from '../i18n'

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

describe('monogram', () => {
  it('drops the article and keeps two letters, in either language', () => {
    expect(monogram('The Family')).toBe('FA')
    expect(monogram('La Familia')).toBe('FA')
    expect(monogram('El Sabueso')).toBe('SA')
    expect(monogram('The Bloodhound')).toBe('BL')
  })

  it('produces two characters for every role name in both languages', () => {
    for (const locale of ['es', 'en'] as const) {
      for (const id of ROLE_IDS) {
        expect(monogram(strings(locale).roles[id].name)).toHaveLength(2)
      }
    }
  })
})
