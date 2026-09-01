import { describe, expect, it } from 'vitest'
import { LOCALES, detectLocale, morningReport, renderOutcome, strings } from './index'
import { ROLE_IDS } from '../engine/roles'
import {
  createGame,
  endNight,
  recordAction,
  startNight,
  type PlayerSetup,
} from '../engine/state'
import type { DeathCause } from '../engine/types'

const setup = (roles: (typeof ROLE_IDS)[number][], names?: string[]): PlayerSetup[] =>
  roles.map((roleId, i) => ({ name: names?.[i] ?? `P${i}`, roleId }))

describe('string tables', () => {
  it('name every role in every language', () => {
    for (const locale of LOCALES) {
      const t = strings(locale)
      for (const id of ROLE_IDS) {
        expect(t.roles[id].name.length, `${locale}/${id} name`).toBeGreaterThan(0)
        expect(t.roles[id].prompt.length, `${locale}/${id} prompt`).toBeGreaterThan(0)
      }
    }
  })

  it('never leak an internal id into a display name', () => {
    for (const locale of LOCALES) {
      const t = strings(locale)
      for (const id of ROLE_IDS) {
        expect(t.roles[id].name).not.toContain(id)
      }
    }
  })

  it('give the two languages genuinely different role names', () => {
    // Guards against an untranslated table being copied across.
    const differing = ROLE_IDS.filter(
      (id) => strings('es').roles[id].name !== strings('en').roles[id].name,
    )
    expect(differing.length).toBeGreaterThan(ROLE_IDS.length / 2)
  })

  it('share one app name across languages', () => {
    expect(strings('es').appName).toBe('Omertà')
    expect(strings('en').appName).toBe('Omertà')
  })

  it('cover every death cause in both languages', () => {
    const causes: DeathCause[] = ['killers', 'rogue', 'poison', 'lynch', 'heartbreak', 'revenge']
    for (const locale of LOCALES) {
      for (const cause of causes) {
        const line = strings(locale).outcome.death('Ana', cause)
        expect(line, `${locale}/${cause}`).toContain('Ana')
      }
    }
  })
})

describe('detectLocale', () => {
  it('matches a regional tag to its base language', () => {
    expect(detectLocale(['en-GB', 'en'])).toBe('en')
    expect(detectLocale(['es-419'])).toBe('es')
  })

  it('falls back to Spanish for unsupported languages', () => {
    expect(detectLocale(['fr-FR', 'de'])).toBe('es')
    expect(detectLocale([])).toBe('es')
  })
})

describe('rendering the morning report', () => {
  const playedNight = () => {
    let state = createGame(
      setup(['KILLER', 'PLAIN', 'GUARD', 'INSPECT'], ['Ana', 'Beto', 'Caro', 'Ana']),
    )
    state = startNight(state)
    state = recordAction(state, { kind: 'target', roleId: 'GUARD', actor: 2, target: 2 })
    state = recordAction(state, { kind: 'target', roleId: 'INSPECT', actor: 3, target: 0 })
    state = recordAction(state, { kind: 'target', roleId: 'KILLER', actor: 0, target: 1 })
    return endNight(state)
  }

  it('reads the death aloud in each language', () => {
    const state = playedNight()

    expect(morningReport(state, 1, 'es')[0]).toBe('Ha amanecido muerto Beto.')
    expect(morningReport(state, 1, 'en')[0]).toBe('Beto was found dead this morning.')
  })

  it('keeps the detective’s look out of the report', () => {
    const state = playedNight()
    for (const locale of LOCALES) {
      const report = morningReport(state, 1, locale).join(' ')
      expect(report).not.toContain('Ana')
    }
  })

  it('never leaves a mixed-language log when the language changes', () => {
    // The whole log re-renders from structured outcomes, so nothing can be
    // stranded in the language it was recorded in.
    const state = playedNight()
    const spanish = morningReport(state, 1, 'es')
    const english = morningReport(state, 1, 'en')

    expect(spanish).toHaveLength(english.length)
    expect(spanish).not.toEqual(english)
  })

  it('says so when nothing public happened', () => {
    let state = createGame(setup(['KILLER', 'PLAIN', 'GUARD']))
    state = startNight(state)
    state = recordAction(state, { kind: 'target', roleId: 'GUARD', actor: 2, target: 1 })
    state = recordAction(state, { kind: 'target', roleId: 'KILLER', actor: 0, target: 1 })
    state = endNight(state)

    // The kill was blocked, and a blocked attack is secret.
    expect(morningReport(state, 1, 'es')).toEqual(['La noche ha pasado sin novedad.'])
    expect(morningReport(state, 1, 'en')).toEqual(['The night passed without incident.'])
  })

  it('returns null for outcomes the town never hears', () => {
    const state = playedNight()
    const secret = state.log.find((o) => o.type === 'inspected')!
    expect(renderOutcome(secret, state.players, 'es')).toBeNull()
  })

  it('uses the right name when two players share one', () => {
    const state = playedNight()
    // Players 0 and 3 are both "Ana"; the victim was Beto, id 1.
    expect(morningReport(state, 1, 'en')).toEqual(['Beto was found dead this morning.'])
  })
})

describe('role briefs', () => {
  it('exist for every role in every language', () => {
    for (const locale of LOCALES) {
      for (const id of ROLE_IDS) {
        expect(strings(locale).roles[id].brief.length, `${locale}/${id}`).toBeGreaterThan(20)
      }
    }
  })

  it('address the player directly, not the narrator', () => {
    // The prompt is written to the narrator ("They choose their victim"); the
    // brief is what the player reads on their own card and must speak to them.
    // Spanish carries person in the verb ending and drops the pronoun, so
    // this enumerates the second-person forms the briefs actually use. A new
    // brief with a new verb will fail here — add the form, or reword.
    const second = {
      es: /\bt[úu]\b|\bte\b|\btus?\b|\b(?:eliges|ganas|puedes|tienes|sobrevives|atas|divides|decides|mueras|proteges|prendes)\b/i,
      en: /\byou\b|\byour\b/i,
    }
    for (const locale of LOCALES) {
      for (const id of ROLE_IDS) {
        expect(strings(locale).roles[id].brief, `${locale}/${id}`).toMatch(second[locale])
      }
    }
  })

  it('are distinct from the narrator prompts', () => {
    for (const locale of LOCALES) {
      for (const id of ROLE_IDS) {
        expect(strings(locale).roles[id].brief).not.toBe(strings(locale).roles[id].prompt)
      }
    }
  })
})

describe('briefs are of similar length', () => {
  // A Citizen who finishes reading in two seconds while the Godfather is still
  // scrolling is a tell in itself. Everyone should look equally busy.
  it('gives no role a conspicuously short card', () => {
    for (const locale of LOCALES) {
      for (const id of ROLE_IDS) {
        expect(strings(locale).roles[id].brief.length, `${locale}/${id}`).toBeGreaterThanOrEqual(75)
      }
    }
  })

  it('keeps the longest within twice the shortest', () => {
    for (const locale of LOCALES) {
      const lengths = ROLE_IDS.map((id) => strings(locale).roles[id].brief.length)
      expect(Math.max(...lengths) / Math.min(...lengths), locale).toBeLessThanOrEqual(2)
    }
  })

  it('gives the plain Citizen a real card to read', () => {
    for (const locale of LOCALES) {
      expect(strings(locale).roles.PLAIN.brief.length, locale).toBeGreaterThanOrEqual(90)
    }
  })
})
