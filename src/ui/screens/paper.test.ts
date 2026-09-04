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
