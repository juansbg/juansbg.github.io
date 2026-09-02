import { describe, expect, it } from 'vitest'
import { namesMarkup, MIN_PLAYERS } from './setup'
import { historyMarkup, outcomeCardMarkup, timelineMarkup } from './timeline'
import { strings } from '../../i18n'
import {
  advance,
  createGame,
  endNight,
  lynch,
  newSession,
  recordAction,
  startNight,
  type PlayerSetup,
} from '../../engine/state'
import type { NightAction, Outcome } from '../../engine/types'
import type { RoleId } from '../../engine/roles'

const cast = (roles: RoleId[], names?: string[]): PlayerSetup[] =>
  roles.map((roleId, i) => ({ name: names?.[i] ?? `P${i}`, roleId }))

describe('the names screen', () => {
  it('lists every name typed so far, in order', () => {
    const html = namesMarkup(['Ana', 'Beto', 'Caro'], 'en')
    expect(html.indexOf('Ana')).toBeLessThan(html.indexOf('Beto'))
    expect(html.indexOf('Beto')).toBeLessThan(html.indexOf('Caro'))
  })

  it('gives every name a remove button', () => {
    const html = namesMarkup(['Ana', 'Beto'], 'en')
    expect(html).toContain('data-remove-name="0"')
    expect(html).toContain('data-remove-name="1"')
  })

  it('will not start below the minimum table', () => {
    const few = namesMarkup(['Ana', 'Beto'], 'en')
    expect(few).toMatch(/data-names-done[^>]*disabled/)
    expect(few).toContain(strings('en').ui.setup.minPlayers(MIN_PLAYERS))
  })

  it('starts once there are enough names', () => {
    const enough = namesMarkup(['Ana', 'Beto', 'Caro', 'Dani'], 'en')
    expect(enough).not.toMatch(/data-names-done[^>]*disabled/)
    expect(enough).toContain(strings('en').ui.setup.namesReady(4))
  })

  it('offers to clear the list only when there is one', () => {
    expect(namesMarkup([], 'en')).not.toContain('data-clear-names')
    expect(namesMarkup(['Ana'], 'en')).toContain('data-clear-names')
  })

  it('escapes names rather than trusting them as markup', () => {
    const html = namesMarkup(['<b>x</b>'], 'en')
    expect(html).not.toContain('<b>x</b>')
    expect(html).toContain('&lt;b&gt;')
  })

  it('has no player-count grid any more', () => {
    // The count is how many names were typed; there is nothing else to ask.
    expect(namesMarkup([], 'en')).not.toContain('data-count')
  })
})

describe('report cards carry the colour of their cause', () => {
  const players = createGame(cast(['KILLER', 'PLAIN', 'MEDIC'], ['Ana', 'Beto', 'Caro'])).players

  const card = (outcome: Outcome) => outcomeCardMarkup(outcome, players, 'en') ?? ''

  it('paints a killing in the killers’ colour', () => {
    const html = card({ type: 'death', night: 1, target: 1, cause: 'killers', public: true })
    expect(html).toContain('--accent: var(--role-KILLER)')
    expect(html).toContain('data-kind="death"')
  })

  it('paints a poisoning in the Santera’s colour', () => {
    const html = card({ type: 'death', night: 1, target: 1, cause: 'poison', public: true })
    expect(html).toContain('--accent: var(--role-MEDIC)')
  })

  it('paints an execution in the town’s colour', () => {
    const html = card({ type: 'death', night: 1, target: 1, cause: 'lynch', public: true })
    expect(html).toContain('--accent: var(--town)')
  })

  it('pulls the name out as a badge so it reads first', () => {
    const html = card({ type: 'death', night: 1, target: 1, cause: 'killers', public: true })
    expect(html).toMatch(/report__badge">Beto</)
  })

  it('stays silent for outcomes the town never hears', () => {
    const secret: Outcome = { type: 'inspected', night: 1, target: 1, by: 'INSPECT', public: false }
    expect(outcomeCardMarkup(secret, players, 'en')).toBeNull()
  })
})

describe('the end-of-game history', () => {
  const played = () => {
    let state = createGame(cast(['KILLER', 'PLAIN', 'GUARD', 'INSPECT'], ['Ana', 'Beto', 'Caro', 'Dani']))
    state = startNight(state)
    state = recordAction(state, { kind: 'skip', roleId: 'GUARD' })
    state = recordAction(state, { kind: 'skip', roleId: 'INSPECT' })
    state = recordAction(state, { kind: 'target', roleId: 'KILLER', actor: 0, target: 1 })
    state = endNight(state)
    state = lynch(state, 3)
    return state
  }

  it('groups every public outcome by night', () => {
    const html = historyMarkup(played(), 'en')
    expect(html).toContain(strings('en').ui.timeline.nightStart(1))
    expect(html).toContain('Beto')
    expect(html).toContain('Dani')
  })

  it('keeps secret outcomes out', () => {
    // The detective looked at nobody, but even a look must never surface here.
    const html = historyMarkup(played(), 'en')
    expect(html).not.toContain('data-kind="inspected"')
  })
})

describe('the log', () => {
  it('colours each row by the role that moved', () => {
    let session = newSession(createGame(cast(['KILLER', 'PLAIN', 'GUARD'])))
    session = advance(session, startNight, { night: 1, kind: 'nightStart' })
    const guard: NightAction = { kind: 'target', roleId: 'GUARD', actor: 2, target: 1 }
    session = advance(session, (s) => recordAction(s, guard), {
      night: 1, kind: 'action', roleId: 'GUARD', action: guard,
    })
    const html = timelineMarkup(session, 'en')
    expect(html).toContain('--accent: var(--role-GUARD)')
  })

  it('marks night boundaries as dividers', () => {
    let session = newSession(createGame(cast(['KILLER', 'PLAIN'])))
    session = advance(session, startNight, { night: 1, kind: 'nightStart' })
    expect(timelineMarkup(session, 'en')).toContain('log__row--divider')
  })

  it('shows a skipped step but plays it down', () => {
    let session = newSession(createGame(cast(['KILLER', 'PLAIN', 'INSPECT'])))
    session = advance(session, startNight, { night: 1, kind: 'nightStart' })
    const skip: NightAction = { kind: 'skip', roleId: 'INSPECT' }
    session = advance(session, (s) => recordAction(s, skip), {
      night: 1, kind: 'action', roleId: 'INSPECT', action: skip,
    })
    const html = timelineMarkup(session, 'en')
    expect(html).toContain('log__row--quiet')
    expect(html).toContain(strings('en').ui.timeline.skipped(strings('en').roles.INSPECT.name))
  })
})
