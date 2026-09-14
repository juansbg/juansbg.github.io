import { describe, expect, it } from 'vitest'
import { lobbyMarkup, tableMarkup } from './table'
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

  it('puts the winner at display size in the middle of the ring, and shows who everyone was', () => {
    const state = lynch(morning(), 0)
    for (const locale of LOCALES) {
      const t = strings(locale)
      const p = tvProjection(state, locale)
      expect(p.over).toBe(true)
      const html = tableMarkup(p)
      expect(html).toContain('data-over')
      expect(html).toContain('tableview__result')
      expect(html).toContain(strings(locale).winner.town)
      expect(html).toContain('seat__sigil')
      // The cast is public now, dead or alive: Ana's role (the Family, lynched)
      // reads too — the tile drops a leading article the way every role tile
      // does ("Bodyguard", not "The Bodyguard"), so check the same stripped word.
      const tile = (name: string): string => name.replace(/^(the|el|la|los|las)\s+/i, '').trim()
      expect(html).toContain(tile(t.roles.KILLER.name))
      expect(html).toContain(tile(t.roles.INSPECT.name))
      expect(html).toContain(tile(t.roles.GUARD.name))
    }
  })

  it('glows only the living Family Vendetta once the game is over, and says the game ended without naming a side when the narrator stopped it early', () => {
    const state = morning()
    for (const locale of LOCALES) {
      const t = strings(locale)
      const p = tvProjection(state, locale, { over: true })
      expect(p.winner).toBeNull()
      const html = tableMarkup(p)
      expect(html).toContain(t.ui.over.endedOn(state.night))
      expect(html).not.toContain(t.winner.town)
      expect(html).not.toContain(t.winner.crew)
      // Ana (KILLER) is alive and Family; Caro and Dani are alive and town —
      // only her seat glows.
      expect(html).toMatch(/data-crew[^>]*>[\s\S]*?Ana/)
      expect(html.match(/data-crew/g)).toHaveLength(1)
    }
  })

  it('is a lobby before the game: the code and QR to join, and who is in', () => {
    const fresh = createGame(cast(['PLAIN', 'PLAIN', 'PLAIN'], ['Ana', 'Beto', 'Caro']))
    const p = tvProjection(fresh, 'en', {
      join: 'https://site/seat.html#room=AB2CD',
      roster: [{ name: 'Ana', joined: true }, { name: 'Beto', joined: false }, { name: 'Caro', joined: true }],
    })
    const mine = tableMarkup(p)
    expect(mine).toContain('AB2CD')
    expect(mine).toContain('<svg')
    expect(mine).toMatch(/data-joined[^>]*>Ana/)
    expect(mine).not.toMatch(/data-joined[^>]*>Beto/)
    expect(mine).toContain(strings('en').ui.table.joined(2, 3))
    expect(mine).toContain('data-table-proceed')
    expect(mine).not.toContain('seat__name')
    expect(tableMarkup(p, false)).not.toContain('data-table-proceed')
    // Three at the table is not a game yet: the button says so instead of doing nothing.
    expect(mine).toMatch(/data-table-proceed disabled/)
    expect(mine).toContain(strings('en').ui.setup.minPlayers(4))
    const four = tvProjection(fresh, 'en', {
      join: 'https://site/seat.html#room=AB2CD',
      roster: [{ name: 'Ana', joined: true }, { name: 'Beto', joined: true }, { name: 'Caro', joined: true }, { name: 'Dani', joined: true }],
    })
    expect(tableMarkup(four)).not.toMatch(/data-table-proceed disabled/)
    expect(tableMarkup(four)).toContain(strings('en').ui.table.proceed)
  })

  it('shows the clock by day', () => {
    const html = tableMarkup(tvProjection(morning(), 'en', { timer: { phase: 'running', seconds: 90, endsAt: null } }))
    expect(html).toContain('data-timer-digits')
    expect(html).toContain('1:30')
  })

  it('says a step is being decided at night, as a count and nothing that names it', () => {
    let state = createGame(
      cast(['CONVERT', 'KILLER', 'INSPECT', 'GUARD', 'PLAIN', 'PLAIN'], ['Ana', 'Beto', 'Caro', 'Dani', 'Eva', 'Fer']),
    )
    state = startNight(state)
    for (const locale of LOCALES) {
      const t = strings(locale)
      const html = tableMarkup(tvProjection(state, locale))
      expect(html).toContain(t.ui.tv.deciding)
      expect(html).toContain(t.ui.night.stepCounter(1, state.schedule.length))
      // Never a role name, whatever step is actually live.
      for (const roleId of state.schedule) expect(html, roleId).not.toContain(t.roles[roleId].name)
    }
    // A step taken moves the count.
    state = recordAction(state, { kind: 'target', roleId: 'GUARD', actor: 3, target: 3 })
    const html = tableMarkup(tvProjection(state, 'en'))
    expect(html).toContain(strings('en').ui.night.stepCounter(2, state.schedule.length))
    // By day, and once the game is over, there is nothing to decide.
    const day = tableMarkup(tvProjection(morning(), 'en'))
    expect(day).not.toContain(strings('en').ui.tv.deciding)
    const over = tableMarkup(tvProjection(morning(), 'en', { over: true }))
    expect(over).not.toContain(strings('en').ui.tv.deciding)
  })
})

describe('the paper on the table', () => {
  it('shows the open edition instead of the seats, with no controls and no unrevealed role', () => {
    // Beto dies on night 1; on day 2 the paper names him, and the phone has it open.
    let state = morning()
    state = startNight(state)
    state = recordAction(state, { kind: 'target', roleId: 'GUARD', actor: 3, target: 2 })
    state = recordAction(state, { kind: 'skip', roleId: 'INSPECT' })
    state = recordAction(state, { kind: 'skip', roleId: 'KILLER' })
    state = endNight(state)
    for (const locale of LOCALES) {
      const t = strings(locale)
      const closed = tableMarkup(tvProjection(state, locale))
      expect(closed).toContain('data-table')
      expect(closed).not.toContain('data-paper')
      const open = tableMarkup(tvProjection(state, locale, { paper: 2 }), false)
      expect(open).toContain('data-paper')
      expect(open).toContain(t.ui.paper.daily(2))
      expect(open).toContain('Beto')
      expect(open).toContain(t.roles.PLAIN.name)
      expect(open).not.toContain('data-paper-close')
      expect(open).not.toContain('data-table')
      // The masthead is the app's name, which is also the crew's; look past it for a leaked role.
      const body = open.replace(/<p class="paper__name">[^<]*<\/p>/, '')
      for (const id of ['KILLER', 'INSPECT', 'GUARD'] as const) expect(body).not.toContain(t.roles[id].name)
    }
  })
})

describe('the vote on the table', () => {
  const ballot = (): GameState => {
    let state = morning()
    state = castVote(state, 2, 0)
    state = castVote(state, 3, 0)
    return state
  }

  it('shows how many hands are up while the ballot is sealed, and whose, never for whom', () => {
    const state = ballot()
    for (const locale of LOCALES) {
      const t = strings(locale)
      const html = tableMarkup(tvProjection(state, locale, { sealed: true }))
      expect(html).toContain('data-ballot')
      expect(html).toContain(t.ui.table.ballot)
      expect(html).toMatch(/<b>2<\/b>.*<b>3<\/b>/s)
      expect(html).toContain(t.ui.table.haveVoted)
      expect(html.match(/seat__cast/g)).toHaveLength(2)
      expect(html).not.toContain('seat__votes')
      expect(html).not.toContain('data-leader')
      expect(html).not.toContain('data-verdict')
    }
  })

  it('lands the count one ballot at a time and ends on who the town points at', () => {
    const state = ballot()
    const t = strings('en')
    const one = tableMarkup(tvProjection(state, 'en', { shown: 1 }))
    expect(one).toContain(t.ui.table.count)
    expect(one).toMatch(/<b>1<\/b>.*<b>2<\/b>/s)
    expect(one).toContain(t.ui.table.counted)
    expect(one).toMatch(/data-fresh[^>]*>[\s\S]*?Ana/)
    expect(one.match(/seat__votes/g)).toHaveLength(1)
    expect(one).not.toContain('data-verdict')
    const done = tableMarkup(tvProjection(state, 'en', { shown: 2 }))
    expect(done).toContain('data-verdict')
    expect(done).toContain(t.ui.table.pointsAt('Ana'))
    expect(done).toContain('data-leader')
  })

  it('calls a tie a tie', () => {
    let state = morning()
    state = castVote(state, 2, 0)
    state = castVote(state, 0, 2)
    const html = tableMarkup(tvProjection(state, 'es', { shown: 2 }))
    expect(html).toContain('Empate · Ana · Caro')
    expect(html).not.toContain('data-leader')
  })
})

describe('the lobby a screen opens by itself', () => {
  it('shows the code and the QR with the narrator’s line where the roster will be, in both languages', () => {
    for (const locale of LOCALES) {
      const html = lobbyMarkup({ code: 'AB2CD', join: 'https://site/seat.html#room=AB2CD', roster: null }, false, locale)
      const t = strings(locale).ui
      expect(html).toContain('AB2CD')
      expect(html).toContain('<svg')
      expect(html).toContain('data-unclaimed')
      expect(html).toContain(t.tv.forNarrator)
      expect(html).toContain(t.tv.enterCode)
      expect(html).not.toContain('lobby__names')
      expect(html).not.toContain('data-table-proceed')
      expect(html).not.toContain(t.table.joined(0, 0))
    }
  })

  it('carries the relay’s state as one quiet line, and drops it when there is nothing to say', () => {
    const lobby = { code: 'AB2CD', join: 'https://site/seat.html#room=AB2CD', roster: null }
    expect(lobbyMarkup({ ...lobby, note: 'Reconnecting…' }, false, 'en')).toContain('lobby__note">Reconnecting…')
    expect(lobbyMarkup(lobby, false, 'en')).not.toContain('lobby__note')
  })

  it('is the same screen once a narrator claims it: the code stays put and the roster takes the column', () => {
    const before = lobbyMarkup({ code: 'AB2CD', join: 'https://site/seat.html#room=AB2CD', roster: null }, false, 'en')
    const after = lobbyMarkup(
      { code: 'AB2CD', join: 'https://site/seat.html#room=AB2CD', roster: [{ name: 'Ana', joined: true }] },
      false,
      'en',
    )
    const left = (html: string): string => html.slice(html.indexOf('<div class="lobby__code">'), html.indexOf('</div>') + 6)
    expect(left(after)).toBe(left(before))
    expect(after).not.toContain('data-unclaimed')
    expect(after).toContain('lobby__names')
  })

  it('leads with the roster once everyone at the table already holds a phone, and demotes the code', () => {
    const filling = lobbyMarkup(
      { code: 'AB2CD', join: 'https://site/seat.html#room=AB2CD', roster: [{ name: 'Ana', joined: true }, { name: 'Beto', joined: false }] },
      false,
      'en',
    )
    expect(filling).not.toContain('data-settled')
    expect(filling).not.toContain('lobby__headline')

    const settled = lobbyMarkup(
      { code: 'AB2CD', join: 'https://site/seat.html#room=AB2CD', roster: [{ name: 'Ana', joined: true }, { name: 'Beto', joined: true }] },
      false,
      'en',
    )
    expect(settled).toContain('data-settled')
    expect(settled).toContain('lobby__headline')
    // The code and QR are still there, for a latecomer or a second screen.
    expect(settled).toContain('AB2CD')
    expect(settled).toContain('<svg')
  })
})
