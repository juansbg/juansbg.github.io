// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { bindHold, revealMarkup, type RevealPhase } from './reveal'
import { strings, LOCALES } from '../../i18n'
import type { Player } from '../../engine/types'
import type { RoleId } from '../../engine/roles'

const player = (roleId: RoleId, name = 'Ana'): Player => ({
  id: 0,
  name,
  roleId,
  alive: true,
  protectedTonight: false,
  protectedLastNight: false,
  wolfAttacksSurvivable: 0,
  loverOf: null,
  silencedOnDay: null,
  extraVotesOnDay: null,
  sect: null,
  fatherOf: null,
})

const markup = (phase: RevealPhase, roleId: RoleId = 'KILLER') =>
  revealMarkup({
    player: player(roleId),
    position: 1,
    total: 6,
    phase,
    locale: 'en',
    mode: 'onboarding',
  })

describe('the reveal never leaks a role early', () => {
  // The whole point of pass-the-phone: someone holding the device before it
  // is their turn must learn nothing. This is the test that matters most in
  // this file.
  it('shows no role name during handoff, in any language', () => {
    for (const locale of LOCALES) {
      for (const roleId of ['KILLER', 'MEDIC', 'CONVERT'] as RoleId[]) {
        const html = revealMarkup({
          player: player(roleId),
          position: 1,
          total: 6,
          phase: 'handoff',
          locale,
          mode: 'onboarding',
        })
        expect(html, `${locale}/${roleId}`).not.toContain(strings(locale).roles[roleId].name)
        expect(html).not.toContain(strings(locale).roles[roleId].prompt)
      }
    }
  })

  it('shows no role name while confirming identity', () => {
    const html = markup('confirm', 'CONVERT')
    expect(html).not.toContain(strings('en').roles.CONVERT.name)
    expect(html).not.toContain(strings('en').roles.CONVERT.prompt)
  })

  it('never leaks the team before the reveal', () => {
    for (const phase of ['handoff', 'confirm'] as RevealPhase[]) {
      const html = markup(phase, 'KILLER')
      expect(html).not.toContain(strings('en').ui.reveal.teamCrew)
      expect(html).not.toContain(strings('en').ui.reveal.teamTown)
    }
  })

  it('names the player being handed to, so the wrong person does not proceed', () => {
    expect(markup('handoff')).toContain('Ana')
  })
})

describe('the revealed card', () => {
  it('shows role, team and what it does', () => {
    const html = markup('revealed', 'MEDIC')
    expect(html).toContain(strings('en').roles.MEDIC.name)
    expect(html).toContain(strings('en').roles.MEDIC.prompt)
    expect(html).toContain(strings('en').ui.reveal.teamTown)
  })

  it('marks a crew member as crew', () => {
    expect(markup('revealed', 'KILLER')).toContain(strings('en').ui.reveal.teamCrew)
  })

  it('escapes player names rather than trusting them as markup', () => {
    const html = revealMarkup({
      player: player('PLAIN', '<img src=x onerror=alert(1)>'),
      position: 1,
      total: 2,
      phase: 'handoff',
      locale: 'en',
      mode: 'onboarding',
    })
    expect(html).not.toContain('<img')
    expect(html).toContain('&lt;img')
  })
})

describe('the hold gesture', () => {
  let root: HTMLElement
  let revealed: number
  let hidden: number

  beforeEach(() => {
    document.body.innerHTML = '<button data-hold>hold</button>'
    root = document.body
    revealed = 0
    hidden = 0
  })

  const wire = () =>
    bindHold(root, () => { revealed += 1 }, () => { hidden += 1 })

  const fire = (type: string) => {
    const event = new Event(type, { bubbles: true, cancelable: true })
    document.querySelector('[data-hold]')!.dispatchEvent(event)
  }

  it('reveals on press and hides on release', () => {
    wire()
    fire('pointerdown')
    expect(revealed).toBe(1)
    expect(hidden).toBe(0)

    fire('pointerup')
    expect(hidden).toBe(1)
  })

  it('hides when the finger slides off the button', () => {
    wire()
    fire('pointerdown')
    fire('pointerleave')
    expect(hidden).toBe(1)
  })

  it('hides when the OS cancels the gesture', () => {
    wire()
    fire('pointerdown')
    fire('pointercancel')
    expect(hidden).toBe(1)
  })

  it('hides when the app is backgrounded mid-hold', () => {
    // Switching apps with a role on screen must not leave it there.
    wire()
    fire('pointerdown')

    vi.spyOn(document, 'hidden', 'get').mockReturnValue(true)
    document.dispatchEvent(new Event('visibilitychange'))

    expect(hidden).toBe(1)
    vi.restoreAllMocks()
  })

  it('does not double-hide on repeated release events', () => {
    wire()
    fire('pointerdown')
    fire('pointerup')
    fire('pointerup')
    expect(hidden).toBe(1)
  })

  it('does not reveal on a release that never had a press', () => {
    wire()
    fire('pointerup')
    expect(revealed).toBe(0)
    expect(hidden).toBe(0)
  })
})
