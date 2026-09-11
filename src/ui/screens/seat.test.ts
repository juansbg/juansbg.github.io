import { describe, expect, it } from 'vitest'
import { seatAction, seatMarkup, settlePicks, stepKeyOf, type SeatPicks } from './seat'
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
const players = NAMES.map((name, id) => ({ id: id as PlayerId, name, alive: id !== 5 }))

const quiet = (): SeatNight => ({
  step: 'INSPECT',
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
  players,
  tonight: { ...quiet(), view: { self: [id], crew: [], doomed: [], marked: [] }, ...tonight },
  alive: id !== 5,
  phase: 'night',
  night: 2,
  day: 1,
  canVote: false,
  vote: null,
  eligible: [],
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
    // A crew member who is not the Family's step sees the same ring with no chooser.
    const asleep = seatMarkup({ ...p, tonight: { ...p.tonight!, acting: false, eligible: [] } }, 'en')
    expect(asleep).not.toContain('data-pick=')
    expect(asleep.match(/data-crew/g)).toHaveLength(2)
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

  it("keeps the Detective's look on his phone, in the night's voice", () => {
    const t = strings('en')
    const p = seat(2, 'INSPECT', { step: 'GUARD', looked: { target: 0, roleId: 'CONVERT' } })
    const html = seatMarkup(p, 'en')
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
  })

  it("settles the picks on the narrator's answer: a mark is dropped for the projection's, a pair waits for its step", () => {
    const detective = seat(2, 'INSPECT', { acting: true, eligible: [0, 1, 3, 4] })
    const key = stepKeyOf(detective)
    // A player step: the narrator's mark is the truth, the local pick goes.
    expect(settlePicks(detective, picks([3], true), key)).toEqual({ picked: [], sent: false })
    // A pair, same step, repainted for any reason: the picks stay until sent.
    const pair = seat(1, 'PAIR', { step: 'PAIR', acting: true, eligible: [0, 2, 3] })
    expect(settlePicks(pair, picks([0]), stepKeyOf(pair))).toEqual({ picked: [0], sent: false })
    // The step moved on, or the phone is no longer acting: clean.
    expect(settlePicks(pair, picks([0]), key)).toEqual({ picked: [], sent: false })
    expect(settlePicks({ ...pair, tonight: { ...pair.tonight!, acting: false } }, picks([0]), stepKeyOf(pair))).toEqual({ picked: [], sent: false })
    // Day: nothing to keep.
    expect(settlePicks({ ...pair, phase: 'day', tonight: null }, picks([0]), stepKeyOf(pair))).toEqual({ picked: [], sent: false })
    expect(stepKeyOf({ ...pair, tonight: null })).toBe('')
  })

  it('says the vote is in, by day', () => {
    const t = strings('en')
    const day = (vote: PlayerId | null): SeatProjection =>
      seat(0, 'PLAIN', {}, {
        phase: 'day',
        tonight: null,
        canVote: true,
        vote,
        eligible: players.filter((x) => x.alive && x.id !== 0).map(({ id, name }) => ({ id, name })),
      })
    expect(seatMarkup(day(null), 'en')).not.toContain(t.ui.seat.voted)
    expect(seatMarkup(day(2), 'en')).toContain(t.ui.seat.voted)
  })
})
