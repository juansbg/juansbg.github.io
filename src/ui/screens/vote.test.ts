import { describe, expect, it } from 'vitest'
import { tallyMarkup, voteChoices, voteCounts } from './vote'
import { castVote, createGame, endNight, startNight, type PlayerSetup } from '../../engine/state'
import { LOCALES, strings } from '../../i18n'
import type { GameState } from '../../engine/types'
import type { RoleId } from '../../engine/roles'

const setup = (roles: RoleId[]): PlayerSetup[] =>
  roles.map((roleId, i) => ({ name: `P${i}`, roleId }))

/** A first day with nobody dead: the night ends with every step skipped. */
const day = (roles: RoleId[]): GameState => {
  let s = startNight(createGame(setup(roles)))
  s = { ...s, stepIndex: s.schedule.length }
  return endNight(s)
}

describe('who may be tapped while recording votes', () => {
  const base = day(['KILLER', 'PLAIN', 'INSPECT', 'PLAIN'])

  it('offers every voter first, without the dead or the silenced', () => {
    const state: GameState = {
      ...base,
      players: base.players.map((p) =>
        p.id === 1 ? { ...p, alive: false } : p.id === 2 ? { ...p, silencedOnDay: base.day } : p,
      ),
    }
    expect(voteChoices(state, null)).toEqual([0, 3])
  })

  it('offers every living seat as a pick once a voter is armed, the voter included', () => {
    const state: GameState = {
      ...base,
      players: base.players.map((p) => (p.id === 1 ? { ...p, alive: false } : p)),
    }
    expect(voteChoices(state, 0)).toEqual([0, 2, 3])
  })
})

describe('the count', () => {
  const base = day(['KILLER', 'PLAIN', 'INSPECT', 'PLAIN'])

  it('is empty until somebody votes', () => {
    expect(voteCounts(base).size).toBe(0)
    expect(tallyMarkup(base, 'en')).toBe('')
  })

  it.each(LOCALES)('names the leader, the count and the voters (%s)', (locale) => {
    let state = castVote(base, 0, 1)
    state = castVote(state, 2, 1)
    state = castVote(state, 3, 0)
    expect(voteCounts(state).get(1)).toBe(2)
    expect(voteCounts(state).get(0)).toBe(1)

    const html = tallyMarkup(state, locale)
    expect(html).toContain(strings(locale).ui.day.tally)
    // Most votes first, and only that row is the leader.
    expect(html.indexOf('>P1<')).toBeLessThan(html.indexOf('>P0<'))
    expect(html.match(/data-leader/g)).toHaveLength(1)
    expect(html.match(/<li class="tally__row" data-leader>[\s\S]*?<\/li>/)?.[0]).toContain('P1')
    expect(html).toContain('P0, P2')
  })

  it('marks a tie with no leader', () => {
    let state = castVote(base, 0, 1)
    state = castVote(state, 1, 0)
    expect(tallyMarkup(state, 'en')).not.toContain('data-leader')
  })

  it("shows the Raven's extra vote as its own mark", () => {
    const state: GameState = {
      ...base,
      players: base.players.map((p) => (p.id === 1 ? { ...p, extraVotesOnDay: base.day } : p)),
    }
    expect(voteCounts(state).get(1)).toBe(1)
    expect(tallyMarkup(state, 'en')).toContain(strings('en').ui.day.extraVoteMark)
  })
})
