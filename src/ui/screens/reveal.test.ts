// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { bindHold, revealMarkup, roleCardMarkup, type RevealPhase } from './reveal'
import { strings, LOCALES } from '../../i18n'
import { esc } from '../dom'
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
  hasQuestion: false,
  trade: null,
})

const markup = (phase: RevealPhase, roleId: RoleId = 'KILLER') =>
  revealMarkup({
    player: player(roleId),
    position: 1,
    total: 6,
    phase,
    locale: 'en',
    mode: 'onboarding',
    canGoBack: false,
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
          canGoBack: false,
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
    const html = roleCardMarkup(player('MEDIC'), 'en')
    expect(html).toContain(strings('en').roles.MEDIC.name)
    expect(html).toContain(strings('en').roles.MEDIC.brief)
    expect(html).toContain(strings('en').ui.reveal.teamTown)
  })

  it('marks a crew member as crew', () => {
    expect(roleCardMarkup(player('KILLER'), 'en')).toContain(strings('en').ui.reveal.teamCrew)
  })

  // A citizen's trade is on the held card, under the role, and nowhere the
  // trade could be read before the hold: it is a secret the town has to earn.
  it.each(LOCALES)('names a citizen’s trade on the card only (%s)', (locale) => {
    const t = strings(locale)
    const citizen = { ...player('PLAIN'), trade: 3 }
    expect(roleCardMarkup(citizen, locale)).toContain(esc(t.trades[3]!))
    expect(roleCardMarkup(player('INSPECT'), locale)).not.toContain('reveal__trade')
    for (const phase of ['handoff', 'confirm'] as const) {
      const before = revealMarkup({
        player: citizen, position: 1, total: 3, phase, locale, mode: 'onboarding', canGoBack: false,
      })
      expect(before, `${locale}/${phase}`).not.toContain(esc(t.trades[3]!))
    }
  })

  // The rules for first-timers are the role's own detail, the text the
  // narrator reads to a player who flagged a question, so the two cannot
  // drift. They live on the held card only.
  it.each(LOCALES)('carries the fuller rules under the brief, and nowhere before the hold (%s)', (locale) => {
    const t = strings(locale)
    for (const roleId of Object.keys(t.roles) as RoleId[]) {
      const card = roleCardMarkup(player(roleId), locale)
      expect(card, `${locale}/${roleId}`).toContain(t.ui.reveal.howItPlays)
      // Names and apostrophes are escaped on the way in, so compare escaped.
      expect(card, `${locale}/${roleId}`).toContain(esc(t.roles[roleId].detail))
      for (const phase of ['handoff', 'confirm'] as const) {
        const before = revealMarkup({
          player: player(roleId), position: 1, total: 6, phase, locale, mode: 'onboarding', canGoBack: false,
        })
        expect(before, `${locale}/${roleId}/${phase}`).not.toContain(esc(t.roles[roleId].detail))
        expect(before, `${locale}/${roleId}/${phase}`).not.toContain(t.ui.reveal.howItPlays)
      }
    }
  })

  it('is not present in the confirm screen it is injected into', () => {
    // The card is written into an empty slot on press, so the confirm markup
    // itself must still carry nothing.
    const confirm = markup('confirm', 'KILLER')
    expect(confirm).toContain('data-card')
    expect(confirm).not.toContain(strings('en').roles.KILLER.name)
  })

  it('escapes player names rather than trusting them as markup', () => {
    const html = revealMarkup({
      player: player('PLAIN', '<img src=x onerror=alert(1)>'),
      position: 1,
      total: 2,
      phase: 'handoff',
      locale: 'en',
      mode: 'onboarding',
      canGoBack: false,
    })
    expect(html).not.toContain('<img')
    expect(html).toContain('&lt;img')
  })
})

describe('the charge-to-reveal gesture', () => {
  let revealed: number
  let hidden: number
  const HOLD = 20
  // bindHold attaches window and document listeners; without tearing them
  // down between cases, closures from earlier tests keep counting.
  const teardowns: Array<() => void> = []

  beforeEach(() => {
    document.body.innerHTML =
      '<section data-reveal-root><div data-card></div><button data-hold>hold</button></section>'
    revealed = 0
    hidden = 0
  })

  afterEach(() => {
    while (teardowns.length > 0) teardowns.pop()?.()
  })

  const wire = () => {
    const teardown = bindHold(
      document.body,
      { onReveal: () => { revealed += 1 }, onHide: () => { hidden += 1 } },
      HOLD,
    )
    teardowns.push(teardown)
    return teardown
  }

  const fire = (type: string) =>
    document.querySelector('[data-hold]')!
      .dispatchEvent(new Event(type, { bubbles: true, cancelable: true }))

  const settle = () => new Promise((r) => setTimeout(r, HOLD * 2))

  it('reveals nothing until the bar has filled', async () => {
    wire()
    fire('pointerdown')
    expect(revealed).toBe(0)

    await settle()
    expect(revealed).toBe(1)
  })

  it('ignores a misspress that ends before the bar fills', async () => {
    // The whole point of the timer: a stray tap must reveal nothing at all,
    // and must not advance past anyone.
    wire()
    fire('pointerdown')
    fire('pointerup')

    await settle()
    expect(revealed).toBe(0)
    expect(hidden).toBe(0)
  })

  it('hides on release, without advancing', async () => {
    wire()
    fire('pointerdown')
    await settle()
    fire('pointerup')

    expect(revealed).toBe(1)
    expect(hidden).toBe(1)
  })

  it('can be charged again after releasing', async () => {
    wire()
    fire('pointerdown')
    await settle()
    fire('pointerup')

    fire('pointerdown')
    await settle()
    expect(revealed).toBe(2)
  })

  it('hides when the finger slides off, and when the OS cancels', async () => {
    wire()
    fire('pointerdown')
    await settle()
    fire('pointerleave')
    expect(hidden).toBe(1)

    fire('pointerdown')
    await settle()
    fire('pointercancel')
    expect(hidden).toBe(2)
  })

  it('hides when the app is backgrounded mid-hold', async () => {
    wire()
    fire('pointerdown')
    await settle()

    vi.spyOn(document, 'hidden', 'get').mockReturnValue(true)
    document.dispatchEvent(new Event('visibilitychange'))

    expect(hidden).toBe(1)
    vi.restoreAllMocks()
  })

  it('does not hide twice for one release', async () => {
    wire()
    fire('pointerdown')
    await settle()
    fire('pointerup')
    fire('pointerup')
    expect(hidden).toBe(1)
  })

  it('leaves the button mounted while revealing', async () => {
    // On touch, pointerdown gives the button implicit pointer capture, and
    // unmounting a captured element fires pointercancel — indistinguishable
    // from the finger lifting. Re-rendering on reveal therefore revealed and
    // instantly skipped on every phone while working with a mouse.
    let mounted = false
    teardowns.push(bindHold(
      document.body,
      {
        onReveal: () => {
          document.querySelector('[data-card]')!.innerHTML = '<div>role</div>'
          mounted = document.body.contains(document.querySelector('[data-hold]'))
        },
        onHide: () => {},
      },
      HOLD,
    ))

    fire('pointerdown')
    await settle()
    expect(mounted).toBe(true)
  })

  it('stops its timer when torn down', async () => {
    const teardown = wire()
    fire('pointerdown')
    teardown()
    await settle()
    expect(revealed).toBe(0)
  })
})
