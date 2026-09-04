import { describe, expect, it } from 'vitest'
import { balanceOf } from './balance'
import { COMPLEXITIES, crewSize } from './deal'

describe('the balance line', () => {
  it('says how many of the table the dealer makes Family', () => {
    for (const complexity of COMPLEXITIES) {
      for (const n of [5, 6, 8, 10, 12, 15]) {
        expect(balanceOf(n, complexity).crew, `${complexity}/${n}`).toBe(crewSize(n))
      }
    }
  })

  it('is the same answer every time it is asked', () => {
    const a = balanceOf(8, 'standard')
    const b = balanceOf(8, 'standard')
    expect(b).toBe(a)
    expect(a.townShare).toBeGreaterThanOrEqual(0)
    expect(a.townShare).toBeLessThanOrEqual(100)
  })

  it('calls a one-Family table of six the town’s, and a big advanced table the Family’s', () => {
    expect(balanceOf(6, 'standard').lean).toBe('town')
    expect(balanceOf(15, 'complex').lean).toBe('crew')
  })
})
