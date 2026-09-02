import { describe, expect, it } from 'vitest'
import { dayMarkup, legalTargets, nightMarkup, picksNeeded, playerViewMarkup, questionCardMarkup, questionsIntroMarkup } from './night'
import { createGame, startNight, type PlayerSetup } from '../../engine/state'
import { LOCALES, strings } from '../../i18n'
import { ROLE_IDS, type RoleId } from '../../engine/roles'
import type { GameState, NightAction } from '../../engine/types'

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
    // The cure only ever unlocks on someone about to die; the poison on anyone.
    const html = nightMarkup(afterHit(state, 2), 'en', [2])
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

  it('leaves the circle/list switch to the menu, not the stage', () => {
    // One home for the switch: the menu's segmented control. A second icon in
    // the header was confusing and is gone.
    expect(nightMarkup(state, 'en', [])).not.toContain('data-layout')
    expect(nightMarkup(state, 'en', [], 'list')).not.toContain('data-layout')
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

describe('the questions round', () => {
  const game = createGame(setup(['MEDIC', 'KILLER', 'PLAIN']))
  const player = { ...game.players[0]!, name: 'Eva', hasQuestion: true }

  it('shows the role, both explanations and a way to mark it answered', () => {
    const html = questionCardMarkup(player, 'en', 1, 2)
    expect(html).toContain('Eva')
    expect(html).toContain(strings('en').roles.MEDIC.name)
    expect(html).toContain(strings('en').roles.MEDIC.brief)
    expect(html).toContain(strings('en').roles.MEDIC.detail)
    expect(html).toContain('data-question-done')
    expect(html).toContain(strings('en').ui.night.stepCounter(1, 2))
  })

  it('escapes the player name', () => {
    const html = questionCardMarkup({ ...player, name: '<b>x</b>' }, 'en')
    expect(html).not.toContain('<b>x</b>')
  })

  it('introduces the round with everyone waiting and starts with the first', () => {
    const flagged = [player, { ...game.players[2]!, name: 'Gil', hasQuestion: true }]
    const html = questionsIntroMarkup(flagged, 'en')
    expect(html).toContain('Eva')
    expect(html).toContain('Gil')
    expect(html).toContain(`data-ask="${player.id}"`)
    expect(html).toContain(strings('en').ui.reveal.showRoleTo('Eva'))
  })
})

describe('day screen controls', () => {
  it('keeps undo available, so a wrong execution is one tap to fix', () => {
    const state = atRole(['KILLER', 'PLAIN', 'INSPECT'], 'KILLER')
    expect(dayMarkup({ ...state, phase: 'day' }, 'en')).toContain('data-undo')
  })

  it('makes flagged players tappable rather than just listing them', () => {
    const state = atRole(['KILLER', 'PLAIN', 'INSPECT'], 'KILLER')
    const flagged = { ...state, players: state.players.map((p) => (p.id === 1 ? { ...p, hasQuestion: true } : p)) }
    expect(dayMarkup(flagged, 'en')).toContain('data-ask="1"')
  })
})

/** The same night, with the Family's pick already recorded. */
const afterHit = (state: GameState, target: number): GameState => {
  const hit: NightAction = { kind: 'target', roleId: 'KILLER', actor: 1, target }
  return { ...state, pending: [...state.pending, hit] }
}

describe('the Godfather’s step', () => {
  const base = atRole(['KILLER', 'CONVERT', 'PLAIN', 'INSPECT', 'GUARD'], 'CONVERT')

  it('names the victim and offers both outcomes', () => {
    // The only button used to be Confirm: no way to record "let the hit go
    // ahead", so the Godfather converted every night he was prompted.
    const html = nightMarkup(afterHit(base, 2), 'en')
    expect(html).toContain(strings('en').ui.night.convertOffer('P2'))
    expect(html).toContain('data-night-confirm')
    expect(html).toContain('data-skip')
    expect(html).toMatch(/data-accent="town"[^>]*data-selected/)
  })

  it('has nothing to convert when the Family chose no one', () => {
    const html = nightMarkup(base, 'en')
    expect(html).toContain(strings('en').ui.night.convertNoVictim)
    expect(html).not.toContain('data-night-confirm')
    expect(html).toContain('data-skip')
  })
})

describe('the Associate’s step', () => {
  it('offers the two sides, not a bare Confirm', () => {
    const html = nightMarkup(atRole(['PICK_SIDE', 'KILLER', 'PLAIN', 'INSPECT'], 'PICK_SIDE'), 'en')
    expect(html).toContain('data-choose-role="KILLER"')
    expect(html).toContain('data-choose-role="PLAIN"')
    expect(html).not.toContain('data-night-confirm')
  })
})

describe('the vials', () => {
  const state = afterHit(atRole(['MEDIC', 'KILLER', 'PLAIN', 'INSPECT'], 'MEDIC'), 2)
  const vial = (html: string, kind: string) =>
    html.match(new RegExp(`data-potion="${kind}"[^>]*`))?.[0] ?? ''

  it('offers the cure only on someone about to die', () => {
    expect(vial(nightMarkup(state, 'en', [3]), 'heal')).toContain('disabled')
    expect(vial(nightMarkup(state, 'en', [2]), 'heal')).not.toContain('disabled')
    // The poison goes on anyone.
    expect(vial(nightMarkup(state, 'en', [3]), 'kill')).not.toContain('disabled')
  })

  it('marks who is set to die on the narrator’s table', () => {
    const html = nightMarkup(state, 'en')
    expect(html).toMatch(/data-target="2"[^>]*data-doomed/)
    expect(html).not.toMatch(/data-target="3"[^>]*data-doomed/)
  })

  it('locks a spent vial', () => {
    const heal = vial(nightMarkup({ ...state, healUsed: true }, 'en', [2]), 'heal')
    expect(heal).toContain('disabled')
    expect(heal).toContain('data-spent')
    expect(vial(nightMarkup({ ...state, poisonUsed: true }, 'en', [3]), 'kill')).toContain('disabled')
  })

  it('puts both vials away once both are spent', () => {
    const html = nightMarkup({ ...state, healUsed: true, poisonUsed: true }, 'en', [2])
    expect(html).not.toContain('data-potion')
    expect(html).toContain(strings('en').ui.night.bothSpent)
    expect(html).toContain('data-skip')
  })
})

describe('the player’s view', () => {
  const roles: RoleId[] = ['MEDIC', 'KILLER', 'PLAIN', 'INSPECT', 'CONVERT', 'GUARD']
  const crewCount = (html: string) => (html.match(/data-crew/g) ?? []).length

  /** Every role name but the viewer's own, in one language. */
  const otherNames = (locale: (typeof LOCALES)[number], own: RoleId) =>
    ROLE_IDS.filter((id) => id !== own).map((id) => strings(locale).roles[id].name)

  it('shows the Santera who is set to die, and nobody’s role', () => {
    for (const locale of LOCALES) {
      const html = playerViewMarkup(afterHit(atRole(roles, 'MEDIC'), 2), locale)
      expect(html).toContain(strings(locale).ui.view.doomed(['P2']))
      expect(html).toMatch(/data-doomed/)
      expect(html).not.toContain('data-team')
      expect(html).not.toContain('seat__role')
      expect(crewCount(html)).toBe(0)
      for (const name of otherNames(locale, 'MEDIC')) {
        expect(html, `${locale}/${name}`).not.toContain(name)
      }
    }
  })

  it('tells the Santera when no one is dying, and which vials she has left', () => {
    const html = playerViewMarkup({ ...atRole(roles, 'MEDIC'), healUsed: true }, 'en')
    expect(html).toContain(strings('en').ui.view.doomedNone)
    expect(html).toContain(strings('en').ui.view.cureSpent)
    expect(html).toContain(strings('en').ui.view.poisonLeft)
  })

  it('shows the Family the Family: all of it in one red, with no role and no “you”', () => {
    // Which red seat is the Godfather is not the Family's to know.
    const html = playerViewMarkup(atRole(roles, 'KILLER'), 'en')
    expect(crewCount(html)).toBe(2)
    expect(html).not.toContain('data-self')
    expect(html).not.toContain('seat__role')
    expect(html).not.toContain(strings('en').roles.CONVERT.name)
    expect(html).not.toContain(strings('en').roles.INSPECT.name)
  })

  it('shows the Godfather the Family’s pick', () => {
    const html = playerViewMarkup(afterHit(atRole(roles, 'CONVERT'), 2), 'en')
    expect(html).toContain(strings('en').ui.view.victim('P2'))
    expect(html).toMatch(/data-selected/)
    expect(html).toContain(strings('en').ui.view.convertLeft)
    expect(crewCount(html)).toBe(2)
  })

  it('shows a town role a plain table with their own seat', () => {
    for (const locale of LOCALES) {
      const html = playerViewMarkup(atRole(roles, 'GUARD'), locale)
      expect((html.match(/data-self/g) ?? []).length).toBe(1)
      expect(crewCount(html)).toBe(0)
      expect(html).not.toContain('data-doomed')
      expect(html).not.toContain('data-team')
      for (const name of otherNames(locale, 'GUARD')) {
        expect(html, `${locale}/${name}`).not.toContain(name)
      }
    }
  })

  it('keeps the dead visible but never their side', () => {
    const state = atRole(roles, 'GUARD')
    const withDead = {
      ...state,
      players: state.players.map((p) => (p.id === 1 ? { ...p, alive: false } : p)),
    }
    const html = playerViewMarkup(withDead, 'en')
    expect(html).toContain('data-dead')
    expect(html).not.toContain('data-team')
  })

  it('carries no narrator control, and a way back', () => {
    const html = playerViewMarkup(afterHit(atRole(roles, 'MEDIC'), 2), 'en')
    expect(html).not.toContain('data-undo')
    expect(html).not.toContain('data-target')
    expect(html).not.toContain('data-show-player')
    expect(html).toContain('data-view-done')
  })
})

describe('the narrator’s night header', () => {
  it('has a way to turn the phone to the player', () => {
    const html = nightMarkup(atRole(['KILLER', 'PLAIN', 'INSPECT'], 'KILLER'), 'en')
    expect(html).toContain('data-show-player')
  })
})

describe('the Chameleon’s step', () => {
  const state = atRole(['SWAP', 'KILLER', 'PLAIN', 'INSPECT', 'GUARD'], 'SWAP')

  it('lists the cards left in the centre and a way to keep his own', () => {
    const html = nightMarkup(state, 'en')
    expect(html).toContain('data-choose-role="MEDIC"')
    expect(html).not.toContain('data-choose-role="INSPECT"')
    expect(html).not.toContain('data-choose-role="KILLER"')
    expect(html).toContain(strings('en').ui.night.keepCard)
    expect(html).not.toContain('data-night-confirm')
  })

  it('shows him the centre in his own view', () => {
    const html = playerViewMarkup(state, 'en')
    expect(html).toContain(strings('en').roles.MEDIC.name)
    expect(html).not.toContain(strings('en').roles.INSPECT.name)
  })
})

describe('the Cultist’s step', () => {
  const state = atRole(['SPLIT', 'KILLER', 'PLAIN', 'INSPECT'], 'SPLIT')
  const confirm = (html: string) => html.match(/data-split-confirm[^>]*/)?.[0] ?? ''

  it('lets every living player be tapped into the first faction', () => {
    const html = nightMarkup(state, 'en', [1])
    expect(html).toContain(strings('en').ui.night.splitHint)
    expect(html).toMatch(/data-target="1"[\s\S]*?data-selected/)
    expect(html).toMatch(/data-target="3"/)
  })

  it('locks Confirm until both factions have someone', () => {
    expect(confirm(nightMarkup(state, 'en', []))).toContain('disabled')
    expect(confirm(nightMarkup(state, 'en', [1, 2]))).not.toContain('disabled')
    expect(confirm(nightMarkup(state, 'en', [0, 1, 2, 3]))).toContain('disabled')
  })

  it('shows the Cultist both factions as they form', () => {
    const html = playerViewMarkup(state, 'en', [1, 2])
    expect(html).toContain(strings('en').ui.view.sectOne(['P1', 'P2']))
    expect(html).toContain(strings('en').ui.view.sectTwo(['P0', 'P3']))
  })
})

describe('the Renegade’s targets', () => {
  it('include his own side but not himself', () => {
    // He was barred from the Family along with the killers, which removed the
    // one thing his card is for.
    const state = night(['ROGUE', 'KILLER', 'CONVERT', 'PLAIN'])
    const rogue = legalTargets(state, 'ROGUE').map((p) => p.id)
    expect(rogue).toContain(1)
    expect(rogue).toContain(2)
    expect(rogue).toContain(3)
    expect(rogue).not.toContain(0)
    // The Family itself still never eats its own.
    expect(legalTargets(state, 'KILLER').map((p) => p.id)).toEqual([3])
  })
})
