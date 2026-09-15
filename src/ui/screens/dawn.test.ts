import { describe, expect, it } from 'vitest'
import { dawnMarkup, dawnSlides, deathLines, pickLine, verdictSlides, winnerSlide } from './dawn'
import { LOCALES, strings } from '../../i18n'
import { quietGame } from '../../engine/testing'
import { castVote, endNight, lynch, recordAction, startNight, type PlayerSetup } from '../../engine/state'
import type { DeathCause, GameState, Outcome } from '../../engine/types'
import type { RoleId } from '../../engine/roles'

const cast = (roles: RoleId[], names?: string[]): PlayerSetup[] =>
  roles.map((roleId, i) => ({ name: names?.[i] ?? `P${i}`, roleId }))

const CAUSES: DeathCause[] = ['killers', 'rogue', 'poison', 'lynch', 'heartbreak', 'revenge']

/** One night: the Family kills Beto, the detective looks at Caro. */
const bloodyNight = (): GameState => {
  let state = quietGame(cast(['KILLER', 'PLAIN', 'INSPECT'], ['Ana', 'Beto', 'Caro']))
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
        expect(bank.length, `${locale}/${cause}`).toBeGreaterThanOrEqual(10)
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

  it('fits one phone screen under a name in Bebas, and never repeats itself', () => {
    // 24ch wide at the display size, five or six lines at most under the name.
    for (const locale of LOCALES) {
      for (const cause of CAUSES) {
        const bank = strings(locale).ui.dawn.death[cause]
        const rendered = bank.map((line) => line('Margarita'))
        for (const line of rendered) expect(line.length, `${locale}/${cause}: ${line}`).toBeLessThanOrEqual(140)
        expect(new Set(rendered).size).toBe(bank.length)
      }
    }
  })

  it('gives every death in a game its own line while the bank lasts', () => {
    // Three seats whose own picks all land on line 0 of a ten-line bank.
    const death = (night: number, target: number): Outcome => ({
      type: 'death', night, target, cause: 'killers', public: true,
    })
    const log = [death(1, 3), death(2, 6), death(3, 9)]
    const lines = deathLines(log, () => 10)
    expect([...lines.values()]).toEqual([0, 1, 2])
    // Undoing the last death does not move the earlier ones.
    expect([...deathLines(log.slice(0, 2), () => 10).values()]).toEqual([0, 1])
    // A different cause has its own count.
    const poison: Outcome = { type: 'death', night: 4, target: 0, cause: 'poison', public: true }
    expect(deathLines([...log, poison], () => 10).get(poison)).toBe(8)
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
    let state = quietGame(cast(['KILLER', 'INSPECT', 'GUARD'], ['Ana', 'Beto', 'Caro']))
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
    let state = quietGame(cast(['KILLER', 'PLAIN'], ['Ana', '<b>x</b>']))
    state = startNight(state)
    state = recordAction(state, { kind: 'target', roleId: 'KILLER', actor: 0, target: 1 })
    state = endNight(state)
    const html = dawnMarkup(dawnSlides(state, 'en'), 0, 1, 'en')
    expect(html).not.toContain('<b>x</b>')
    expect(html).toContain('&lt;b&gt;')
  })
})

describe('the town’s verdict', () => {
  const afterVote = (): GameState => lynch(bloodyNight(), 2)

  it('opens with the tally when votes were recorded, and keeps it out of the morning', () => {
    let state = bloodyNight()
    state = castVote(state, 0, 2)
    state = lynch(state, 2)
    expect(dawnSlides(state, 'en').map((s) => s.name)).toEqual(['Beto'])
    const verdict = verdictSlides(state, 'en')
    expect(verdict.map((s) => s.kind)).toEqual(['tally', 'death'])
    expect(verdict[0]!.line).toBe('The town voted: Caro 1.')
    expect(verdict[0]!.accent).toBe('town')
  })

  it('is read on its own, not folded into the morning', () => {
    const state = afterVote()
    const morning = dawnSlides(state, 'en')
    expect(morning).toHaveLength(1)
    expect(morning[0]!.name).toBe('Beto')

    const verdict = verdictSlides(state, 'en')
    expect(verdict).toHaveLength(1)
    expect(verdict[0]!.lethal).toBe(true)
    expect(verdict[0]!.name).toBe('Caro')
    expect(verdict[0]!.accent).toBe('town')
    expect(verdict[0]!.mark).toBe('⚖')
    expect(verdict[0]!.line).toContain('Caro')
  })

  it('is empty until the town has voted', () => {
    expect(verdictSlides(bloodyNight(), 'en')).toHaveLength(0)
  })

  it('carries its own heading over the counter', () => {
    const state = afterVote()
    for (const locale of LOCALES) {
      const html = dawnMarkup(verdictSlides(state, locale), 0, 1, locale, 'verdict')
      expect(html).toContain(strings(locale).ui.dawn.verdict(1))
      expect(html).not.toContain(strings(locale).ui.timeline.nightStart(1))
      expect(html).toContain('data-lethal')
    }
  })
})

describe('the slide a game ends on', () => {
  /** Hanging the only crew member: the town wins on the spot. */
  const townWin = (): GameState => {
    let state = quietGame(cast(['KILLER', 'PLAIN', 'PLAIN', 'PLAIN'], ['Ana', 'Beto', 'Caro', 'Dani']))
    state = startNight(state)
    state = { ...state, stepIndex: state.schedule.length }
    state = endNight(state)
    return lynch(state, 0)
  }

  it('is nothing at all while the game is still on', () => {
    // One crew against three citizens, nobody dead yet.
    const running = quietGame(cast(['KILLER', 'PLAIN', 'PLAIN', 'PLAIN'], ['Ana', 'Beto', 'Caro', 'Dani']))
    for (const locale of LOCALES) {
      expect(winnerSlide(running, locale), locale).toBeNull()
    }
  })

  it('carries the winner as its whole line, in both languages', () => {
    const state = townWin()
    for (const locale of LOCALES) {
      const slide = winnerSlide(state, locale)
      expect(slide, locale).not.toBeNull()
      expect(slide!.line, locale).toBe(strings(locale).winner.town)
      expect(slide!.kind, locale).toBe('winner')
      expect(slide!.accent, locale).toBe('town')
      // No victim, no mark: the sentence is the whole slide, and the ground
      // stays Midnight because a death is the only time red is a surface.
      expect(slide!.name, locale).toBeNull()
      expect(slide!.mark, locale).toBe('')
      expect(slide!.lethal, locale).toBe(false)
    }
  })

  it('takes the Family’s side when the Family wins', () => {
    // Two crew and two citizens left: the Family has parity.
    let state = quietGame(cast(['KILLER', 'KILLER', 'PLAIN', 'PLAIN', 'PLAIN'], ['Ana', 'Beto', 'Caro', 'Dani', 'Eva']))
    state = startNight(state)
    state = { ...state, stepIndex: state.schedule.indexOf('KILLER') }
    state = recordAction(state, { kind: 'target', roleId: 'KILLER', actor: 0, target: 4 })
    state = { ...state, stepIndex: state.schedule.length }
    state = endNight(state)
    const slide = winnerSlide(state, 'en')
    expect(slide?.accent).toBe('crew')
    expect(slide?.line).toBe(strings('en').winner.crew)
  })

  it('reads as the last slide of whichever reading was running', () => {
    const state = townWin()
    for (const locale of LOCALES) {
      const slides = [...verdictSlides(state, locale), winnerSlide(state, locale)!]
      const html = dawnMarkup(slides, slides.length - 1, 1, locale, 'verdict')
      expect(html, locale).toContain(strings(locale).winner.town)
      expect(html, locale).toContain('data-kind="winner"')
      // The last slide ends the reading rather than offering another.
      expect(html, locale).toContain('data-dawn-close')
      expect(html, locale).not.toContain('data-dawn-next"')
    }
  })
})

describe('a night nobody died in', () => {
  /** Nothing public except the paper's breadcrumb: the Bodyguard blocked the hit. */
  const rumourOnly = (): GameState => {
    let state = quietGame(cast(['KILLER', 'INSPECT', 'GUARD'], ['Ana', 'Beto', 'Caro']))
    state = startNight(state)
    state = recordAction(state, { kind: 'target', roleId: 'GUARD', actor: 2, target: 1 })
    state = recordAction(state, { kind: 'target', roleId: 'KILLER', actor: 0, target: 1 })
    state = endNight(state)
    // `quietGame`'s seed never rolls a clue, which is what makes it usable for
    // exact-report tests — so the breadcrumb is put there by hand.
    const clue: Outcome = { type: 'clue', night: state.night, trade: 0, clue: { kind: 'doors', doors: 2 }, public: true }
    return { ...state, log: [...state.log, clue] }
  }

  it('says nobody died first, even when the paper has a rumour to tell', () => {
    // The quiet slide used to appear only when there was nothing else at all,
    // so a breadcrumb suppressed the one fact the table is waiting for: the
    // room heard a rumour it never asked for and was never told everyone lived.
    const slides = dawnSlides(rumourOnly(), 'en')
    expect(slides[0]?.kind).toBe('quiet')
    expect(slides[0]?.line).toBe(strings('en').phase.quietNight)
    // …and the rumour is still read, after it.
    expect(slides.some((s) => s.kind === 'clue')).toBe(true)
    expect(slides.length).toBeGreaterThan(1)
  })

  it('does not say it on a night somebody died', () => {
    const slides = dawnSlides(bloodyNight(), 'en')
    expect(slides.some((s) => s.kind === 'quiet')).toBe(false)
  })
})
