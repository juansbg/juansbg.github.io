import { describe, expect, it } from 'vitest'
import { seatProjection, tvProjection, waitingSeat } from './projections'
import { LOCALES } from '../i18n'
import { ROLE_IDS, type RoleId } from '../engine/roles'
import {
  castVote,
  createGame,
  currentStep,
  endNight,
  lynch,
  recordAction,
  startNight,
  type PlayerSetup,
} from '../engine/state'
import type { GameState } from '../engine/types'
import { dawnSlides } from '../ui/screens/dawn'
import { legalTargets } from '../engine/targets'
import type { SeatNight } from './projections'

const cast = (roles: RoleId[], names?: string[]): PlayerSetup[] =>
  roles.map((roleId, i) => ({ name: names?.[i] ?? `P${i}`, roleId }))

/**
 * A night with secrets in it: the Detective looks at the Godfather, the
 * Bodyguard shields someone, the Godfather converts the victim, the Arsonist
 * silences a seat. Only the silence and the death are public.
 */
const secretNight = (): GameState => {
  let state = createGame(
    cast(['CONVERT', 'KILLER', 'INSPECT', 'GUARD', 'SILENCE', 'PLAIN', 'PLAIN'],
         ['Ana', 'Beto', 'Caro', 'Dani', 'Eva', 'Fer', 'Gus']),
  )
  state = startNight(state)
  state = recordAction(state, { kind: 'target', roleId: 'GUARD', actor: 3, target: 5 })
  state = recordAction(state, { kind: 'target', roleId: 'INSPECT', actor: 2, target: 0 })
  state = recordAction(state, { kind: 'target', roleId: 'SILENCE', actor: 4, target: 6 })
  state = recordAction(state, { kind: 'target', roleId: 'KILLER', actor: null, target: 5 })
  state = recordAction(state, { kind: 'confirm', roleId: 'CONVERT' })
  state = recordAction(state, { kind: 'skip', roleId: 'MEDIC' })
  return endNight(state)
}

describe('the projection for the whole town', () => {
  it('carries no role, no secret outcome and no voter, in either language', () => {
    let state = secretNight()
    state = castVote(state, 2, 0)
    state = castVote(state, 3, 0)
    for (const locale of LOCALES) {
      const json = JSON.stringify(
        tvProjection(state, locale, {
          reading: { kind: 'dawn', index: 0, slides: dawnSlides(state, locale) },
        }),
      )
      expect(json).not.toContain('roleId')
      expect(json).not.toContain('"public":false')
      expect(json).not.toContain('voter')
      for (const type of ['inspected', 'protected', 'converted', 'roleChanged']) {
        expect(json, type).not.toContain(`"${type}"`)
      }
      // The table holds a Godfather, a Detective, a Bodyguard and an Arsonist;
      // none of those ids may be in what the room sees.
      for (const id of ROLE_IDS) expect(json, id).not.toContain(`"${id}"`)
    }
  })

  it('names the dead for what they were only once the paper has had its day, and nobody else', () => {
    // Beto (a Citizen) dies on night 1, Caro (the Detective) is hanged on day 1.
    let state = createGame(
      cast(['KILLER', 'PLAIN', 'INSPECT', 'GUARD', 'PLAIN', 'PLAIN'], ['Ana', 'Beto', 'Caro', 'Dani', 'Eva', 'Fer']),
    )
    state = startNight(state)
    state = recordAction(state, { kind: 'target', roleId: 'GUARD', actor: 3, target: 3 })
    state = recordAction(state, { kind: 'skip', roleId: 'INSPECT' })
    state = recordAction(state, { kind: 'target', roleId: 'KILLER', actor: 0, target: 1 })
    state = endNight(state)
    state = lynch(state, 2)
    expect(tvProjection(state, 'en').revealed).toEqual([])
    expect(JSON.stringify(tvProjection(state, 'en'))).not.toContain('"INSPECT"')

    state = startNight(state)
    state = recordAction(state, { kind: 'target', roleId: 'GUARD', actor: 3, target: 4 })
    state = recordAction(state, { kind: 'skip', roleId: 'KILLER' })
    state = endNight(state)
    const p = tvProjection(state, 'en', { paper: 2 })
    expect(p.revealed.map((r) => r.id).sort()).toEqual([1, 2])
    expect(p.revealed.find((r) => r.id === 2)?.roleId).toBe('INSPECT')
    expect(p.revealed.find((r) => r.id === 1)?.trade).toBe(state.players[1]!.trade)
    expect(p.paper).toBe(2)
    // The living Family, the Bodyguard and the other citizens stay unnamed.
    const json = JSON.stringify(p)
    for (const id of ROLE_IDS) {
      if (id === 'INSPECT' || id === 'PLAIN') continue
      expect(json, id).not.toContain(`"${id}"`)
    }
    expect(json.split('"PLAIN"').length - 1).toBe(1)
  })

  it('shows who is dead, silenced and marked, and the count against each seat', () => {
    let state = secretNight()
    state = castVote(state, 2, 0)
    state = castVote(state, 3, 0)
    state = castVote(state, 5, 2)
    const p = tvProjection(state, 'en')
    expect(p.players.find((s) => s.id === 6)?.silenced).toBe(true)
    expect(p.players.every((s) => s.alive)).toBe(true) // the Godfather converted instead
    expect(p.tally).toEqual([{ target: 0, votes: 2 }, { target: 2, votes: 1 }])
    expect(p.leader).toBe(0)
    expect(p.voted).toBe(3)
    expect(p.winner).toBeNull()
    expect(p.log.every((o) => o.public)).toBe(true)
  })

  it('hides the count and the leader while the ballot is sealed, but not how many voted', () => {
    let state = secretNight()
    state = castVote(state, 2, 0)
    state = castVote(state, 3, 0)
    const sealed = tvProjection(state, 'en', { sealed: true })
    expect(sealed.tally).toEqual([])
    expect(sealed.leader).toBeNull()
    expect(sealed.voted).toBe(2)
    expect(sealed.count).toBeNull()
    // That a hand is up is public; whose ballot it is stays with the phone.
    expect(sealed.players.filter((s) => s.voted).map((s) => s.id)).toEqual([2, 3])
    expect(JSON.stringify(sealed)).not.toContain('voter')
    expect(tvProjection(state, 'en', { sealed: false }).tally).toHaveLength(1)
  })

  it('brings the count up one ballot at a time, and names the leader only once it is complete', () => {
    let state = secretNight()
    state = castVote(state, 2, 0)
    state = castVote(state, 3, 0)
    state = castVote(state, 5, 2)
    const one = tvProjection(state, 'en', { shown: 1 })
    expect(one.count).toEqual({ shown: 1, total: 3, last: 2 })
    expect(one.tally).toEqual([{ target: 2, votes: 1 }])
    expect(one.leader).toBeNull()
    const all = tvProjection(state, 'en', { shown: 3 })
    expect(all.count).toEqual({ shown: 3, total: 3, last: 0 })
    expect(all.tally).toEqual([{ target: 0, votes: 2 }, { target: 2, votes: 1 }])
    expect(all.leader).toBe(0)
    for (const p of [one, all]) expect(JSON.stringify(p)).not.toContain('voter')
    // The phone gets the same count.
    const mine = seatProjection(state, 4, 'en', { dealt: true, shown: 1 })!
    expect(mine.count).toEqual({ shown: 1, total: 3, last: 2 })
    expect(mine.tally).toEqual([{ target: 2, votes: 1 }])
    expect(mine.voted).toBe(3)
    expect(mine.players.filter((s) => s.voted).map((s) => s.id)).toEqual([2, 3, 5])
    const sealedSeat = seatProjection(state, 4, 'en', { dealt: true, sealed: true })!
    expect(sealedSeat.count).toBeNull()
    expect(sealedSeat.tally).toEqual([])
    expect(sealedSeat.voted).toBe(3)
  })

  it('carries the cast to the room and to every phone once the game is over, and never before', () => {
    // Beto (a Citizen) dies on night 1; the town then hangs the only killer.
    let state = createGame(cast(['KILLER', 'PLAIN', 'INSPECT', 'GUARD', 'PLAIN'], ['Ana', 'Beto', 'Caro', 'Dani', 'Eva']))
    state = startNight(state)
    state = recordAction(state, { kind: 'target', roleId: 'KILLER', actor: 0, target: 1 })
    state = endNight(state)
    for (const locale of LOCALES) {
      const on = tvProjection(state, locale)
      expect(on.over).toBe(false)
      expect(on.cast).toEqual([])
      expect(JSON.stringify(on)).not.toContain('"KILLER"')
      const seat = seatProjection(state, 2, locale, { dealt: true })!
      expect(seat.over).toBe(false)
      expect(seat.won).toBeNull()
      expect(seat.cast).toEqual([])
    }
    // The narrator ends the game from the menu: over, nobody won, the cast is public.
    for (const locale of LOCALES) {
      const early = tvProjection(state, locale, { over: true })
      expect(early.over).toBe(true)
      expect(early.winner).toBeNull()
      expect(early.cast.map((c) => c.roleId)).toEqual(['KILLER', 'PLAIN', 'INSPECT', 'GUARD', 'PLAIN'])
      const seat = seatProjection(state, 2, locale, { dealt: true, over: true })!
      expect(seat.over).toBe(true)
      expect(seat.won).toBeNull()
      expect(seat.cast.length).toBe(5)
      expect(seat.tonight).toBeNull()
    }
    // The town wins: over without being told, and each phone knows its own side.
    state = lynch(state, 0)
    for (const locale of LOCALES) {
      const done = tvProjection(state, locale)
      expect(done.winner).toBe('town')
      expect(done.over).toBe(true)
      expect(done.cast.find((c) => c.id === 0)).toEqual({ id: 0, roleId: 'KILLER', trade: null, team: 'crew' })
      expect(seatProjection(state, 2, locale, { dealt: true })!.won).toBe(true)
      expect(seatProjection(state, 0, locale, { dealt: true })!.won).toBe(false)
      expect(seatProjection(state, 1, locale, { dealt: true })!.won).toBe(true)
    }
  })

  it('carries the table filling up and the narrator reading, and drops both when they are over', () => {
    const roster = [
      { name: 'Ana', joined: true },
      { name: 'Beto', joined: false },
    ]
    // Before the deal, a seat sees the same list the screen's lobby shows.
    const waiting = waitingSeat(0, 'Ana', 'en', roster)
    expect(waiting.roster).toEqual(roster)
    expect(waiting.reading).toBe(false)

    const table = createGame(cast(['KILLER', 'PLAIN', 'INSPECT', 'GUARD', 'PLAIN'], ['Ana', 'Beto', 'Caro', 'Dani', 'Eva']))
    // Before the first night the game is still setting up, so the list travels.
    expect(seatProjection(table, 1, 'en', { dealt: false, roster })!.roster).toEqual(roster)
    const playing = startNight(table)
    for (const locale of LOCALES) {
      // Once the game is on, the roster belongs to the past: it is not carried.
      const dealt = seatProjection(playing, 1, locale, { dealt: true, roster })!
      expect(dealt.roster).toEqual([])
      expect(dealt.reading).toBe(false)
      // While the narrator reads, every phone knows to wait with the room.
      expect(seatProjection(playing, 1, locale, { dealt: true, reading: true })!.reading).toBe(true)
    }
  })

  it('shows no winner to the room or a seat before the first night', () => {
    const state = createGame(cast(['PLAIN', 'PLAIN', 'PLAIN', 'PLAIN']))
    expect(tvProjection(state, 'en').winner).toBeNull()
    expect(seatProjection(state, 0, 'en', { dealt: false })!.winner).toBeNull()
    expect(tvProjection(createGame([]), 'en').winner).toBeNull()
  })

  it('carries the lobby only during setup', () => {
    const fresh = createGame(cast(['PLAIN', 'PLAIN', 'PLAIN', 'PLAIN'], ['Ana', 'Beto', 'Caro', 'Dani']))
    const lobby = tvProjection(fresh, 'en', {
      join: 'https://site/seat.html#room=AB2CD',
      roster: [{ name: 'Ana', joined: true }, { name: 'Beto', joined: false }],
    })
    expect(lobby.join).toBe('https://site/seat.html#room=AB2CD')
    expect(lobby.roster.map((r) => r.joined)).toEqual([true, false])
    const begun = tvProjection(secretNight(), 'en', { join: 'https://site/seat.html#room=AB2CD', roster: [{ name: 'Ana', joined: true }] })
    expect(begun.join).toBeNull()
    expect(begun.roster).toEqual([])
  })

  it('is plain JSON that survives a round trip', () => {
    const state = lynch(secretNight(), 0)
    const p = tvProjection(state, 'es', { timer: { phase: 'running', seconds: 42, endsAt: null } })
    expect(JSON.parse(JSON.stringify(p))).toEqual(p)
    expect(p.players.find((s) => s.id === 0)?.alive).toBe(false)
  })
})

describe('a seat’s own projection', () => {
  it('carries exactly one role, its own, and only once the cards are dealt', () => {
    let state = secretNight()
    state = castVote(state, 3, 0)
    for (const locale of LOCALES) {
      const mine = seatProjection(state, 2, locale, { dealt: true })!
      const json = JSON.stringify(mine)
      expect(mine.roleId).toBe('INSPECT')
      expect(json.split('"INSPECT"').length - 1).toBe(1)
      for (const id of ROLE_IDS) if (id !== 'INSPECT') expect(json, id).not.toContain(`"${id}"`)
      expect(json).not.toContain('voter')
      expect(json).not.toContain('"public"')
      // The eligible list is names, not roles, and never the seat itself.
      expect(mine.eligible.map((e) => e.id)).not.toContain(2)
      expect(mine.canVote).toBe(true)
      expect(mine.vote).toBeNull()
      expect(seatProjection(state, 3, locale, { dealt: true })!.vote).toBe(0)

      const undealt = seatProjection(state, 2, locale, { dealt: false })!
      expect(undealt.roleId).toBeNull()
      expect(undealt.trade).toBeNull()
    }
  })

  it('knows the silenced cannot vote and the dead are out', () => {
    let state = secretNight()
    const silenced = seatProjection(state, 6, 'en', { dealt: true })!
    expect(silenced.canVote).toBe(false)
    expect(silenced.eligible).toEqual([])
    state = lynch(state, 5)
    const dead = seatProjection(state, 5, 'en', { dealt: true })!
    expect(dead.alive).toBe(false)
    expect(dead.canVote).toBe(false)
    expect(seatProjection(state, 99, 'en', { dealt: true })).toBeNull()
  })

  it('has a shape for a seat that exists only as a name so far', () => {
    const w = waitingSeat(3, 'Dani', 'es')
    expect(w.roleId).toBeNull()
    expect(w.phase).toBe('setup')
    expect(JSON.parse(JSON.stringify(w))).toEqual(w)
  })
})

describe('a seat’s night', () => {
  /** Night one, stopped at the Arsonist's step: the Bodyguard has shielded Fer, the Detective has looked at Ana. */
  const midnight = (): GameState => {
    let state = createGame(
      cast(['CONVERT', 'KILLER', 'INSPECT', 'GUARD', 'SILENCE', 'PLAIN', 'PLAIN'],
           ['Ana', 'Beto', 'Caro', 'Dani', 'Eva', 'Fer', 'Gus']),
    )
    state = startNight(state)
    state = recordAction(state, { kind: 'target', roleId: 'GUARD', actor: 3, target: 5 })
    state = recordAction(state, { kind: 'target', roleId: 'INSPECT', actor: 2, target: 0 })
    return state
  }
  const tonight = (state: GameState, seat: number, picked: number[] = []): SeatNight =>
    seatProjection(state, seat, 'en', { dealt: true, picked })!.tonight!
  const rolesIn = (state: GameState, seat: number): Set<RoleId> => {
    const json = JSON.stringify(seatProjection(state, seat, 'en', { dealt: true }))
    return new Set(ROLE_IDS.filter((id) => json.includes(`"${id}"`)))
  }

  it('tells every phone the step being read, and each only what its own card knows', () => {
    const s = midnight()
    const citizen = tonight(s, 5)
    expect(citizen).toEqual({
      step: 'SILENCE', acting: false,
      view: { self: [5], crew: [], doomed: [], marked: [] },
      eligible: [], vials: null, convertLeft: null, victim: null, spare: [], looked: null,
    })
    expect(rolesIn(s, 5)).toEqual(new Set(['PLAIN', 'SILENCE']))
    expect(seatProjection(s, 5, 'en', { dealt: true })!.players.map((p) => p.name)).toEqual(['Ana', 'Beto', 'Caro', 'Dani', 'Eva', 'Fer', 'Gus'])

    const arsonist = tonight(s, 4)
    expect(arsonist.acting).toBe(true)
    expect(arsonist.eligible).toEqual(legalTargets(s, 'SILENCE').map((p) => p.id))
    expect(arsonist.eligible).not.toContain(4)

    const detective = tonight(s, 2)
    expect(detective.acting).toBe(false)
    expect(detective.looked).toEqual({ target: 0, roleId: 'CONVERT' })
    expect(rolesIn(s, 2)).toEqual(new Set(['INSPECT', 'SILENCE', 'CONVERT']))
    expect(tonight(s, 3).looked).toBeNull()
  })

  it('shows the Family its Family and its mark, and nobody else either', () => {
    let s = recordAction(midnight(), { kind: 'target', roleId: 'SILENCE', actor: 4, target: 6 })
    const family = tonight(s, 1, [5])
    expect(family.step).toBe('KILLER')
    expect(family.acting).toBe(true)
    expect(family.view).toEqual({ self: [], crew: [0, 1], doomed: [], marked: [5] })
    expect(family.eligible).toEqual([2, 3, 4, 5, 6])
    const godfather = tonight(s, 0, [5])
    expect(godfather.acting).toBe(true)
    expect(godfather.view.marked).toEqual([5])
    expect(godfather.convertLeft).toBe(true)
    expect(godfather.victim).toBeNull()
    expect(tonight(s, 3, [5]).view).toEqual({ self: [3], crew: [], doomed: [], marked: [] })
    expect(tonight(s, 2, [5]).view.marked).toEqual([])

    s = recordAction(s, { kind: 'target', roleId: 'KILLER', actor: 1, target: 5 })
    const deciding = tonight(s, 0)
    expect(deciding.step).toBe('CONVERT')
    expect(deciding.acting).toBe(true)
    expect(deciding.victim).toBe(5)
    expect(deciding.view.marked).toEqual([5])
    expect(deciding.eligible).toEqual([])
    const done = tonight(s, 1)
    expect(done.acting).toBe(false)
    expect(done.victim).toBeNull()
    expect(done.view.marked).toEqual([])
  })

  it('gives the Apothecary the doomed at her step alone, and the dead a plain night', () => {
    let s = startNight(createGame(cast(['KILLER', 'MEDIC', 'GUARD', 'PLAIN', 'PLAIN'])))
    expect(tonight(s, 1)).toMatchObject({ step: 'GUARD', acting: false, vials: { heal: true, poison: true } })
    expect(tonight(s, 1).view.doomed).toEqual([])
    s = recordAction(s, { kind: 'target', roleId: 'GUARD', actor: 2, target: 3 })
    s = recordAction(s, { kind: 'target', roleId: 'KILLER', actor: 0, target: 4 })
    const apothecary = tonight(s, 1)
    expect(apothecary.step).toBe('MEDIC')
    expect(apothecary.acting).toBe(true)
    expect(apothecary.view.doomed).toEqual([4])
    expect(apothecary.eligible).toEqual([0, 1, 2, 3, 4])
    expect(tonight({ ...s, healUsed: true }, 1).vials).toEqual({ heal: false, poison: true })

    const dead = { ...s, players: s.players.map((p) => (p.id === 0 ? { ...p, alive: false } : p)) }
    expect(tonight(dead, 0)).toMatchObject({ acting: false, eligible: [], view: { self: [0], crew: [], doomed: [], marked: [] } })
  })

  it('has no night by day, before the deal, or for a seat that is only a name', () => {
    let s = midnight()
    expect(seatProjection(s, 5, 'en', { dealt: false })!.tonight).toBeNull()
    while (currentStep(s) !== null) s = recordAction(s, { kind: 'skip', roleId: currentStep(s) as RoleId })
    s = endNight(s)
    expect(seatProjection(s, 5, 'en', { dealt: true })!.tonight).toBeNull()
    expect(waitingSeat(3, 'Dani', 'es').tonight).toBeNull()
  })
})
