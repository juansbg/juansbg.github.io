import { describe, expect, it } from 'vitest'
import { codeMarkup, goneLineFor, nextGate, nextGone, seatAction, seatMarkup, settlePicks, stepKeyOf, type SeatGate, type SeatPicks } from './seat'
import { deathLines } from './dawn'
import { LOCALES, strings } from '../../i18n'
import { ROLE_IDS, type RoleId } from '../../engine/roles'
import type { PlayerId } from '../../engine/types'
import type { SeatNight, SeatProjection } from '../../room/projections'

/**
 * The phone's night, rendered from hand-built projections: what the acting
 * phone offers at each kind of step, what every other phone shows, and that
 * none of it names a role but the one being read.
 */

const NAMES = ['Ana', 'Beto', 'Caro', 'Dani', 'Eva', 'Fer']
const players = NAMES.map((name, id) => ({ id: id as PlayerId, name, alive: id !== 5, voted: false, silenced: false }))

const quiet = (): SeatNight => ({
  step: 'INSPECT',
  at: { index: 1, of: 4 },
  acting: false,
  view: { self: [], crew: [], doomed: [], marked: [] },
  eligible: [],
  vials: null,
  convertLeft: null,
  victim: null,
  spare: [],
  looked: null,
})

const seat = (id: PlayerId, roleId: RoleId, tonight: Partial<SeatNight>, extra: Partial<SeatProjection> = {}): SeatProjection => ({
  kind: 'seat',
  locale: 'en',
  seat: id,
  name: NAMES[id]!,
  roleId,
  trade: null,
  over: false,
  won: null,
  cast: [],
  roster: [],
  reading: null,
  players,
  tonight: { ...quiet(), view: { self: [id], crew: [], doomed: [], marked: [] }, ...tonight },
  alive: id !== 5,
  phase: 'night',
  night: 2,
  day: 1,
  canVote: false,
  vote: null,
  eligible: [],
  voted: 0,
  tally: [],
  leader: null,
  log: [],
  revealed: [],
  count: null,
  winner: null,
  ...extra,
})

const picks = (picked: PlayerId[], sent = false): SeatPicks => ({ picked, sent })

const buttons = (html: string, act: string): string[] =>
  [...html.matchAll(new RegExp(`<button[^>]*data-act="${act}"[^>]*>`, 'g'))].map((m) => m[0])

/** The seat tile for one chair, opening tag only. */
const tile = (html: string, id: PlayerId): string =>
  html.match(new RegExp(`<button class="seat"[^>]*data-pick="${id}"[^>]*>`))?.[0] ?? ''

describe("a player's phone at night", () => {
  it('shows every phone the same step: the night, the role being read, the plain ring', () => {
    for (const locale of LOCALES) {
      const t = strings(locale)
      const html = seatMarkup({ ...seat(3, 'PLAIN', {}), locale }, locale)
      expect(html).toContain(t.ui.timeline.nightStart(2))
      expect(html).toContain(t.roles.INSPECT.name)
      expect(html).toContain('class="seat"')
      expect(html).not.toContain('data-pick=')
      expect(html).not.toContain('data-act=')
      expect(html).not.toContain(t.roles.INSPECT.prompt)
      // My own chair, and nobody else's, is marked.
      expect(html.split('data-self').length - 1).toBe(1)
      // The dead are struck out; roles and sides reach nobody.
      expect(html).toContain('data-dead')
      expect(html).not.toContain('data-team=')
      expect(html).not.toContain('data-crew')
      // The hold is still there: a player may need their card again.
      expect(html).toContain('data-hold')
    }
  })

  it('names no role but the step, on any phone', () => {
    const html = seatMarkup(seat(3, 'GUARD', {}), 'en')
    const t = strings('en')
    for (const id of ROLE_IDS) {
      if (id === 'INSPECT') continue
      expect(html, id).not.toContain(t.roles[id].name)
    }
  })

  it('gives the acting phone the eligible seats, a mark and a confirm, and no narrator prompt', () => {
    const t = strings('en')
    const p = seat(2, 'INSPECT', { acting: true, eligible: [0, 1, 3, 4] })
    let html = seatMarkup(p, 'en')
    expect(html).not.toContain(t.roles.INSPECT.prompt)
    expect(html).toContain(t.ui.seat.yourMove)
    expect(html.match(/data-pick="\d"/g)).toHaveLength(4)
    expect(html).not.toContain('data-pick="2"')
    // Nothing chosen yet: Confirm waits.
    expect(buttons(html, 'target')[0]).toContain('disabled')
    expect(buttons(html, 'skip')[0]).not.toContain('disabled')

    html = seatMarkup(p, 'en', picks([3]))
    expect(tile(html, 3)).toContain('data-selected')
    expect(buttons(html, 'target')[0]).not.toContain('disabled')
    expect(seatAction('target', {}, p, picks([3]))).toEqual({ kind: 'target', target: 3 })
    expect(seatAction('target', {}, p, picks([]))).toBeNull()
    expect(seatAction('skip', {}, p, picks([]))).toEqual({ kind: 'skip' })
  })

  it("shows the Family the Family and the shared mark, and confirms the narrator's mark", () => {
    const t = strings('en')
    const p = seat(0, 'KILLER', {
      step: 'KILLER',
      acting: true,
      view: { self: [], crew: [0, 1], doomed: [], marked: [3] },
      eligible: [2, 3, 4],
    })
    const html = seatMarkup(p, 'en')
    expect(html.match(/data-crew/g)).toHaveLength(2)
    expect(tile(html, 3)).toContain('data-selected')
    expect(html).toContain(t.ui.seat.familyMark)
    // The mark is the narrator's; the local pick only bridges the round trip.
    expect(seatAction('target', {}, p, picks([]))).toEqual({ kind: 'target', target: 3 })
    expect(seatAction('target', {}, p, picks([4]))).toEqual({ kind: 'target', target: 4 })
    // A crew member who is not the Family's step sees the plain ring every
    // phone shows, the Family unmarked: a phone left face up between steps
    // must read the same as its neighbour's (user, 2026-09-11).
    const asleep = seatMarkup({ ...p, tonight: { ...p.tonight!, acting: false, eligible: [] } }, 'en')
    expect(asleep).not.toContain('data-pick=')
    expect(asleep).not.toContain('data-crew')
    expect(asleep.split('data-self').length - 1).toBe(1)
  })

  it('waits for the narrator once an action is sent', () => {
    const t = strings('en')
    const p = seat(2, 'INSPECT', { acting: true, eligible: [0, 1, 3, 4] })
    const html = seatMarkup(p, 'en', picks([3], true))
    expect(html).toContain('data-sent')
    expect(html).toContain(t.ui.seat.sent)
    expect(html).not.toContain('data-pick=')
    for (const b of [...buttons(html, 'target'), ...buttons(html, 'skip')]) expect(b).toContain('disabled')
  })

  it('takes two seats for the pair and sends them together', () => {
    const p = seat(1, 'PAIR', { step: 'PAIR', acting: true, eligible: [0, 1, 2, 3, 4] })
    expect(buttons(seatMarkup(p, 'en', picks([0])), 'pair')[0]).toContain('disabled')
    expect(buttons(seatMarkup(p, 'en', picks([0, 4])), 'pair')[0]).not.toContain('disabled')
    expect(seatAction('pair', {}, p, picks([0]))).toBeNull()
    expect(seatAction('pair', {}, p, picks([0, 4]))).toEqual({ kind: 'pair', first: 0, second: 4 })
  })

  it("locks the Apothecary's vials the way the narrator's are", () => {
    const t = strings('en')
    const p = seat(4, 'MEDIC', {
      step: 'MEDIC',
      acting: true,
      view: { self: [4], crew: [], doomed: [1], marked: [] },
      eligible: [0, 1, 2, 3, 4],
      vials: { heal: true, poison: true },
    })
    let html = seatMarkup(p, 'en')
    expect(html).toContain(t.ui.view.doomed(['Beto']))
    expect(html).toContain('data-doomed')
    expect(buttons(html, 'potion')[0]).toContain('disabled')
    expect(buttons(html, 'potion')[1]).toContain('disabled')
    // A living seat that is not doomed: only the poison unlocks.
    html = seatMarkup(p, 'en', picks([0]))
    expect(buttons(html, 'potion')[0]).toContain('disabled')
    expect(buttons(html, 'potion')[1]).not.toContain('disabled')
    // The doomed seat: both.
    html = seatMarkup(p, 'en', picks([1]))
    expect(buttons(html, 'potion')[0]).not.toContain('disabled')
    expect(seatAction('potion', { potion: 'heal' }, p, picks([1]))).toEqual({ kind: 'potion', target: 1, potion: 'heal' })
    expect(seatAction('potion', { potion: 'wine' }, p, picks([1]))).toBeNull()
    // A spent vial stays on the card, marked, and never unlocks.
    html = seatMarkup({ ...p, tonight: { ...p.tonight!, vials: { heal: false, poison: true } } }, 'en', picks([1]))
    expect(buttons(html, 'potion')[0]).toContain('data-spent')
    expect(buttons(html, 'potion')[0]).toContain('disabled')
    // Both gone: the step still shows, with no seat to tap.
    html = seatMarkup({ ...p, tonight: { ...p.tonight!, vials: { heal: false, poison: false } } }, 'en')
    expect(html).toContain(t.ui.seat.bothSpent)
    expect(html).not.toContain('data-pick=')
  })

  it("offers the Godfather the Family's pick, and the Associate the two sides", () => {
    const t = strings('en')
    const gf = seat(0, 'CONVERT', {
      step: 'CONVERT',
      acting: true,
      view: { self: [], crew: [0, 1], doomed: [], marked: [3] },
      victim: 3,
      convertLeft: true,
    })
    let html = seatMarkup(gf, 'en')
    expect(html).toContain(t.ui.seat.convertOffer('Dani'))
    expect(html).toContain('data-selected')
    expect(buttons(html, 'confirm')).toHaveLength(1)
    expect(buttons(html, 'skip')).toHaveLength(1)
    html = seatMarkup({ ...gf, tonight: { ...gf.tonight!, victim: null, view: { ...gf.tonight!.view, marked: [] } } }, 'en')
    expect(html).toContain(t.ui.night.convertNoVictim)
    expect(buttons(html, 'confirm')).toHaveLength(0)

    const assoc = seat(1, 'PICK_SIDE', { step: 'PICK_SIDE', acting: true })
    html = seatMarkup(assoc, 'en')
    expect(html).toContain('data-role="KILLER"')
    expect(html).toContain('data-role="PLAIN"')
    expect(seatAction('role', { role: 'KILLER' }, assoc, picks([]))).toEqual({ kind: 'chooseRole', newRole: 'KILLER' })
    expect(seatAction('role', { role: 'JOKER' }, assoc, picks([]))).toBeNull()
  })

  it('shows the Chameleon the centre and the Cultist a split that needs both sides', () => {
    const t = strings('en')
    const cham = seat(2, 'SWAP', { step: 'SWAP', acting: true, spare: ['GUARD', 'MEDIC'] })
    let html = seatMarkup(cham, 'en')
    expect(html).toContain(t.roles.GUARD.name)
    expect(html).toContain('data-role="MEDIC"')
    expect(html).toContain(t.ui.seat.keepCard)
    html = seatMarkup({ ...cham, tonight: { ...cham.tonight!, spare: [] } }, 'en')
    expect(html).toContain(t.ui.night.noSpareCards)

    const cult = seat(3, 'SPLIT', { step: 'SPLIT', acting: true, eligible: [0, 1, 2, 3, 4] })
    expect(buttons(seatMarkup(cult, 'en'), 'split')[0]).toContain('disabled')
    expect(buttons(seatMarkup(cult, 'en', picks([0, 1])), 'split')[0]).not.toContain('disabled')
    // Everyone living on one side is no split.
    expect(buttons(seatMarkup(cult, 'en', picks([0, 1, 2, 3, 4])), 'split')[0]).toContain('disabled')
    expect(seatAction('split', {}, cult, picks([0, 1]))).toEqual({ kind: 'split', sectOne: [0, 1] })
  })

  it("shows the Detective's look in the night's voice, on the gate page after his step", () => {
    const t = strings('en')
    const p = seat(2, 'INSPECT', { step: 'GUARD', looked: { target: 0, roleId: 'CONVERT' } })
    const html = seatMarkup(p, 'en', undefined, { kind: 'looked', key: '2:INSPECT' })
    expect(html).toContain('data-looked')
    expect(html).toContain(t.ui.seat.looked('Ana'))
    expect(html).toContain(t.roles.CONVERT.name)
    expect(html).toContain(t.ui.reveal.sideCrew)
    expect(html).not.toContain('reveal__card')
  })

  it('shows the dead the night like everyone else, with nothing to do', () => {
    const t = strings('en')
    const html = seatMarkup(seat(5, 'GUARD', { acting: true, eligible: [0, 1] }), 'en')
    expect(html).toContain(t.roles.INSPECT.name)
    expect(html).toContain(t.ui.seat.out)
    expect(html).not.toContain('data-pick=')
    expect(html).not.toContain('data-act=')
    // Its own state is the promoted thing on the screen and the step card is
    // demoted behind it (phone-06), and the ring says it is not a ballot.
    expect(html).toContain('class="mine__state"')
    expect(html).toContain('data-quiet')
    expect(html).toContain('data-tap="off"')
  })

  it('tells a living seat with nothing to do that there is nothing to do, and how far the night has got', () => {
    for (const locale of LOCALES) {
      const t = strings(locale)
      const idle = seatMarkup(seat(3, 'PLAIN', {}), locale)
      // An empty note slot at every step of every night reads as a broken phone (phone-05).
      expect(idle, locale).toContain(t.ui.seat.idleNight)
      // The pace, as two plain numbers; never a role and never a seat (phone-11).
      expect(idle, locale).toContain(t.ui.night.stepCounter(2, 4))
      expect(idle, locale).not.toContain('data-quiet')
      // The acting phone has its own hint and its own counter, so neither shows there.
      const acting = seatMarkup(seat(2, 'INSPECT', { acting: true, eligible: [0, 1] }), locale)
      expect(acting, locale).not.toContain(t.ui.seat.idleNight)
      expect(acting, locale).toContain(t.ui.seat.yourMove)
      expect(acting, locale).toContain('data-tap="on"')
    }
  })

  it("settles the picks on the narrator's answer: a mark is dropped for the projection's, a pair waits for its step, and a sent action survives an unrelated repaint of the same step (night-01)", () => {
    const detective = seat(2, 'INSPECT', { acting: true, eligible: [0, 1, 3, 4] })
    const key = stepKeyOf(detective)
    // A player step, not yet sent: the narrator's mark is the truth, the local pick goes.
    expect(settlePicks(detective, picks([3], false), key)).toEqual({ picked: [], sent: false })
    // Sent, same step, still acting: this is not an answer yet — a teammate's
    // own news, a stray republish, a socket that only just reconnected — so
    // the phone keeps showing "sent" rather than looking as if the tap never
    // landed (night-01). The mark itself still comes from the projection.
    expect(settlePicks(detective, picks([3], true), key)).toEqual({ picked: [], sent: true })
    // The step actually moved on: the round trip is over, whatever was sent.
    expect(settlePicks(detective, picks([3], true), 'night 1:GUARD')).toEqual({ picked: [], sent: false })
    // No longer acting at all: also over.
    expect(
      settlePicks({ ...detective, tonight: { ...detective.tonight!, acting: false } }, picks([3], true), key),
    ).toEqual({ picked: [], sent: false })

    // A pair, same step, repainted for any reason: the picks stay until sent.
    const pair = seat(1, 'PAIR', { step: 'PAIR', acting: true, eligible: [0, 2, 3] })
    expect(settlePicks(pair, picks([0]), stepKeyOf(pair))).toEqual({ picked: [0], sent: false })
    // Sent, same step: still waits for its own step to answer, same as a mark.
    expect(settlePicks(pair, picks([0, 3], true), stepKeyOf(pair))).toEqual({ picked: [0, 3], sent: true })
    // The step moved on, or the phone is no longer acting: clean.
    expect(settlePicks(pair, picks([0]), key)).toEqual({ picked: [], sent: false })
    expect(settlePicks({ ...pair, tonight: { ...pair.tonight!, acting: false } }, picks([0]), stepKeyOf(pair))).toEqual({ picked: [], sent: false })
    // Day: nothing to keep.
    expect(settlePicks({ ...pair, phase: 'day', tonight: null }, picks([0]), stepKeyOf(pair))).toEqual({ picked: [], sent: false })
    expect(stepKeyOf({ ...pair, tonight: null })).toBe('')
  })

  it('keeps the "that did not go through" warning on the step it happened on, and drops it when the step moves', () => {
    // The warning is raised by a deadline on `seat.ts`, and on a busy table the
    // next republish is milliseconds away: if it did not travel with the step
    // it would be wiped off the screen before anybody could read it — and the
    // busier the table, the sooner, which is exactly when a frame goes missing.
    const detective = seat(2, 'INSPECT', { acting: true, eligible: [0, 1, 3, 4] })
    const key = stepKeyOf(detective)
    const warned: SeatPicks = { picked: [], sent: false, unsent: true }
    expect(settlePicks(detective, warned, key)).toEqual({ picked: [], sent: false, unsent: true })
    // The step moved on: whatever happened, it is over and there is nothing to warn about.
    expect(settlePicks(detective, warned, 'night 1:GUARD')).toEqual({ picked: [], sent: false })
    expect(
      settlePicks({ ...detective, tonight: { ...detective.tonight!, acting: false } }, warned, key),
    ).toEqual({ picked: [], sent: false })
    // And an action still in flight is never marked unsent by settling alone:
    // only the deadline says that, because only time can tell the difference.
    expect(settlePicks(detective, picks([3], true), key)).toEqual({ picked: [], sent: true })
  })

  it('votes on the ring by day, says the vote is in, and shows the count as it comes up', () => {
    const t = strings('en')
    const day = (vote: PlayerId | null, extra: Partial<SeatProjection> = {}): SeatProjection =>
      seat(0, 'PLAIN', {}, {
        phase: 'day',
        tonight: null,
        canVote: true,
        vote,
        eligible: players.filter((x) => x.alive && x.id !== 0).map(({ id, name }) => ({ id, name })),
        voted: 2,
        players: players.map((x) => ({ ...x, voted: x.id === 1 || x.id === 3 })) as SeatProjection['players'],
        ...extra,
      })
    let html = seatMarkup(day(null), 'en')
    expect(html).toContain(t.ui.table.ballot)
    expect(html).toContain(t.ui.table.voted(2, 5))
    expect(html.match(/data-vote="\d"/g)).toHaveLength(4)
    expect(html).not.toContain('data-vote="0"')
    expect(html.split('data-self').length - 1).toBe(1)
    expect(html.match(/seat__cast/g)).toHaveLength(2)
    expect(html).not.toContain(t.ui.seat.voted)
    expect(html).toContain('data-hold')

    html = seatMarkup(day(2), 'en')
    expect(html).toContain(t.ui.seat.voted)
    expect(html.match(/<button class="seat"[^>]*data-vote="2"[^>]*>/)?.[0]).toContain('data-selected')

    // The count coming up, then complete.
    html = seatMarkup(day(2, { count: { shown: 1, total: 3, last: 2 }, tally: [{ target: 2, votes: 1 }] }), 'en')
    expect(html).toContain(t.ui.table.count)
    expect(html).toContain('1 / 3')
    expect(html).toContain('seat__votes')
    expect(html).toContain('data-fresh')
    // `leader` comes from the room now rather than being re-derived here, so a
    // hand-built projection has to carry it — a complete count with a clear
    // winner and a null leader is not a projection the app can produce. The
    // partial count above deliberately still has none.
    html = seatMarkup(
      day(2, { count: { shown: 3, total: 3, last: 2 }, tally: [{ target: 2, votes: 2 }, { target: 4, votes: 1 }], leader: 2 }),
      'en',
    )
    expect(html).toContain(t.ui.table.pointsAt('Caro'))
    expect(html).toContain('data-leader')
    // The living voter's ring is a ballot and says so.
    expect(seatMarkup(day(null), 'en')).toContain('data-tap="on"')

    // The silenced watch the same ring with no vote to cast — and are told
    // why, and how long it lasts (phone-08). The ring says it is not a
    // ballot, and their own state is promoted over the count (phone-06).
    html = seatMarkup(
      day(null, {
        canVote: false,
        eligible: [],
        players: players.map((x) => ({ ...x, silenced: x.id === 0 })) as SeatProjection['players'],
      }),
      'en',
    )
    expect(html).toContain(t.ui.seat.silenced)
    expect(html).not.toContain(t.ui.seat.cannotVote)
    expect(html).not.toContain('data-vote=')
    expect(html).toContain('class="mine__state"')
    expect(html).toContain('data-quiet')
    expect(html).toContain('data-tap="off"')

    // Nobody burned this seat out; the plain refusal stands.
    expect(seatMarkup(day(null, { canVote: false, eligible: [] }), 'en')).toContain(t.ui.seat.cannotVote)
  })
})

describe('the moment a seat is told it is out (phone-03)', () => {
  const dead = (extra: Partial<SeatProjection> = {}): SeatProjection =>
    seat(0, 'PLAIN', {}, { alive: false, phase: 'day', tonight: null, night: 2, day: 2, ...extra })

  const night = { alive: true, phase: 'night' as const }
  const day = { alive: true, phase: 'day' as const }

  it('arms on the death itself, never on a reload and never once the game is over', () => {
    // A phone that was on the night a moment ago is coming out of one — the
    // narrator's first republish after the resolve can land before the dawn
    // reading opens, so the reading alone cannot be the test.
    expect(nextGone(null, night, dead({ reading: null }))).toEqual({ night: 2, day: 2 })
    expect(nextGone(null, night, dead({ reading: 'dawn' }))).toEqual({ night: 2, day: 2 })
    // Already in the daylight: the town has just done it.
    expect(nextGone(null, day, dead({ reading: 'verdict' }))).toEqual({ night: null, day: 2 })
    expect(nextGone(null, day, dead({ reading: null }))).toEqual({ night: null, day: 2 })
    // A phone that has never seen this seat alive was reloaded by somebody
    // already dead; nothing has just happened to them.
    expect(nextGone(null, null, dead())).toBeNull()
    expect(nextGone(null, { alive: false, phase: 'day' }, dead())).toBeNull()
    // It stays up through every repaint until the tap, and the living never see it.
    const up = { night: 2, day: 2 }
    expect(nextGone(up, { alive: false, phase: 'day' }, dead())).toBe(up)
    expect(nextGone(up, { alive: false, phase: 'day' }, dead({ alive: true }))).toBeNull()
    // The end of the game is its own screen and says the same thing better.
    expect(nextGone(up, day, dead({ over: true }))).toBeNull()
  })

  it('holds the night, the name struck through and one line, and no role at all', () => {
    for (const locale of LOCALES) {
      const t = strings(locale)
      const html = seatMarkup(dead({ reading: null }), locale, undefined, null, { night: 2, day: 2 })
      expect(html, locale).toContain('data-gone')
      expect(html, locale).toContain('mine__struck')
      expect(html, locale).toContain('Ana')
      expect(html, locale).toContain(t.ui.seat.goneTitle)
      expect(html, locale).toContain(t.ui.seat.goneLine)
      expect(html, locale).toContain('data-mourn')
      // The card stays behind the hold, like everywhere else: this phone is
      // still in a lit room full of people.
      for (const id of ROLE_IDS) expect(html, id).not.toContain(t.roles[id].card)
      expect(html, locale).not.toContain('data-hold')
      // The night it happened, or the day the town did it.
      expect(html, locale).toContain(t.ui.timeline.nightEnd(2))
      expect(seatMarkup(dead(), locale, undefined, null, { night: null, day: 2 }), locale).toContain(t.ui.table.day(2))
    }
  })

  it('waits for the reading before it says anything', () => {
    const t = strings('en')
    const html = seatMarkup(dead({ reading: 'dawn' }), 'en', undefined, null, { night: 2, day: 2 })
    expect(html).toContain(t.ui.seat.waking)
    expect(html).not.toContain('data-gone')
  })
})

describe('the gate around the chooser', () => {
  const acting = (id: PlayerId, roleId: RoleId, step: RoleId, extra: Partial<SeatNight> = {}): SeatProjection =>
    seat(id, roleId, { step, acting: true, eligible: [0, 1, 3, 4], ...extra })
  const asleep = (id: PlayerId, roleId: RoleId, step: RoleId, extra: Partial<SeatNight> = {}): SeatProjection =>
    seat(id, roleId, { step, acting: false, ...extra })

  it('opens on "your turn" when a step becomes mine, and holds where the tap left it', () => {
    const mine = acting(2, 'INSPECT', 'INSPECT')
    const turn = nextGate(null, mine)
    expect(turn).toEqual({ kind: 'turn', key: '2:INSPECT' })
    // A repaint of the same step (the mark moved, a refusal) keeps the page.
    expect(nextGate(turn, mine)).toBe(turn)
    const chooser: SeatGate = { kind: 'chooser', key: '2:INSPECT' }
    expect(nextGate(chooser, mine)).toBe(chooser)
    // Not my step, never was: no gate at all.
    expect(nextGate(null, asleep(3, 'GUARD', 'INSPECT'))).toBeNull()
  })

  it('tells the phone to close its eyes once its step is done, after the card for the Detective', () => {
    const chooser: SeatGate = { kind: 'chooser', key: '2:INSPECT' }
    const next = asleep(2, 'INSPECT', 'KILLER', { looked: { target: 0, roleId: 'CONVERT' } })
    const looked = nextGate(chooser, next)
    expect(looked).toEqual({ kind: 'looked', key: '2:INSPECT' })
    // Waits for the tap through any number of repaints.
    expect(nextGate(looked, next)).toBe(looked)
    // Anyone else goes straight to the closing page, even from "your turn" (the narrator tapped for them).
    expect(nextGate({ kind: 'turn', key: '2:GUARD' }, asleep(3, 'GUARD', 'INSPECT'))).toEqual({ kind: 'close', key: '2:GUARD' })
    // A step that is mine again at once skips the closing page: the Godfather after the Family's pick.
    expect(nextGate({ kind: 'chooser', key: '2:KILLER' }, acting(0, 'CONVERT', 'CONVERT'))).toEqual({ kind: 'turn', key: '2:CONVERT' })
    // The morning clears everything.
    expect(nextGate({ kind: 'close', key: '2:INSPECT' }, { ...asleep(2, 'INSPECT', 'INSPECT'), phase: 'day', tonight: null })).toBeNull()
  })

  it('shows a sentence and one button and nothing of the step, in the common screen’s own frame', () => {
    for (const locale of LOCALES) {
      const t = strings(locale)
      const p = { ...acting(0, 'KILLER', 'KILLER', { view: { self: [], crew: [0, 1], doomed: [], marked: [3] } }), locale }
      const turn = seatMarkup(p, locale, undefined, { kind: 'turn', key: '2:KILLER' })
      expect(turn).toContain('data-gate="turn"')
      expect(turn).toContain(t.ui.seat.yourTurn('Ana'))
      expect(turn).toContain(t.ui.seat.proceed)
      // `data-gate-go`, not `data-enter`: the page's stage wears `data-enter`
      // for the entrances, and one selector must not reach both.
      expect(turn.match(/data-gate-go/g)).toHaveLength(1)
      expect(turn).not.toContain('data-enter')
      expect(turn).not.toContain('data-close')
      // The frame every phone has: the head, the card block, the ring; no chooser, no mark, no Family, no role.
      expect(turn).toContain('mine__step')
      expect(turn).toContain('class="seat"')
      expect(turn).not.toContain('data-pick=')
      expect(turn).not.toContain('data-act=')
      expect(turn).not.toContain('data-crew')
      expect(turn).not.toContain('data-selected')
      expect(turn).not.toContain('data-hold')
      for (const id of ROLE_IDS) expect(turn, id).not.toContain(t.roles[id].name)
      expect(turn.split('data-self').length - 1).toBe(1)

      const close = seatMarkup(p, locale, undefined, { kind: 'close', key: '2:KILLER' })
      expect(close).toContain('data-gate="close"')
      expect(close).toContain(t.ui.seat.closeEyes('Ana'))
      expect(close.match(/data-close/g)).toHaveLength(1)
      expect(close).not.toContain('data-pick=')
      expect(close).not.toContain('data-crew')
      for (const id of ROLE_IDS) expect(close, id).not.toContain(t.roles[id].name)

      // The chooser itself is unchanged behind the gate.
      const chooser = seatMarkup(p, locale, undefined, { kind: 'chooser', key: '2:KILLER' })
      expect(chooser).toContain('data-acting')
      expect(chooser.match(/data-crew/g)).toHaveLength(2)
    }
  })

  it('shows the Detective the card he looked at on his closing page, and only there', () => {
    const t = strings('en')
    const p = asleep(2, 'INSPECT', 'KILLER', { looked: { target: 0, roleId: 'CONVERT' } })
    const looked = seatMarkup(p, 'en', undefined, { kind: 'looked', key: '2:INSPECT' })
    expect(looked).toContain('data-looked')
    expect(looked).toContain(t.ui.seat.looked('Ana'))
    expect(looked).toContain(t.roles.CONVERT.name)
    expect(looked).toContain(t.ui.reveal.sideCrew)
    expect(looked.match(/data-close/g)).toHaveLength(1)
    expect(looked).not.toContain('data-pick=')
    // The common screen after the tap carries no trace of it.
    const common = seatMarkup(p, 'en')
    expect(common).not.toContain('data-looked')
    expect(common).not.toContain(t.roles.CONVERT.name)
  })
})

describe("game over, on this seat's own phone", () => {
  it('shows the result, this seat\'s own role and trade, the whole cast, and the hold back (over-03)', () => {
    const t = strings('en')
    const cast = [
      { id: 0, roleId: 'KILLER' as const, trade: null, team: 'crew' as const },
      { id: 1, roleId: 'PLAIN' as const, trade: 2, team: 'town' as const },
      { id: 2, roleId: 'INSPECT' as const, trade: null, team: 'town' as const },
      { id: 3, roleId: 'PLAIN' as const, trade: 0, team: 'town' as const },
      { id: 4, roleId: 'GUARD' as const, trade: null, team: 'town' as const },
      { id: 5, roleId: 'PLAIN' as const, trade: 1, team: 'town' as const },
    ]
    const p = seat(1, 'PLAIN', {}, { over: true, won: true, winner: 'town', cast, trade: 2 })
    const html = seatMarkup(p, 'en')
    // The result is this seat's own, not just the side's.
    expect(html).toContain(t.ui.seat.youWon)
    expect(html).not.toContain('data-lost')
    // This seat's own role and trade, under it. The trade carries the dark
    // card's own ink rather than the paper card's Midnight, which read at
    // 1.1:1 here and is what every citizen met on their payoff screen
    // (phone-01); and the whole screen settles on one alignment (phone-15).
    expect(html).toContain(t.roles.PLAIN.card)
    expect(html).toContain(t.trades[2]!)
    expect(html).toContain('reveal__trade mine__trade')
    expect(html).toContain('mine--over')
    // The whole cast is public now, dead struck, self marked, and the hold is back.
    // (GUARD's ring tile, "Bodyguard": KILLER's own `.card` keeps its article,
    // "The Family", but the ring strips it same as every other role's name.)
    expect(html).toContain(t.roles.GUARD.card)
    expect(html).toContain('data-dead')
    expect(html.split('data-self').length - 1).toBe(1)
    expect(html).toContain('data-hold')

    // A loss carries the same result line, marked, never in red text.
    const lost = seatMarkup({ ...p, won: false, winner: 'crew' }, 'en')
    expect(lost).toContain(t.ui.seat.youLost)
    expect(lost).toContain('data-lost')

    // An early ending has no winner and no side of its own to report.
    const early = seatMarkup({ ...p, won: null, winner: null, cast: [] }, 'en')
    expect(early).toContain(t.ui.over.title)
    expect(early).not.toContain(t.ui.seat.youWon)
    expect(early).not.toContain(t.ui.seat.youLost)
  })
})

describe('a phone without a room in its address', () => {
  it('asks for the code off the screen, five characters, and says when the old room has closed', () => {
    for (const locale of LOCALES) {
      const s = strings(locale).ui.seat
      const html = codeMarkup(locale)
      expect(html).toContain('data-code-form')
      expect(html).toMatch(/data-room-code[^>]*maxlength="5"/)
      expect(html).toContain(s.roomCode)
      expect(html).toContain(s.codeHint)
      expect(html).toContain(s.join)
      expect(html).not.toContain(s.roomGone)
      expect(codeMarkup(locale, true)).toContain(s.roomGone)
    }
  })
})

describe('the reading a phone is held out of', () => {
  it('says which reading it is: a morning after a night, or the town’s own verdict', () => {
    for (const locale of LOCALES) {
      const t = strings(locale)
      const dawn = seatMarkup({ ...seat(0, 'PLAIN', {}), phase: 'day', reading: 'dawn', night: 2, day: 2 }, locale)
      const verdict = seatMarkup({ ...seat(0, 'PLAIN', {}), phase: 'day', reading: 'verdict', night: 2, day: 2 }, locale)
      // A morning is read after a night; a hanging happens in the afternoon,
      // to somebody the table has just voted for.
      expect(dawn).toContain(t.ui.seat.waking)
      expect(dawn).toContain(t.ui.timeline.nightEnd(2))
      expect(verdict).toContain(t.ui.seat.listening)
      expect(verdict).toContain(t.ui.dawn.verdict(2))
      expect(verdict).not.toContain(t.ui.seat.waking)
    }
  })
})


describe('a seat that is out', () => {
  const dead = (extra: Partial<SeatProjection> = {}): SeatProjection =>
    seat(0, 'PLAIN', {}, { alive: false, phase: 'day', day: 1, tonight: null, ...extra })

  it('offers the morning only when the projection actually carries one', () => {
    // The living are never sent the day's outcomes, so the way in cannot
    // appear on their phone even by mistake.
    expect(seatMarkup(dead(), 'en', { picked: [], sent: false }, null, null)).not.toContain('data-paper-open')
    const withPaper = dead({
      log: [{ type: 'death', night: 1, target: 1, cause: 'killers', public: true }],
    })
    expect(seatMarkup(withPaper, 'en', { picked: [], sent: false }, null, null)).toContain('data-paper-open')
  })

  it('names the way in, in both languages', () => {
    for (const locale of LOCALES) {
      const html = seatMarkup(
        dead({ log: [{ type: 'death', night: 1, target: 1, cause: 'killers', public: true }] }),
        locale,
        { picked: [], sent: false },
        null,
        null,
      )
      expect(html).toContain(strings(locale).ui.seat.readPaper)
    }
  })
})

describe('the line the room was read about this seat', () => {
  // The town hears a sentence written for the cause; the phone it happened to
  // read the same two generic lines, every death, every game, in both
  // languages. A death is typed `public: true`, so the public-only log a dead
  // seat carries holds every death in the game — which is what makes the line
  // derivable on the phone rather than something to carry twice.
  const death = (target: PlayerId, night: number, cause: 'killers' | 'lynch' = 'killers') =>
    ({ type: 'death', night, target, cause, public: true }) as const

  const dead = (id: PlayerId, log: readonly ReturnType<typeof death>[]): SeatProjection =>
    seat(id, 'PLAIN', {}, { alive: false, phase: 'day', day: 2, night: 1, tonight: null, log: [...log] })

  it('gives a dead seat the very line that death was given at dawn', () => {
    for (const locale of LOCALES) {
      const t = strings(locale)
      const log = [death(0, 1), death(3, 2)]
      const lines = deathLines(log, (cause) => t.ui.dawn.death[cause].length)
      for (const id of [0, 3] as PlayerId[]) {
        const own = log.find((o) => o.target === id)!
        const expected = t.ui.dawn.death[own.cause][lines.get(own)!]!(NAMES[id]!)
        expect(goneLineFor(dead(id, log), locale)).toBe(expected)
      }
    }
  })

  it('never reads two deaths the same sentence', () => {
    const log = [death(0, 1), death(1, 1), death(2, 2), death(3, 2)]
    const said = ([0, 1, 2, 3] as PlayerId[]).map((id) => goneLineFor(dead(id, log), 'en'))
    expect(said.every((line) => line !== null)).toBe(true)
    expect(new Set(said).size).toBe(said.length)
  })

  it('has nothing to say for a seat that is still alive', () => {
    // A living seat carries no log at all, which is the room's rule, not this
    // screen's — so there is nothing here to derive and nothing to leak.
    const living = seat(1, 'PLAIN', {}, { alive: true })
    expect(living.log).toEqual([])
    expect(goneLineFor(living, 'en')).toBeNull()
  })

  it('says nothing rather than something wrong when the death is not in the log', () => {
    expect(goneLineFor(dead(4, [death(0, 1)]), 'en')).toBeNull()
  })
})
