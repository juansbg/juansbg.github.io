import { describe, expect, it } from 'vitest'
import { ROLES, type RoleId } from '../engine/roles'
import { SIGILS, sigilMarkup } from './sigils'

const ids = Object.keys(ROLES) as RoleId[]

describe('role sigils', () => {
  it('give every role a drawing', () => {
    for (const id of ids) expect(SIGILS[id], id).toMatch(/^M/)
  })

  it('are straight lines only: no curves anywhere in the language', () => {
    // M, L, H, V and Z are the only commands; C, S, Q, T and A would be arcs
    // or Béziers, and a sigil with a curve breaks the sheet.
    for (const id of ids) expect(SIGILS[id], id).toMatch(/^[MLHVZ0-9 .\-]+$/)
  })

  it('stay inside the 24-unit grid', () => {
    for (const id of ids) {
      const numbers = SIGILS[id].match(/-?\d+(\.\d+)?/g) ?? []
      for (const n of numbers) {
        expect(Number(n), id).toBeGreaterThanOrEqual(0)
        expect(Number(n), id).toBeLessThanOrEqual(24)
      }
    }
  })

  it('render as decorative inline SVG tagged with the role', () => {
    const html = sigilMarkup('KILLER')
    expect(html).toContain('data-sigil="KILLER"')
    expect(html).toContain('aria-hidden="true"')
    expect(html).toContain('viewBox="0 0 24 24"')
    expect(html).toContain(SIGILS.KILLER)
  })
})
