import { describe, expect, it } from 'vitest'
import { seatProjection, tvProjection, waitingSeat } from './projections'
import { LOCALES } from '../i18n'
import { ROLE_IDS, type RoleId } from '../engine/roles'
import {
  castVote,
  createGame,
  endNight,
  lynch,
  recordAction,
  startNight,
  type PlayerSetup,
} from '../engine/state'
import type { GameState } from '../engine/types'
import { dawnSlides } from '../ui/screens/dawn'

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
    expect(tvProjection(state, 'en', { sealed: false }).tally).toHaveLength(1)
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
