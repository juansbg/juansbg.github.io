import { describe, expect, it } from 'vitest'
import { tableMarkup } from './table'
import { dawnSlides, verdictSlides } from './dawn'
import { tvProjection } from '../../room/projections'
import { LOCALES, strings } from '../../i18n'
import {
  castVote,
  createGame,
  endNight,
  lynch,
  recordAction,
  startNight,
  type PlayerSetup,
} from '../../engine/state'
import type { GameState } from '../../engine/types'
import type { RoleId } from '../../engine/roles'

const cast = (roles: RoleId[], names?: string[]): PlayerSetup[] =>
  roles.map((roleId, i) => ({ name: names?.[i] ?? `P${i}`, roleId }))

const morning = (): GameState => {
  let state = createGame(cast(['KILLER', 'PLAIN', 'INSPECT', 'GUARD'], ['Ana', 'Beto', 'Caro', 'Dani']))
  state = startNight(state)
  state = recordAction(state, { kind: 'target', roleId: 'GUARD', actor: 3, target: 3 })
  state = recordAction(state, { kind: 'target', roleId: 'INSPECT', actor: 2, target: 0 })
  state = recordAction(state, { kind: 'target', roleId: 'KILLER', actor: null, target: 1 })
  return endNight(state)
}

describe('the table for the room', () => {
  it('shows names and who is dead, and nothing about roles, in both languages', () => {
    const state = morning()
    for (const locale of LOCALES) {
      const html = tableMarkup(tvProjection(state, locale))
      expect(html).toContain('Ana')
      expect(html).toMatch(/data-dead[^>]*>[\s\S]*?Beto/)
      expect(html).not.toContain('seat__sigil')
      expect(html).not.toContain('data-crew')
      expect(html).not.toContain('data-team="crew"')
      expect(html).not.toContain(strings(locale).roles.KILLER.name)
      expect(html).not.toContain(strings(locale).roles.INSPECT.name)
      expect(html).toContain(strings(locale).ui.table.day(1))
    }
  })

  it('lays the count over the seats and marks the leader', () => {
    let state = morning()
    state = castVote(state, 2, 0)
    state = castVote(state, 3, 0)
    const html = tableMarkup(tvProjection(state, 'en'))
    expect(html).toMatch(/data-leader[^>]*>[\s\S]*?Ana[\s\S]*?seat__votes">2/)
  })

  it('puts the reading in the middle, with its controls on the narrator’s device only', () => {
    const state = morning()
    const reading = { kind: 'dawn' as const, index: 0, slides: dawnSlides(state, 'en') }
    const mine = tableMarkup(tvProjection(state, 'en', { reading }))
    expect(mine).toContain('tableview__card')
    expect(mine).toContain('data-lethal')
    expect(mine).toContain('Beto')
    expect(mine).toContain('data-dawn-close')
    expect(mine).toContain('data-table-close')

    const theirs = tableMarkup(tvProjection(state, 'en', { reading }), false)
    expect(theirs).toContain('tableview__card')
    expect(theirs).not.toContain('data-dawn-close')
    expect(theirs).not.toContain('data-table-close')
  })

  it('reads the verdict under its own heading', () => {
    const state = lynch(morning(), 2)
    const reading = { kind: 'verdict' as const, index: 0, slides: verdictSlides(state, 'es') }
    const html = tableMarkup(tvProjection(state, 'es', { reading }))
    expect(html).toContain(strings('es').ui.dawn.verdict(1))
    expect(html).toContain('Caro')
  })

  it('names the winner when the game is over', () => {
    const state = lynch(morning(), 0)
    const html = tableMarkup(tvProjection(state, 'en'))
    expect(html).toContain(strings('en').winner.town)
  })

  it('shows the clock by day', () => {
    const html = tableMarkup(tvProjection(morning(), 'en', { timer: { phase: 'running', seconds: 90, endsAt: null } }))
    expect(html).toContain('data-timer-digits')
    expect(html).toContain('1:30')
  })
})
