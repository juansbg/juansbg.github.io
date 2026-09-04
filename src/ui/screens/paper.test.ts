import { describe, expect, it } from 'vitest'
import { paperMarkup, paperOf } from './paper'
import { quietGame } from '../../engine/testing'
import { endNight, lynch, recordAction, startNight, type PlayerSetup } from '../../engine/state'
import { LOCALES, strings } from '../../i18n'
import type { GameState, NightAction } from '../../engine/types'
import type { RoleId } from '../../engine/roles'

const setup = (roles: RoleId[], names: string[]): PlayerSetup[] =>
  roles.map((roleId, i) => ({ name: names[i] ?? `P${i}`, roleId }))

/** Two nights: the Family kills Beto, the town hangs Ana, the Family kills Caro. */
const played = (): GameState => {
  let s = startNight(quietGame(setup(['KILLER', 'PLAIN', 'INSPECT', 'PLAIN', 'PLAIN'], ['Ana', 'Beto', 'Caro', 'Dani', 'Elena'])))
  const hit = (target: number): NightAction => ({ kind: 'target', roleId: 'KILLER', actor: 0, target })
  s = { ...s, stepIndex: s.schedule.indexOf('KILLER') }
  s = recordAction(s, hit(1))
  s = { ...s, stepIndex: s.schedule.length }
  s = endNight(s)
  s = lynch(s, 3)
  s = startNight(s)
  s = { ...s, stepIndex: s.schedule.indexOf('KILLER') }
  s = recordAction(s, hit(2))
  s = { ...s, stepIndex: s.schedule.length }
  return endNight(s)
}

describe('the morning paper', () => {
  it.each(LOCALES)('sets every death as a headline with the line it was read at dawn (%s)', (locale) => {
    const state = played()
    const paper = paperOf(state, locale)
    expect(paper.stories.map((s) => s.name)).toEqual(['Beto', 'Dani', 'Caro'])
    expect(paper.stories.map((s) => s.night)).toEqual([1, 1, 2])
    for (const story of paper.stories) {
      expect(story.line).toContain(story.name)
      expect(story.line.length).toBeGreaterThan(story.name.length)
    }
    // Two Family kills get two different sentences.
    expect(paper.stories[0]?.line).not.toBe(paper.stories[2]?.line)
  })

  it('names who was who, marking the Family and the dead', () => {
    const paper = paperOf(played(), 'en')
    expect(paper.cast.map((c) => c.name)).toEqual(['Ana', 'Beto', 'Caro', 'Dani', 'Elena'])
    expect(paper.cast.find((c) => c.name === 'Ana')).toMatchObject({ crew: true, alive: true, role: strings('en').roles.KILLER.name })
    expect(paper.cast.find((c) => c.name === 'Beto')).toMatchObject({ crew: false, alive: false })
  })

  it('keeps the record night by night, and the winner as the banner', () => {
    const state = played()
    const paper = paperOf(state, 'en')
    expect(paper.record.map((n) => n.title)).toEqual(['Night 1', 'Night 2'])
    expect(paper.record[0]?.lines).toHaveLength(2)
    // Ana and Elena are left: the Family has parity.
    expect(paper.banner).toBe(strings('en').winner.crew)
    // A game ended early has no winner and says so.
    const open = { ...state, players: state.players.map((p) => (p.id === 2 ? { ...p, alive: true } : p)) }
    expect(paperOf(open, 'en').banner).toBe(strings('en').ui.over.title)
    // A wipe-out — nobody left — is still a page, with everyone struck.
    const wiped = { ...state, players: state.players.map((p) => ({ ...p, alive: false })) }
    expect(paperOf(wiped, 'en').cast.every((c) => !c.alive)).toBe(true)
    expect(paperMarkup(wiped, 'en')).toContain('data-paper')
  })

  it.each(LOCALES)('renders as a page with no role of a living player hidden, and no ids (%s)', (locale) => {
    const html = paperMarkup(played(), locale)
    const t = strings(locale)
    expect(html).toContain('data-paper')
    expect(html).toContain(t.ui.paper.whoWasWho)
    expect(html).toContain(t.roles.KILLER.name)
    expect(html).toContain('data-crew')
    expect(html).toContain('data-dead')
    expect(html).not.toContain('KILLER')
    expect(html).toContain('Beto')
  })
})

// ---------------------------------------------------------------------------
// The daily edition
// ---------------------------------------------------------------------------

import { ROLE_IDS } from '../../engine/roles'
import { castVote } from '../../engine/state'
import { edition, editionOf, editionMarkup, dailyMarkup, revealedBy, type Article } from './paper'
import type { Outcome } from '../../engine/types'

/** The trades the design lists, until the string tables carry them. */
const TRADES: Record<string, string[]> = {
  en: ['baker', 'tailor', 'butcher', 'barber', 'florist', 'fishmonger', 'cobbler', 'blacksmith', 'innkeeper', 'grocer', 'milkman', 'postman', 'schoolteacher', 'nurse', 'priest', 'gravedigger', 'locksmith', 'watchmaker', 'printer', 'pianist', 'seamstress', 'chimney sweep', 'carpenter', 'tobacconist'],
  es: ['panadero', 'sastre', 'carnicero', 'barbero', 'florista', 'pescadero', 'zapatero', 'herrero', 'posadero', 'tendero', 'lechero', 'cartero', 'maestro', 'enfermera', 'cura', 'sepulturero', 'cerrajero', 'relojero', 'impresor', 'pianista', 'costurera', 'deshollinador', 'carpintero', 'estanquero'],
}

/** A role's name without its article, so "The Family" is caught as "Family". */
const bare = (name: string): string => name.replace(/^(The|El|La) /, '')

const kinds = (e: ReturnType<typeof edition>): Article['kind'][] =>
  [e.lead, ...e.rest].filter((a): a is Article => a !== null).map((a) => a.kind)

/** Night one: the Family kills Beto and the Arsonist burns Dani's house. Day one: the town hangs Ana on a recorded vote. */
const loudNight = (): GameState => {
  let s = quietGame(setup(['KILLER', 'PLAIN', 'INSPECT', 'PLAIN', 'SILENCE', 'PLAIN'], ['Ana', 'Beto', 'Caro', 'Dani', 'Elena', 'Fer']))
  s = startNight(s)
  s = { ...s, stepIndex: s.schedule.indexOf('SILENCE') }
  s = recordAction(s, { kind: 'target', roleId: 'SILENCE', actor: 4, target: 3 })
  s = { ...s, stepIndex: s.schedule.indexOf('KILLER') }
  s = recordAction(s, { kind: 'target', roleId: 'KILLER', actor: 0, target: 1 })
  s = { ...s, stepIndex: s.schedule.length }
  return endNight(s)
}

describe('the daily edition', () => {
  it.each(LOCALES)('leads with the night’s death, then the fire, then colour (%s)', (locale) => {
    const state = loudNight()
    const e = edition(state, 1, locale)
    const t = strings(locale)
    expect(e.day).toBe(1)
    expect(e.dateline).toBe(t.ui.paper.daily(1))
    expect(kinds(e)).toEqual(['death', 'event', 'colour', 'colour'])
    expect(e.lead?.headline).toBe(t.ui.paper.headline.killers('Beto'))
    // The dek is the very line the town was read at dawn.
    expect(e.lead?.dek).toContain('Beto')
    expect(e.lead?.dek.length).toBeGreaterThan(20)
    expect(e.rest[0]?.headline).toBe(t.ui.paper.event.silenced('Dani'))
    expect(e.rest[0]?.dek).toBe(t.outcome.silenced('Dani'))
  })

  it('sets the verdict with its count once the town has voted', () => {
    let state = loudNight()
    // Dani is silenced today and cannot vote.
    state = castVote(state, 2, 0)
    state = castVote(state, 5, 0)
    state = castVote(state, 0, 2)
    state = lynch(state, 0)
    const e = edition(state, 1, 'en')
    expect(kinds(e)).toEqual(['death', 'verdict', 'event', 'colour', 'colour'])
    const verdict = e.rest[0]
    expect(verdict?.headline).toBe(strings('en').ui.paper.headline.lynch('Ana'))
    expect(verdict?.note).toContain('Ana 2')
    expect(verdict?.note).toContain('Caro 1')
    // Without a recorded vote there is no count to print.
    const silent = lynch(loudNight(), 0)
    expect(edition(silent, 1, 'en').rest[0]?.note).toBeNull()
  })

  it.each(LOCALES)('names the dead for what they were one day late, and never earlier or later (%s)', (locale) => {
    let state = lynch(loudNight(), 0)
    const t = strings(locale)
    // Day one: two dead, nobody revealed.
    expect(revealedBy(state)).toEqual([])
    expect(kinds(edition(state, 1, locale))).not.toContain('investigation')
    // Day two: both are named, in seat order, the citizen with the trade.
    state = endNight({ ...startNight(state), stepIndex: 99 })
    const beto = state.players[1]!
    expect(revealedBy(state)).toEqual([
      { id: 0, roleId: 'KILLER', trade: null },
      { id: 1, roleId: 'PLAIN', trade: beto.trade },
    ])
    const e = edition(state, 2, locale)
    const found = [e.lead, ...e.rest].filter((a): a is Article => a?.kind === 'investigation')
    expect(found).toHaveLength(2)
    expect(found[0]?.headline).toContain('Ana')
    expect(found[0]?.dek).toContain(t.roles.KILLER.name)
    expect(found[0]?.note).toBe(t.ui.paper.side.crew)
    expect(found[1]?.headline).toContain('Beto')
    expect(found[1]?.dek).toContain(t.roles.PLAIN.name)
    expect(found[1]?.dek).toContain(t.tradesNamed[beto.trade ?? -1] ?? 'no trade')
    expect(found[1]?.note).toBe(t.ui.paper.side.town)
    // Day three: the dead stay revealed for the room, but the paper has moved on.
    state = endNight({ ...startNight(state), stepIndex: 99 })
    expect(revealedBy(state)).toHaveLength(2)
    expect(kinds(edition(state, 3, locale))).not.toContain('investigation')
  })

  it.each(LOCALES)('never prints the role of anyone the rule has not revealed (%s)', (locale) => {
    let state = lynch(loudNight(), 0)
    state = endNight({ ...startNight(state), stepIndex: 99 })
    const t = strings(locale)
    const html = editionMarkup(edition(state, 2, locale), locale)
    // Beto and Ana are named; the living hold a Detective and an Arsonist and two citizens.
    expect(html).toContain(t.roles.KILLER.name)
    expect(html).not.toContain(t.roles.INSPECT.name)
    expect(html).not.toContain(t.roles.SILENCE.name)
    for (const id of ROLE_IDS) expect(html).not.toContain(`"${id}"`)
    // Day one carries nobody's role at all; the Family is named only as the
    // cause of the hit, which the dawn line already told the town.
    const first = editionMarkup(edition(state, 1, locale), locale)
    for (const id of ROLE_IDS) {
      if (id !== 'KILLER') expect(first).not.toContain(bare(t.roles[id].name))
    }
  })

  it('gives a quiet night a page, and never the same council notice twice', () => {
    const state = quietGame(setup(['KILLER', 'PLAIN', 'PLAIN', 'PLAIN', 'PLAIN'], []))
    const seen = new Set<string>()
    for (let day = 1; day <= 12; day++) {
      const e = edition({ ...state, day }, day, 'en')
      expect(kinds(e).length).toBeGreaterThan(0)
      expect(kinds(e).every((k) => k === 'colour')).toBe(true)
      for (const a of [e.lead, ...e.rest]) {
        if (!a) continue
        expect(seen.has(a.headline), a.headline).toBe(false)
        seen.add(a.headline)
      }
    }
  })

  it.each(LOCALES)('keeps the colour bank clear of every trade, role and side (%s)', (locale) => {
    const t = strings(locale)
    // The sides are not in the list: "the town" is where the paper is printed.
    const words = [...ROLE_IDS.map((id) => bare(t.roles[id].name)), ...(TRADES[locale] ?? [])]
    expect(t.ui.paper.colour.length).toBeGreaterThanOrEqual(30)
    for (const piece of t.ui.paper.colour) {
      const text = `${piece.headline} ${piece.dek}`.toLowerCase()
      for (const word of words) {
        expect(text, `"${piece.headline}" mentions ${word}`).not.toMatch(new RegExp(`\\b${word.toLowerCase()}`))
      }
      expect(text).not.toContain('!')
    }
    for (const id of ROLE_IDS) expect(t.ui.paper.investigation[id].length).toBeGreaterThanOrEqual(2)
  })

  it.each(LOCALES)('sets a breadcrumb as a nameless article after the investigations (%s)', (locale) => {
    let state = lynch(loudNight(), 0)
    state = endNight({ ...startNight(state), stepIndex: 99 })
    const clue: Outcome = { type: 'clue', night: 2, trade: 3, clue: { kind: 'neighbour', crew: true }, public: true }
    state = { ...state, log: [...state.log, clue] }
    const t = strings(locale)
    const e = edition(state, 2, locale)
    expect(kinds(e)).toEqual(['investigation', 'investigation', 'clue', 'colour'])
    const piece = e.rest[1]!
    expect(t.ui.paper.event.clue).toContain(piece.headline)
    expect(piece.dek).toContain(t.tradesNamed[3]!.replace(/^(the|el|la) /, ''))
    for (const name of ['Ana', 'Beto', 'Caro', 'Dani', 'Elena', 'Fer']) expect(piece.dek).not.toContain(name)
  })

  it('sets the same page from a projection-shaped source', () => {
    let state = lynch(loudNight(), 0)
    state = endNight({ ...startNight(state), stepIndex: 99 })
    const fromState = edition(state, 2, 'en')
    const fromSource = editionOf(
      {
        day: 2,
        players: state.players.map((p) => ({ id: p.id, name: p.name })),
        log: state.log.filter((o) => o.public),
        revealed: revealedBy(state),
      },
      'en',
    )
    expect(fromSource).toEqual(fromState)
    const html = dailyMarkup(fromSource, 'en')
    expect(html).toContain('data-paper-close')
    expect(dailyMarkup(fromSource, 'en', false)).not.toContain('data-paper-close')
    expect(html).toContain('paper__scribble')
    expect(html).not.toContain('lorem')
  })
})
