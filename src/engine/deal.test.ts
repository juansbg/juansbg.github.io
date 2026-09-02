import { describe, expect, it } from 'vitest'
import { COMPLEXITIES, NOT_AUTO_DEALT, crewSize, dealRoles, shuffle, type Complexity } from './deal'
import { ROLES, isCrewRole, type RoleId } from './roles'

/** A small deterministic generator, so a failure is always reproducible. */
const seeded = (seed: number) => {
  let s = seed >>> 0
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 2 ** 32
  }
}

const crewOf = (roles: RoleId[]) => roles.filter(isCrewRole)
const townOf = (roles: RoleId[]) => roles.filter((r) => !isCrewRole(r))

describe('crew size', () => {
  it('is about a quarter of the table', () => {
    expect(crewSize(4)).toBe(1)
    expect(crewSize(6)).toBe(2)
    expect(crewSize(8)).toBe(2)
    expect(crewSize(12)).toBe(3)
    expect(crewSize(16)).toBe(4)
    expect(crewSize(20)).toBe(5)
  })

  it('never leaves a game without a killer', () => {
    for (let n = 1; n <= 20; n++) expect(crewSize(n)).toBeGreaterThanOrEqual(1)
  })

  it('never lets the crew reach half the table', () => {
    // At parity the crew has already won, so a deal must never start there.
    for (let n = 4; n <= 20; n++) expect(crewSize(n) * 2).toBeLessThan(n)
  })
})

describe('dealing', () => {
  it('gives every player exactly one role', () => {
    for (const complexity of COMPLEXITIES) {
      for (let n = 4; n <= 20; n++) {
        expect(dealRoles(n, complexity, seeded(n)).length, `${complexity}/${n}`).toBe(n)
      }
    }
  })

  it('always includes an investigator and a shield', () => {
    for (const complexity of COMPLEXITIES) {
      for (let n = 5; n <= 20; n++) {
        const roles = dealRoles(n, complexity, seeded(n * 7))
        expect(roles, `${complexity}/${n}`).toContain('INSPECT')
        expect(roles).toContain('GUARD')
      }
    }
  })

  it('keeps the crew outnumbered at the start', () => {
    for (const complexity of COMPLEXITIES) {
      for (let n = 4; n <= 20; n++) {
        const roles = dealRoles(n, complexity, seeded(n))
        expect(crewOf(roles).length * 2, `${complexity}/${n}`).toBeLessThan(n)
      }
    }
  })

  it('never repeats a town power role', () => {
    for (const complexity of COMPLEXITIES) {
      for (let n = 4; n <= 20; n++) {
        const powered = townOf(dealRoles(n, complexity, seeded(n + 3))).filter((r) => r !== 'PLAIN')
        expect(new Set(powered).size, `${complexity}/${n}`).toBe(powered.length)
      }
    }
  })

  it('leaves plain citizens on a simple table', () => {
    const roles = dealRoles(10, 'simple', seeded(1))
    expect(roles.filter((r) => r === 'PLAIN').length).toBeGreaterThan(0)
  })

  it('gives a complex table more variety than a simple one', () => {
    const simple = new Set(dealRoles(14, 'simple', seeded(9)))
    const complex = new Set(dealRoles(14, 'complex', seeded(9)))
    expect(complex.size).toBeGreaterThan(simple.size)
  })

  it('promotes a Godfather above simple level, and never below it', () => {
    expect(dealRoles(12, 'simple', seeded(4))).not.toContain('CONVERT')
    expect(dealRoles(12, 'standard', seeded(4))).toContain('CONVERT')
  })

  it('adds the Renegade only on big complex tables', () => {
    expect(dealRoles(12, 'complex', seeded(4))).toContain('ROGUE')
    expect(dealRoles(5, 'complex', seeded(4))).not.toContain('ROGUE')
  })

  it('varies between games at the same settings', () => {
    // Same table, different night: the line-up should not be identical.
    const a = dealRoles(12, 'complex', seeded(1)).join()
    const b = dealRoles(12, 'complex', seeded(2)).join()
    const c = dealRoles(12, 'complex', seeded(3)).join()
    expect(new Set([a, b, c]).size).toBeGreaterThan(1)
  })

  it('is reproducible for a given source', () => {
    expect(dealRoles(10, 'standard', seeded(42))).toEqual(dealRoles(10, 'standard', seeded(42)))
  })

  it('does not seat the crew in a predictable block', () => {
    // Roles are shuffled into seating order, so the killers must not always
    // land at the front — the Bloodhound's adjacency rule depends on it.
    const positions = new Set<number>()
    for (let seed = 1; seed <= 30; seed++) {
      dealRoles(10, 'standard', seeded(seed)).forEach((r, i) => {
        if (isCrewRole(r)) positions.add(i)
      })
    }
    expect(positions.size).toBeGreaterThan(4)
  })

  it('only deals roles the engine knows', () => {
    for (const complexity of COMPLEXITIES) {
      for (const role of dealRoles(16, complexity, seeded(5))) {
        expect(ROLES[role]).toBeDefined()
      }
    }
  })

  it('handles a table too small to be worth playing', () => {
    expect(dealRoles(0, 'standard', seeded(1))).toEqual([])
    expect(dealRoles(1, 'standard', seeded(1))).toHaveLength(1)
  })
})

describe('shuffle', () => {
  it('keeps every item', () => {
    const input = [1, 2, 3, 4, 5]
    expect(shuffle(input, seeded(7)).sort()).toEqual(input)
  })

  it('does not mutate its input', () => {
    const input = [1, 2, 3]
    shuffle(input, seeded(7))
    expect(input).toEqual([1, 2, 3])
  })
})

describe('complexity levels', () => {
  it('are ordered from fewest to most powers', () => {
    const counts = COMPLEXITIES.map(
      (c: Complexity) => new Set(dealRoles(16, c, seeded(11))).size,
    )
    expect(counts[0]!).toBeLessThanOrEqual(counts[1]!)
    expect(counts[1]!).toBeLessThanOrEqual(counts[2]!)
  })
})

describe('the dealer never hands out a role that does nothing', () => {
  // The real balance risk is not the crew ratio — it is dealing a role whose
  // mechanic the engine does not implement, which quietly costs that side a
  // player. Every role below is one the engine actually resolves.
  const WORKING: readonly RoleId[] = [
    'PLAIN',      // no ability by design
    'INSPECT',    // logged, secret
    'GUARD',      // blocks attacks
    'MEDIC',      // heal cancels a death, poison adds one
    'SURVIVE',    // survives the first attempt
    'SILENCE',    // silences for a day
    'EXTRA_VOTE', // adds a vote for a day
    'PAIR',       // lovers, with heartbreak
    'PROTEGE',    // joins the crew when the mentor dies
    'SENSE',      // growl, by seating adjacency
    'AVENGE',     // revenge shot on death
    'PEEK',       // narrator-facing only; needs no bookkeeping
    'MARTYR',     // wins if executed
    'KILLER',     // the nightly kill
    'CONVERT',    // converts instead of killing, once
    'ROGUE',      // kills anyone, own side included
    'SWAP',       // takes a spare card from the centre
  ]

  it('only deals roles the engine resolves', () => {
    for (const complexity of COMPLEXITIES) {
      for (let n = 4; n <= 20; n++) {
        for (let seed = 1; seed <= 25; seed++) {
          for (const role of dealRoles(n, complexity, seeded(seed * 13 + n))) {
            expect(WORKING, `${complexity}/${n}/${role}`).toContain(role)
          }
        }
      }
    }
  })

  it('excludes the unimplemented roles explicitly', () => {
    for (const complexity of COMPLEXITIES) {
      for (let n = 4; n <= 20; n++) {
        const roles = dealRoles(n, complexity, seeded(n * 3))
        for (const excluded of NOT_AUTO_DEALT) {
          expect(roles, `${complexity}/${n}`).not.toContain(excluded)
        }
      }
    }
  })

  it('keeps the excluded roles manually assignable', () => {
    // They are still real roles; the narrator can adjudicate them by hand.
    for (const id of NOT_AUTO_DEALT) expect(ROLES[id]).toBeDefined()
  })
})
