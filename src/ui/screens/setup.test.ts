import { describe, expect, it } from 'vitest'
import { balanceMarkup, namesMarkup, rosterMarkup, seatFor, MIN_PLAYERS } from './setup'
import { LOCALES } from '../../i18n'
import { describeEntry, historyMarkup, outcomeCardMarkup, timelineMarkup } from './timeline'
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

describe('the balance line', () => {
  it('says how many will be Family and which way the table leans, in both languages', () => {
    for (const locale of LOCALES) {
      const players = createGame(cast(Array<RoleId>(8).fill('PLAIN'))).players
      const html = balanceMarkup(players, locale, 'standard', false)
      expect(html).toContain(strings(locale).ui.setup.balance(2, 8))
      expect(html).toMatch(/data-lean="(town|even|crew)"/)
    }
  })

  it('counts the Family actually at the table once roles are set, and drops the lean if they differ', () => {
    const three = createGame(cast(['KILLER', 'KILLER', 'KILLER', 'PLAIN', 'PLAIN', 'PLAIN', 'PLAIN', 'PLAIN'])).players
    const html = balanceMarkup(three, 'en', 'standard', true)
    expect(html).toContain('3 of 8 will be Family')
    expect(html).toContain('data-lean="custom"')
    expect(html).not.toContain('leans')
  })

  it('sits under the complexity chips on the roster screen', () => {
    const players = createGame(cast(Array<RoleId>(6).fill('PLAIN'), ['A', 'B', 'C', 'D', 'E', 'F'])).players
    const html = rosterMarkup(players, 'en', 'simple')
    expect(html.indexOf('data-complexity="simple"')).toBeLessThan(html.indexOf('class="balance"'))
  })
})

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

describe('the big screen from the names screen', () => {
  const idle = { room: null, needsKey: false, busy: false, error: null, address: 'juansbg.github.io/tv', code: '', key: '', open: true, turned: [] } as const
  const four = ['Ana', 'Beto', 'Caro', 'Dani']

  it('asks for the code the TV shows, and says where the TV goes, when no room is open', () => {
    for (const locale of ['en', 'es'] as const) {
      const t = strings(locale)
      const html = namesMarkup(four, locale, new Set(), idle)
      expect(html).toContain('data-screen-form')
      expect(html).toMatch(/data-screen-code[^>]*maxlength="5"/)
      // The address in the hint is an address, not a link. The sentence
      // around it is addressed to the television; underlining it offered the
      // narrator's own phone the one road it must never take by accident.
      expect(html).not.toMatch(/<a[^>]*href="tv\.html"/)
      expect(html).toContain('juansbg.github.io/tv')
      expect(html).toContain(t.ui.setup.screenHint('').trim().split(/\s+/)[0] as string)
      expect(html).not.toContain('data-screen-key')
      expect(html).not.toContain('data-room-line')
      // The names still start a phoneless evening.
      expect(html).toContain(t.ui.setup.namesReady(4))
    }
  })

  it('offers the big-screen road as a labelled row, folded away beside the code', () => {
    for (const locale of ['en', 'es'] as const) {
      const t = strings(locale)
      const html = namesMarkup(four, locale, new Set(), { ...idle, open: false })
      // Two roads, each naming the device it is about: a narrator who has a
      // TV somewhere else, and a TV that is itself sitting on the root page.
      expect(html).toContain('data-screen-open')
      expect(html, locale).toMatch(/<button[^>]*data-this-is-screen[^>]*>/)
      expect(html).toContain(t.ui.setup.thisIsScreen)
      // A row that says what it does, never an underline inside a sentence
      // telling you to do it on the other device.
      expect(html).not.toMatch(/<a[^>]*href="tv\.html"/)
    }
  })

  it('asks for the key under the code the first time, and again when the relay refused it', () => {
    expect(namesMarkup(four, 'en', new Set(), { ...idle, needsKey: true })).toContain('data-screen-key')
    const refused = namesMarkup(four, 'en', new Set(), { ...idle, needsKey: true, error: 'key' })
    expect(refused).toContain('data-screen-key')
    expect(refused).toContain(strings('en').ui.room.refused)
    expect(namesMarkup(four, 'en', new Set(), { ...idle, error: 'room' })).toContain(strings('en').ui.setup.noSuchScreen)
  })

  it('shows the screen this phone runs, and no code field or QR, once a room is open', () => {
    const html = namesMarkup(four, 'en', new Set([0, 2]), { ...idle, room: { code: 'AB2CD', tvs: 1, phones: 2 } })
    expect(html).toContain('data-room-line')
    expect(html).toContain(strings('en').ui.setup.onScreen('AB2CD'))
    expect(html).toContain(strings('en').ui.room.tvs(1))
    expect(html).toContain(strings('en').ui.room.players(2))
    expect(html).not.toContain('data-screen-form')
    expect(html).not.toContain('<svg')
    expect(html).not.toContain('data-this-is-screen')
    // The door reads "Everyone is in" and the phones are marked on the list.
    expect(html).toContain(strings('en').ui.table.proceed)
    expect(html.match(/data-joined/g)?.length).toBe(2)
  })

  it('names the phones turned away at the door, in both languages', () => {
    // The setup case is the one that mattered: the Timeline button does not
    // exist until the cards are dealt, so before this the narrator's only
    // window on a refused scan opened after the roster had locked.
    const room = { code: 'AB2CD', tvs: 1, phones: 2 }
    for (const locale of LOCALES) {
      const t = strings(locale)
      const html = namesMarkup(four, locale, new Set([0]), {
        ...idle,
        room,
        turned: [{ night: 0, at: 0, cid: 'c1', name: 'Ana', reason: 'nameTaken' }],
      })
      expect(html).toContain('data-turned')
      expect(html).toContain(t.ui.setup.turned.nameTaken(['Ana']))
      // One name refused is one name, not a list read as a plural.
      expect(html).not.toContain(t.ui.setup.turned.nameTaken(['Ana', 'Beto']))
    }
  })

  it('says nothing about the door when nobody has been turned away', () => {
    const html = namesMarkup(four, 'en', new Set(), { ...idle, room: { code: 'AB2CD', tvs: 1, phones: 2 } })
    expect(html).not.toContain('data-turned')
  })

  it('sets one line a reason, not one a phone, and names everyone on it', () => {
    const t = strings('en')
    const html = namesMarkup(four, 'en', new Set(), {
      ...idle,
      room: { code: 'AB2CD', tvs: 1, phones: 2 },
      turned: [
        { night: 0, at: 0, cid: 'c1', name: 'Ana', reason: 'nameTaken' },
        { night: 0, at: 1, cid: 'c2', name: 'Zeke', reason: 'notOnList' },
        // The same person on two phones is one person to seat.
        { night: 0, at: 2, cid: 'c3', name: 'ana', reason: 'nameTaken' },
      ],
    })
    expect(html.match(/turned__row/g)?.length).toBe(2)
    expect(html).toContain(t.ui.setup.turned.nameTaken(['Ana']))
    expect(html).toContain(t.ui.setup.turned.notOnList(['Zeke']))
  })

  it('keeps the newest four, so a queue never crowds out the list it is about', () => {
    const t = strings('en')
    const html = namesMarkup(four, 'en', new Set(), {
      ...idle,
      room: { code: 'AB2CD', tvs: 1, phones: 2 },
      turned: ['Uno', 'Dos', 'Tres', 'Cuatro', 'Cinco'].map((name, i) => ({
        night: 0, at: i, cid: `c${i}`, name, reason: 'notOnList' as const,
      })),
    })
    expect(html).toContain(t.ui.setup.turned.notOnList(['Dos', 'Tres', 'Cuatro', 'Cinco']))
    expect(html).not.toContain('Uno')
  })

  it('leads with the room and demotes the name field, once a room is open', () => {
    const room = { code: 'AB2CD', tvs: 1, phones: 2 }
    for (const locale of LOCALES) {
      const t = strings(locale)
      const html = namesMarkup(four, locale, new Set([0, 1]), { ...idle, room })
      // The screen is about the room filling up, not about typing names.
      expect(html).toContain(t.ui.setup.roomJoining)
      expect(html).not.toContain(t.ui.setup.whoIsPlaying)
      // The field is still there, for the one person who has no phone.
      expect(html).toContain('data-new-name')
      expect(html).toContain(t.ui.setup.noPhone)
      // Under the roster, not over it.
      expect(html.indexOf('name-list')).toBeLessThan(html.indexOf('data-new-name'))
      // And the keyboard stays down: it covered the roster it was opened to watch.
      expect(html).not.toContain('autofocus')
    }
  })

  it('still leads with the name field when there is no room', () => {
    const t = strings('en')
    const html = namesMarkup(four, 'en', new Set(), idle)
    expect(html).toContain(t.ui.setup.whoIsPlaying)
    expect(html).not.toContain(t.ui.setup.roomJoining)
    expect(html).toContain('autofocus')
    expect(html.indexOf('data-new-name')).toBeLessThan(html.indexOf('name-list'))
  })

  it('shows nothing of the screen when no relay is configured', () => {
    const html = namesMarkup(four, 'en')
    expect(html).not.toContain('data-screen-form')
    expect(html).not.toContain('data-room-line')
    expect(html).not.toContain('data-this-is-screen')
  })

  it('keeps what was typed after a refusal, and waits for five letters before Join', () => {
    // Only the field the relay turned down is cleared by the caller; the
    // markup shows back whatever it is handed.
    const refused = namesMarkup(four, 'en', new Set(), { ...idle, needsKey: true, error: 'key', code: 'AB2CD', key: '' })
    expect(refused).toMatch(/data-screen-code[^>]*value="AB2CD"/)
    expect(refused).toMatch(/data-screen-key[^>]*value=""/)
    expect(refused).toMatch(/data-screen-submit(?![^>]*disabled)/)
    // Join does nothing at all with fewer than five, so it says so.
    expect(namesMarkup(four, 'en', new Set(), idle)).toMatch(/data-screen-submit[^>]*disabled/)
    expect(namesMarkup(four, 'en', new Set(), { ...idle, code: 'AB2' })).toMatch(/data-screen-submit[^>]*disabled/)
  })

  it('leads with the names and puts the code under them, until a room is open', () => {
    const cold = namesMarkup([], 'en', new Set(), idle)
    expect(cold.indexOf('data-new-name')).toBeLessThan(cold.indexOf('data-screen-form'))
    // With a room there is no form, only the one status line, and that sits up top.
    const open = namesMarkup(four, 'en', new Set(), { ...idle, room: { code: 'AB2CD', tvs: 1, phones: 0 } })
    expect(open.indexOf('data-room-line')).toBeLessThan(open.indexOf('data-new-name'))
  })

  it('marks the names two people answer to, and keeps the door shut until they differ', () => {
    const html = namesMarkup(['Ana', 'Beto', 'ana ', 'Caro'], 'en', new Set(), null)
    expect(html.match(/data-clash/g)?.length).toBe(2)
    expect(html).toContain(strings('en').ui.setup.sameName(['Ana']))
    // A repeated name used to be a footnote beside a bright button, and
    // dealing with it unresolved handed a role to a seat nobody was sitting
    // in: four names, three people. The door says what it is waiting for.
    expect(html).toMatch(/data-names-done[^>]*disabled/)
    expect(html).toContain(strings('en').ui.setup.sameNameFirst)
    expect(html).not.toContain(strings('en').ui.setup.namesReady(4))
    // A table with four different names opens as it always did.
    const clean = namesMarkup(four, 'en', new Set(), null)
    expect(clean).not.toContain('data-clash')
    expect(clean).toMatch(/data-names-done(?![^>]*disabled)/)
    expect(clean).toContain(strings('en').ui.setup.namesReady(4))
  })
})

describe('report lines carry the side of their cause', () => {
  const players = createGame(cast(['KILLER', 'PLAIN', 'MEDIC'], ['Ana', 'Beto', 'Caro'])).players

  const card = (outcome: Outcome) => outcomeCardMarkup(outcome, players, 'en') ?? ''

  it('marks a killing as the crew, with the killers’ sigil', () => {
    const html = card({ type: 'death', night: 1, target: 1, cause: 'killers', public: true })
    expect(html).toContain('data-accent="crew"')
    expect(html).toContain('data-sigil="KILLER"')
    expect(html).toContain('data-kind="death"')
  })

  it('marks a poisoning as occult — the Apothecary is town, but hollow', () => {
    const html = card({ type: 'death', night: 1, target: 1, cause: 'poison', public: true })
    expect(html).toContain('data-accent="occult"')
  })

  it('marks an execution as the town', () => {
    const html = card({ type: 'death', night: 1, target: 1, cause: 'lynch', public: true })
    expect(html).toContain('data-accent="town"')
  })

  it('never emits a per-role colour', () => {
    const html = card({ type: 'death', night: 1, target: 1, cause: 'killers', public: true })
    expect(html).not.toContain('--role')
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
  it('marks each row with the side of the role that moved', () => {
    let session = newSession(createGame(cast(['KILLER', 'PLAIN', 'GUARD'])))
    session = advance(session, startNight, { night: 1, kind: 'nightStart' })
    const guard: NightAction = { kind: 'target', roleId: 'GUARD', actor: 2, target: 1 }
    session = advance(session, (s) => recordAction(s, guard), {
      night: 1, kind: 'action', roleId: 'GUARD', action: guard,
    })
    const html = timelineMarkup(session, 'en')
    expect(html).toContain('data-accent="town"')
    // The mark carries the role's sigil.
    expect(html).toContain('data-sigil="GUARD"')
    expect(html).not.toContain('--role')
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

describe('a breadcrumb is not a verdict', () => {
  const players = createGame(cast(['KILLER', 'PLAIN', 'MEDIC'], ['Ana', 'Beto', 'Caro'])).players

  it('marks a clue with the reading\u2019s own pilcrow, not the scales of the town\u2019s verdict', () => {
    const clue = outcomeCardMarkup(
      { type: 'clue', night: 1, trade: 0, clue: { kind: 'doors', doors: 2 }, public: true },
      players, 'en',
    ) ?? ''
    expect(clue).toContain('\u00b6')
    expect(clue).not.toContain('\u2696')
    // The town's own decision keeps the scales.
    const verdict = outcomeCardMarkup(
      { type: 'death', night: 1, target: 1, cause: 'lynch', public: true }, players, 'en',
    ) ?? ''
    expect(verdict).toContain('\u2696')
  })
})

describe('a phone turned away at the door', () => {
  const started = () => {
    let session = newSession(createGame(cast(['KILLER', 'PLAIN', 'INSPECT'], ['Ana', 'Beto', 'Caro'])))
    return advance(session, startNight, { night: 1, kind: 'nightStart' })
  }

  it('leaves a quiet line in the timeline, in both languages, with no rewind on it', () => {
    const session = started()
    for (const locale of LOCALES) {
      const t = strings(locale)
      const html = timelineMarkup(session, locale, [
        { night: 1, at: session.timeline.length, cid: 'c-Zeke', name: 'Zeke', reason: 'notOnList' },
      ])
      expect(html).toContain(t.ui.timeline.notOnList('Zeke'))
      expect(html).toContain('log__row--quiet')
      // Nothing happened in the game, so there is nothing to go back to: the
      // only rewind in the sheet is the night's own.
      expect(html.match(/data-revert=/g)?.length).toBe(session.timeline.length)
    }
  })

  it('tells a name nobody has from a name somebody already holds', () => {
    const session = started()
    const t = strings('en')
    expect(timelineMarkup(session, 'en', [{ night: 1, at: 1, cid: 'c-Zeke', name: 'Zeke', reason: 'notOnList' }]))
      .toContain(t.ui.timeline.notOnList('Zeke'))
    expect(timelineMarkup(session, 'en', [{ night: 1, at: 1, cid: 'c-Ana', name: 'Ana', reason: 'nameTaken' }]))
      .toContain(t.ui.timeline.nameTaken('Ana'))
    expect(timelineMarkup(session, 'en', [{ night: 1, at: 1, cid: 'c-Zeke', name: 'Zeke', reason: 'tableFull' }]))
      .toContain(t.ui.timeline.tableFull('Zeke'))
  })

  it('sits where it happened, newest first, among the moves', () => {
    let session = started()
    const skip: NightAction = { kind: 'skip', roleId: 'INSPECT' }
    // The door said no between the night starting and the Detective's step.
    const at = session.timeline.length
    session = advance(session, (s) => recordAction(s, skip), {
      night: 1, kind: 'action', roleId: 'INSPECT', action: skip,
    })
    const html = timelineMarkup(session, 'en', [{ night: 1, at, cid: 'c-Zeke', name: 'Zeke', reason: 'notOnList' }])
    const t = strings('en')
    const detective = html.indexOf(t.ui.timeline.skipped(t.roles.INSPECT.name))
    const door = html.indexOf(t.ui.timeline.notOnList('Zeke'))
    const night = html.indexOf(t.ui.timeline.nightStart(1))
    expect(detective).toBeLessThan(door)
    expect(door).toBeLessThan(night)
  })
})

describe('a vote in the log', () => {
  it('names the voter and the target, or the voter alone when withdrawn', () => {
    const players = createGame(cast(['KILLER', 'PLAIN'], ['Ana', 'Beto'])).players
    expect(describeEntry({ night: 1, kind: 'vote', voter: 1, target: 0 }, players, 'en')).toBe('Beto votes for Ana')
    expect(describeEntry({ night: 1, kind: 'vote', voter: 1 }, players, 'es')).toBe('Beto retira su voto')
  })
})

describe('the table keeps its shape across a restart', () => {
  const order = ['Ana', 'Beto', 'Caro', 'Dani']
  // Phones rejoin in whatever order they reconnect, which is not the order
  // the table is actually sitting in.
  const rejoin = (arrivals: readonly string[]): string[] => {
    let names: string[] = []
    for (const name of arrivals) {
      const at = seatFor(names, order, name)
      names = [...names.slice(0, at), name, ...names.slice(at)]
    }
    return names
  }

  it('puts everyone back where they sat, whatever order they reconnect in', () => {
    expect(rejoin(['Caro', 'Ana', 'Dani', 'Beto'])).toEqual(order)
    expect(rejoin(['Dani', 'Caro', 'Beto', 'Ana'])).toEqual(order)
    expect(rejoin(order)).toEqual(order)
  })

  it('keeps the circle unbroken when somebody does not come back', () => {
    // Beto has gone home. Everyone else is still sitting where they were.
    expect(rejoin(['Dani', 'Ana', 'Caro'])).toEqual(['Ana', 'Caro', 'Dani'])
  })

  it('seats somebody new at the end, in the order they arrived', () => {
    expect(rejoin(['Caro', 'Zeke', 'Ana', 'Yola'])).toEqual(['Ana', 'Caro', 'Zeke', 'Yola'])
  })

  it('is the plain arrival order when the table has never played', () => {
    expect(seatFor(['Ana'], [], 'Beto')).toBe(1)
    expect(seatFor([], [], 'Ana')).toBe(0)
  })

  it('matches a name the way the rest of the table does, case and spacing aside', () => {
    expect(seatFor(['Caro'], order, ' ana ')).toBe(0)
  })
})
