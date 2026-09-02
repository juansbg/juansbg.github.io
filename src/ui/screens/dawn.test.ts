import { describe, expect, it } from 'vitest'
import { dawnMarkup, dawnSlides, pickLine } from './dawn'
import { LOCALES, strings } from '../../i18n'
import { createGame, endNight, recordAction, startNight, type PlayerSetup } from '../../engine/state'
import type { DeathCause, GameState } from '../../engine/types'
import type { RoleId } from '../../engine/roles'

const cast = (roles: RoleId[], names?: string[]): PlayerSetup[] =>
  roles.map((roleId, i) => ({ name: names?.[i] ?? `P${i}`, roleId }))

const CAUSES: DeathCause[] = ['killers', 'rogue', 'poison', 'lynch', 'heartbreak', 'revenge']

/** One night: the Family kills Beto, the detective looks at Caro. */
const bloodyNight = (): GameState => {
  let state = createGame(cast(['KILLER', 'PLAIN', 'INSPECT'], ['Ana', 'Beto', 'Caro']))
  state = startNight(state)
  state = recordAction(state, { kind: 'target', roleId: 'INSPECT', actor: 2, target: 2 })
  state = recordAction(state, { kind: 'target', roleId: 'KILLER', actor: 0, target: 1 })
  return endNight(state)
}

describe('the bank of death lines', () => {
  it('names the victim in every line of every cause, in both languages', () => {
    for (const locale of LOCALES) {
      for (const cause of CAUSES) {
        const bank = strings(locale).ui.dawn.death[cause]
        expect(bank.length, `${locale}/${cause}`).toBeGreaterThanOrEqual(2)
        for (const line of bank) expect(line('Ana'), `${locale}/${cause}`).toContain('Ana')
      }
    }
  })

  it('keeps the newsprint voice: no exclamation marks', () => {
    for (const locale of LOCALES) {
      for (const cause of CAUSES) {
        for (const line of strings(locale).ui.dawn.death[cause]) {
          expect(line('Ana')).not.toMatch(/[!¡]/)
        }
      }
    }
  })

  it('picks deterministically and stays inside the bank', () => {
    expect(pickLine(1, 3, 3)).toBe(pickLine(1, 3, 3))
    for (let night = 1; night < 6; night++) {
      for (let seat = 0; seat < 12; seat++) {
        const i = pickLine(night, seat, 3)
        expect(i).toBeGreaterThanOrEqual(0)
        expect(i).toBeLessThan(3)
      }
    }
  })
})

describe('the dawn slides', () => {
  it('turns a killing into a lethal slide with the victim as the headline', () => {
    const slides = dawnSlides(bloodyNight(), 'en')
    expect(slides).toHaveLength(1)
    const slide = slides[0]!
    expect(slide.lethal).toBe(true)
    expect(slide.name).toBe('Beto')
    expect(slide.line).toContain('Beto')
    expect(slide.accent).toBe('crew')
    expect(slide.mark).toContain('data-sigil="KILLER"')
  })

  it('keeps the detective’s look out, like the report does', () => {
    const html = dawnMarkup(dawnSlides(bloodyNight(), 'en'), 0, 1, 'en')
    expect(html).not.toContain('Caro')
    expect(html).not.toContain('data-kind="inspected"')
  })

  it('shows one quiet slide when nothing public happened', () => {
    let state = createGame(cast(['KILLER', 'PLAIN', 'GUARD'], ['Ana', 'Beto', 'Caro']))
    state = startNight(state)
    state = recordAction(state, { kind: 'target', roleId: 'GUARD', actor: 2, target: 1 })
    state = recordAction(state, { kind: 'target', roleId: 'KILLER', actor: 0, target: 1 })
    state = endNight(state)
    const slides = dawnSlides(state, 'en')
    expect(slides).toHaveLength(1)
    expect(slides[0]!.lethal).toBe(false)
    expect(slides[0]!.line).toBe(strings('en').phase.quietNight)
    // A blocked attack is a secret; the slide must not hint at Beto.
    expect(dawnMarkup(slides, 0, 1, 'en')).not.toContain('Beto')
  })

  it('reads the same in either language for the same death', () => {
    const es = dawnSlides(bloodyNight(), 'es')[0]!
    const en = dawnSlides(bloodyNight(), 'en')[0]!
    expect(es.name).toBe(en.name)
    expect(es.lethal).toBe(en.lethal)
  })
})

describe('the dawn markup', () => {
  const slides = dawnSlides(bloodyNight(), 'en')

  it('marks a death as lethal and carries the side that caused it', () => {
    const html = dawnMarkup(slides, 0, 1, 'en')
    expect(html).toContain('data-lethal')
    expect(html).toContain('data-accent="crew"')
    expect(html).toContain('dawn__name">Beto<')
  })

  it('offers Done on the last slide and Next before it', () => {
    const two = [...slides, ...slides]
    expect(dawnMarkup(two, 0, 1, 'en')).toContain('data-dawn-next>')
    expect(dawnMarkup(two, 0, 1, 'en')).not.toContain('data-dawn-close')
    expect(dawnMarkup(two, 1, 1, 'en')).toContain('data-dawn-close')
  })

  it('escapes the name', () => {
    let state = createGame(cast(['KILLER', 'PLAIN'], ['Ana', '<b>x</b>']))
    state = startNight(state)
    state = recordAction(state, { kind: 'target', roleId: 'KILLER', actor: 0, target: 1 })
    state = endNight(state)
    const html = dawnMarkup(dawnSlides(state, 'en'), 0, 1, 'en')
    expect(html).not.toContain('<b>x</b>')
    expect(html).toContain('&lt;b&gt;')
  })
})
