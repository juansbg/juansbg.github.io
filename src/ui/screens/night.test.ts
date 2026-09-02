import { describe, expect, it } from 'vitest'
import { legalTargets, nightMarkup, picksNeeded } from './night'
import { createGame, startNight, type PlayerSetup } from '../../engine/state'
import { strings } from '../../i18n'
import type { RoleId } from '../../engine/roles'

const setup = (roles: RoleId[]): PlayerSetup[] =>
  roles.map((roleId, i) => ({ name: `P${i}`, roleId }))

const night = (roles: RoleId[]) => startNight(createGame(setup(roles)))

/**
 * A night parked on a specific role's step.
 *
 * Roles are prompted in script order, not cast order, so seek the step rather
 * than assuming the role under test happens to come first.
 */
const atRole = (roles: RoleId[], roleId: RoleId) => {
  const state = night(roles)
  const stepIndex = state.schedule.indexOf(roleId)
  if (stepIndex === -1) throw new Error(`${roleId} is not scheduled on night 1`)
  return { ...state, stepIndex }
}

describe('how many players a role must pick', () => {
  it('needs one for a plain target and for the potion', () => {
    expect(picksNeeded('INSPECT')).toBe(1)
    // The potion is spent ON someone — it cannot fire without a target.
    expect(picksNeeded('MEDIC')).toBe(1)
  })

  it('needs two for the Binding', () => {
    expect(picksNeeded('PAIR')).toBe(2)
  })

  it('needs none for a role that takes no target', () => {
    expect(picksNeeded('CONVERT')).toBe(0)
  })
})

describe('the potion step', () => {
  const state = atRole(['MEDIC', 'KILLER', 'PLAIN', 'INSPECT'], 'MEDIC')

  it('locks both vials until a target is chosen', () => {
    const html = nightMarkup(state, 'en', [])
    const heal = html.match(/data-potion="heal"[^>]*/)?.[0] ?? ''
    const kill = html.match(/data-potion="kill"[^>]*/)?.[0] ?? ''

    expect(heal).toContain('disabled')
    expect(kill).toContain('disabled')
  })

  it('unlocks them once exactly one player is chosen', () => {
    const html = nightMarkup(state, 'en', [2])
    expect(html.match(/data-potion="heal"[^>]*/)?.[0]).not.toContain('disabled')
    expect(html.match(/data-potion="kill"[^>]*/)?.[0]).not.toContain('disabled')
  })

  it('marks the chosen player in the circle', () => {
    const html = nightMarkup(state, 'en', [2])
    // Seat 2 is chosen; seat 1 is offered but not chosen.
    expect(html).toMatch(/data-target="2"[\s\S]*?data-selected/)
    expect(html).toMatch(/data-target="1"/)
  })

  it('marks the chosen player in the list too', () => {
    const html = nightMarkup(state, 'en', [2], 'list')
    expect(html).toMatch(/data-target="2"\s+data-picked/)
    expect(html).not.toMatch(/data-target="1"\s+data-picked/)
  })

  it('labels the vials rather than repeating the role name', () => {
    const html = nightMarkup(state, 'en', [2])
    expect(html).toContain(strings('en').ui.night.heal)
    expect(html).toContain(strings('en').ui.night.poison)
  })
})

describe('the Binding step', () => {
  const state = atRole(['PAIR', 'KILLER', 'PLAIN', 'INSPECT'], 'PAIR')

  it('prompts for two players', () => {
    expect(nightMarkup(state, 'en', [])).toContain(strings('en').ui.night.pickTwo)
  })

  it('keeps prompting after only one is chosen', () => {
    const html = nightMarkup(state, 'en', [1])
    expect(html).toContain(strings('en').ui.night.pickTwo)
    expect(html).toMatch(/data-target="1"[\s\S]*?data-selected/)
  })

  it('stops prompting once two are chosen', () => {
    expect(nightMarkup(state, 'en', [1, 2])).not.toContain(strings('en').ui.night.pickTwo)
  })
})

describe('legal targets', () => {
  it('stops the killers from eating their own', () => {
    const state = atRole(['KILLER', 'CONVERT', 'PLAIN'], 'KILLER')
    const ids = legalTargets(state, 'KILLER').map((p) => p.id)
    expect(ids).toEqual([2])
  })

  it('lets the bodyguard shield himself', () => {
    const state = atRole(['GUARD', 'KILLER', 'PLAIN'], 'GUARD')
    expect(legalTargets(state, 'GUARD').map((p) => p.id)).toContain(0)
  })

  it('stops the bodyguard repeating last night’s target', () => {
    let state = atRole(['GUARD', 'KILLER', 'PLAIN'], 'GUARD')
    state = {
      ...state,
      players: state.players.map((p) => (p.id === 2 ? { ...p, protectedLastNight: true } : p)),
    }
    expect(legalTargets(state, 'GUARD').map((p) => p.id)).not.toContain(2)
  })

  it('excludes the dead', () => {
    let state = atRole(['INSPECT', 'KILLER', 'PLAIN'], 'INSPECT')
    state = {
      ...state,
      players: state.players.map((p) => (p.id === 2 ? { ...p, alive: false } : p)),
    }
    expect(legalTargets(state, 'INSPECT').map((p) => p.id)).not.toContain(2)
  })
})

describe('choosing from the circle', () => {
  const state = atRole(['KILLER', 'CONVERT', 'PLAIN', 'INSPECT', 'GUARD'], 'KILLER')

  it('defaults to the circle, not a list', () => {
    const html = nightMarkup(state, 'en', [])
    expect(html).toContain('class="circle')
    expect(html).not.toContain('class="targets"')
  })

  it('offers only legal targets, and dims the rest in place', () => {
    // The killers cannot eat their own, but their seats must still show —
    // the table layout is the point of the circle.
    const html = nightMarkup(state, 'en', [])
    expect(html).toMatch(/data-target="2"/)
    expect(html).not.toMatch(/data-target="1"/)
    expect(html).toContain('data-ineligible')
  })

  it('keeps every player on screen in either layout', () => {
    for (const layout of ['circle', 'list'] as const) {
      const html = nightMarkup(state, 'en', [], layout)
      // The circle shows all five seats; the list shows only the choosable.
      const seats = (html.match(/class="seat"/g) ?? []).length
      const rows = (html.match(/class="target"/g) ?? []).length
      expect(layout === 'circle' ? seats : rows).toBeGreaterThan(0)
    }
  })

  it('offers a way back to the other layout', () => {
    expect(nightMarkup(state, 'en', [])).toContain('data-layout')
    expect(nightMarkup(state, 'en', [], 'list')).toContain('data-layout')
  })

  it('never offers a dead player', () => {
    const withDead = {
      ...state,
      players: state.players.map((p) => (p.id === 2 ? { ...p, alive: false } : p)),
    }
    const html = nightMarkup(withDead, 'en', [])
    expect(html).not.toMatch(/data-target="2"/)
    expect(html).toContain('data-dead')
  })
})
