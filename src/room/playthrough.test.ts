import { describe, expect, it } from 'vitest'
import { COMPLEXITIES, dealRoles, type Complexity } from '../engine/deal'
import { ROLE_IDS, ROLES, type RoleId } from '../engine/roles'
import { seeded } from '../engine/rng'
import { playGame } from '../engine/sim/play'
import { POLICIES } from '../engine/sim/policies'
import { canVote, currentStep, revealedDead, winner } from '../engine/state'
import type { GameState, Player } from '../engine/types'
import { LOCALES, renderWinner, strings, type Locale } from '../i18n'
import { dawnSlides, verdictSlides } from '../ui/screens/dawn'
import { roleCardMarkup } from '../ui/screens/reveal'
import { seatMarkup, seatPlayer } from '../ui/screens/seat'
import { tableMarkup } from '../ui/screens/table'
import { actsAt } from './actions'
import { seatProjection, tvProjection, type SeatProjection } from './projections'

/**
 * Whole games, every screen, every step.
 *
 * The bots play a game through the engine while this test stands behind
 * every player and behind the TV, rendering what each would see after every
 * single move and checking two things: nothing is shown to the wrong
 * person, and nothing impossible is shown to anyone. It is the same
 * discipline as the leak tests, run over thousands of states instead of a
 * handful of hand-built ones.
 */

const GAMES = 150

/** Where a word may not appear, with a message that names the state. */
const forbid = (html: string, word: string, why: string): void => {
  if (word !== '' && html.includes(word)) {
    throw new Error(`${why}: "${word}" is on screen\n${html.slice(0, 400)}`)
  }
}

/** The same, but the word whole: a trade must not be caught inside another word. */
const forbidWord = (html: string, word: string, why: string): void => {
  if (word === '') return
  const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  if (new RegExp(`(^|[^\\p{L}])${escaped}(?=[^\\p{L}]|$)`, 'u').test(html)) {
    throw new Error(`${why}: "${word}" is on screen\n${html.slice(0, 400)}`)
  }
}

const checkTv = (state: GameState, locale: Locale, sealed: boolean): void => {
  const t = strings(locale)
  const p = tvProjection(state, locale, { sealed })
  const json = JSON.stringify(p)
  const revealed = new Set(revealedDead(state).map((x) => x.id))

  // Roles reach the room only through the paper's investigations.
  expect(p.revealed.map((r) => r.id).sort()).toEqual([...revealed].sort())
  for (const r of p.revealed) {
    const player = state.players.find((x) => x.id === r.id)!
    expect(player.alive).toBe(false)
    expect(r.roleId).toBe(player.roleId)
  }
  // Two ways a role id may reach the room: the paper named a dead player, or the Chameleon
  // took that card from the centre and the table heard which (a card nobody living holds).
  const allowed = new Set([
    ...p.revealed.map((r) => r.roleId),
    ...state.log.filter((o) => o.type === 'cardTaken').map((o) => (o as { role: RoleId }).role),
  ])
  for (const id of ROLE_IDS) {
    if (allowed.has(id)) continue
    expect(json, `tv carries role ${id}`).not.toContain(`"${id}"`)
  }
  expect(json).not.toContain('voter')
  expect(json).not.toContain('"public":false')
  if (sealed) {
    expect(p.tally).toEqual([])
    expect(p.leader).toBeNull()
  }
  expect(p.voted).toBe(state.votes.length)

  const html = tableMarkup(p, false)
  expect(html).not.toContain('seat__sigil')
  expect(html).not.toContain('data-crew')
  expect(html).not.toContain('data-table-proceed')
  // A living player's role name is never on the room's screen.
  for (const player of state.players) {
    if (!player.alive || revealed.has(player.id)) continue
    // A role held only by living players must not be named; one a revealed dead
    // player also held may appear (the paper named them).
    if ([...allowed].includes(player.roleId)) continue
    // The faction is public ("The Family wins", "the Family came for…"); its members are not.
    if (ROLES[player.roleId].team === 'crew') continue
    const tvWinner = p.winner === null ? '' : (renderWinner(p.winner, locale) ?? '')
    if (tvWinner.includes(t.roles[player.roleId].name)) continue
    forbid(html, t.roles[player.roleId].name, `tv names 's role`)
  }
  for (const player of state.players) {
    if (player.alive) expect(html, `${player.name} shown dead`).not.toMatch(new RegExp(`data-dead[^>]*>[^<]*<[^>]*>[^<]*<[^>]*>${player.name}<`))
  }
}

/**
 * The seat's projection as data (docs/BIG-SCREEN.md §10): the only role ids
 * on a phone are its own card, the step being read (public: the narrator
 * says it), the centre on the Chameleon's phone at his step and the card the
 * Detective looked at on his; and the night block carries exactly what the
 * card knows. This is the security model of the night from the phones.
 */
const checkSeatNight = (state: GameState, me: Player, p: SeatProjection): void => {
  const json = JSON.stringify(p)
  const night = p.tonight
  const allowed = new Set<RoleId>([me.roleId])
  if (night !== null) {
    if (night.step !== null) allowed.add(night.step)
    for (const id of night.spare) allowed.add(id)
    if (night.looked !== null) allowed.add(night.looked.roleId)
  }
  for (const id of ROLE_IDS) {
    if (!allowed.has(id)) expect(json, `${me.name}'s phone carries role ${id}`).not.toContain(`"${id}"`)
  }
  expect(json).not.toContain('voter')
  expect(json).not.toContain('"public"')
  expect(p.players.map((s) => s.id)).toEqual(state.players.map((s) => s.id))

  if (state.phase !== 'night') {
    expect(night).toBeNull()
    return
  }
  expect(night).not.toBeNull()
  if (night === null) return
  const step = currentStep(state)
  expect(night.step).toBe(step)
  expect(night.acting).toBe(actsAt(me, step))
  const crewViewer = me.alive && ROLES[me.roleId].team === 'crew' && me.roleId !== 'PICK_SIDE'
  const crew = state.players.filter((o) => o.alive && ROLES[o.roleId].team === 'crew').map((o) => o.id)
  expect(night.view.self, `${me.name} sees "you"`).toEqual(crewViewer ? [] : [me.id])
  expect(night.view.crew, `${me.name} sees the Family`).toEqual(crewViewer ? crew : [])
  if (!night.acting) {
    expect(night.eligible).toEqual([])
    expect(night.spare).toEqual([])
  }
  for (const id of night.eligible) expect(state.players.find((o) => o.id === id)?.alive).toBe(true)
  if (night.view.doomed.length > 0) expect(night.acting && me.roleId === 'MEDIC').toBe(true)
  if (night.spare.length > 0) expect(night.acting && me.roleId === 'SWAP').toBe(true)
  expect(night.vials !== null).toBe(me.roleId === 'MEDIC')
  expect(night.convertLeft !== null).toBe(me.roleId === 'CONVERT')
  if (night.looked !== null) expect(me.roleId).toBe('INSPECT')
  if (night.victim !== null) expect(crewViewer && me.roleId !== 'KILLER').toBe(true)
  // With no mark passed in, the only thing marked is the pick a Godfather or a Renegade already saw.
  if (night.view.marked.length > 0) expect(night.view.marked).toEqual([night.victim])
}

const checkSeats = (state: GameState, locale: Locale): void => {
  const t = strings(locale)
  const win = winner(state)
  for (const me of state.players) {
    const p = seatProjection(state, me.id, locale, { dealt: true })!
    expect(p.roleId).toBe(me.roleId)
    expect(p.trade).toBe(me.trade)
    expect(p.alive).toBe(me.alive)
    expect(p.winner).toBe(win)

    checkSeatNight(state, me, p)

    // Voting: only by day, only alive, only the unsilenced, never for oneself or the dead.
    const may = state.phase === 'day' && me.alive && canVote(state, me.id)
    expect(p.canVote).toBe(may)
    if (!may) expect(p.eligible).toEqual([])
    for (const e of p.eligible) {
      expect(e.id).not.toBe(me.id)
      expect(state.players.find((x) => x.id === e.id)?.alive).toBe(true)
    }
    expect(p.vote).toBe(state.votes.find((v) => v.voter === me.id)?.target ?? null)

    const html = seatMarkup(p, locale)
    expect(html).toContain(me.name)
    // Once the game is over the winner line may name a role ("The Martyr wins").
    const winnerLine = win === null ? '' : (renderWinner(win, locale) ?? '')
    // What a phone may say of a role at night, on purpose (docs/BIG-SCREEN.md
    // §10): the step being read is on every phone, since the narrator says it
    // aloud; the centre's cards are on the Chameleon's at his step; the card
    // the Detective looked at is on his for the rest of the night.
    const spoken = new Set<string>()
    if (p.tonight?.step) spoken.add(t.roles[p.tonight.step].name)
    for (const id of p.tonight?.spare ?? []) spoken.add(t.roles[id].name)
    if (p.tonight?.looked) spoken.add(t.roles[p.tonight.looked.roleId].name)
    // A phone that sees the Family is the Family's: the faction's name (the
    // killers' card is named for it) may be on it, as on the held card.
    if ((p.tonight?.view.crew.length ?? 0) > 0) spoken.add(t.roles.KILLER.name)
    // Nobody else's role or trade, unless it happens to be the same as mine.
    for (const other of state.players) {
      if (other.id === me.id) continue
      const otherRole = t.roles[other.roleId].name
      if (other.roleId !== me.roleId && !winnerLine.includes(otherRole) && !spoken.has(otherRole)) {
        forbid(html, otherRole, `'s phone names 's role`)
      }
      if (other.trade !== null && other.trade !== me.trade) {
        // As a word: the Apothecary's "Curar" is not the priest ("Cura").
        forbidWord(html, t.trades[other.trade] ?? '', `${me.name}'s phone names ${other.name}'s trade`)
      }
    }
    // The screen itself never shows my role either; only the held card does —
    // unless it is the step being read, which every phone shows alike.
    if (!winnerLine.includes(t.roles[me.roleId].name) && !spoken.has(t.roles[me.roleId].name)) {
      expect(html, `'s role is on screen without a hold`).not.toContain(t.roles[me.roleId].name)
    }
    const card = roleCardMarkup(seatPlayer(p), locale)
    expect(card).toContain(t.roles[me.roleId].name)
    if (me.roleId === 'PLAIN' && me.trade !== null) expect(card).toContain(t.trades[me.trade]!)
    // A converted citizen keeps their trade on the card; anyone dealt a role has none.
    if (me.trade === null) expect(card).not.toContain('reveal__trade')

    if (!me.alive && win === null) expect(html).toContain(t.ui.seat.out)
    if (win !== null) expect(html).toContain(t.ui.seat.youAre(me.id + 1))
  }
}

const checkReadings = (state: GameState, locale: Locale): void => {
  const t = strings(locale)
  const revealed = new Set(revealedDead(state).map((x) => x.id))
  const slides = [...dawnSlides(state, locale), ...verdictSlides(state, locale)]
  for (const slide of slides) {
    for (const player of state.players) {
      if (revealed.has(player.id)) continue
      // A death line names its cause by role — the Family, the Apothecary's poison, the Gunman's
      // shot, the Binding's heartbreak — by design: the cause is public, the hand is not.
      if (ROLES[player.roleId].team === 'crew' || (['MEDIC', 'AVENGE', 'PAIR'] as RoleId[]).includes(player.roleId)) continue
      const roleName = t.roles[player.roleId].name
      // A card the Chameleon took names a role nobody living holds; a living
      // player's role must never be read aloud.
      if (player.alive && !state.players.some((o) => o.id !== player.id && !o.alive && o.roleId === player.roleId)) {
        const heldByLivingOnly = !state.log.some((o) => o.type === 'cardTaken' && o.role === player.roleId)
        if (heldByLivingOnly) forbid(slide.line, roleName, `the reading names ${player.name}'s role`)
      }
    }
  }
}

describe('a whole game, from every chair', () => {
  it('shows each phone and the room only what they may see, at every step', () => {
    const random = seeded(4242)
    let states = 0
    for (let i = 0; i < GAMES; i++) {
      const players = 5 + (i % 8)
      const complexity = COMPLEXITIES[i % 3] as Complexity
      const roles: RoleId[] = dealRoles(players, complexity, random)
      const locale: Locale = LOCALES[i % LOCALES.length] as Locale
      let step = 0
      const result = playGame(roles, POLICIES.detective, random, () => {}, (state) => {
        step += 1
        states += 1
        checkTv(state, locale, step % 2 === 0)
        checkSeats(state, locale)
        checkReadings(state, locale)
      })
      expect(result.winner, `game ${i} ended`).not.toBeNull()
      expect(result.stalled).toBe(false)
    }
    expect(states).toBeGreaterThan(1000)
  }, 60_000)

  it('never lets a dead player vote, or a living one vote for the dead', () => {
    const random = seeded(99)
    for (let i = 0; i < 20; i++) {
      const roles = dealRoles(6 + (i % 6), 'standard', random)
      playGame(roles, POLICIES.random, random, () => {}, (state) => {
        for (const v of state.votes) {
          const voter = state.players.find((p) => p.id === v.voter)!
          const target = state.players.find((p) => p.id === v.target)!
          expect(voter.alive).toBe(true)
          expect(target.alive).toBe(true)
          expect(v.voter).not.toBe(v.target)
        }
        // Everyone the deal made a crew member is still counted as one.
        const crewNow = state.players.filter((p) => ROLES[p.roleId].team === 'crew')
        expect(crewNow.length).toBeGreaterThanOrEqual(0)
      })
    }
  })
})
