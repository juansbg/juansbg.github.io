import { describe, expect, it } from 'vitest'
import { tvProjection } from './projections'
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

  it('is plain JSON that survives a round trip', () => {
    const state = lynch(secretNight(), 0)
    const p = tvProjection(state, 'es', { timer: { phase: 'running', seconds: 42, endsAt: null } })
    expect(JSON.parse(JSON.stringify(p))).toEqual(p)
    expect(p.players.find((s) => s.id === 0)?.alive).toBe(false)
  })
})
