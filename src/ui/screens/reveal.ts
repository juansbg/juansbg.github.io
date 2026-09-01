import { ROLES } from '../../engine/roles'
import type { Player } from '../../engine/types'
import { strings, type Locale } from '../../i18n'
import { buzz, esc } from '../dom'

/**
 * Pass-the-phone role reveal.
 *
 * Three states, in order:
 *   handoff  — "Pass the phone to Ana". No role information on screen at all.
 *   confirm  — "Are you Ana?" so the wrong person cannot walk into a reveal.
 *   reveal   — visible ONLY while a finger is held down.
 *
 * Press-and-hold is the whole security model. A tap-to-reveal screen can be
 * left face-up on a table, handed over still showing, or screenshotted by the
 * next player; a held reveal cannot outlive the hand holding it. Releasing
 * hides the role immediately and returns to the handoff state.
 */

export type RevealPhase = 'handoff' | 'confirm' | 'revealed'

export interface RevealProps {
  player: Player
  /** 1-based position in the pass-around; null in single-player mode. */
  position: number | null
  total: number | null
  phase: RevealPhase
  locale: Locale
  mode: 'onboarding' | 'single'
}

export const revealMarkup = (props: RevealProps): string => {
  const t = strings(props.locale)
  const { player, phase } = props
  const role = ROLES[player.roleId]
  const roleStrings = t.roles[player.roleId]

  const progress =
    props.position !== null && props.total !== null
      ? `<p class="reveal__progress">${t.ui.night.stepCounter(props.position, props.total)}</p>`
      : ''

  if (phase === 'handoff') {
    return `
      <section class="reveal reveal--handoff" data-phase="handoff">
        ${progress}
        <p class="reveal__lead">${esc(t.ui.reveal.passTo(player.name))}</p>
        <button class="btn btn--primary reveal__advance" type="button" data-confirm>
          ${esc(t.ui.reveal.areYou(player.name))}
        </button>
      </section>
    `
  }

  if (phase === 'confirm') {
    return `
      <section class="reveal reveal--confirm" data-phase="confirm">
        ${progress}
        <p class="reveal__lead">${esc(t.ui.reveal.areYou(player.name))}</p>
        <button class="reveal__hold" type="button" data-hold aria-describedby="holdHint">
          <span class="reveal__hold-ring" aria-hidden="true"></span>
          <span class="reveal__hold-label">${esc(t.ui.reveal.holdToReveal)}</span>
        </button>
        <p class="reveal__hint" id="holdHint">${esc(t.ui.reveal.shieldScreen)}</p>
        <button class="btn btn--ghost" type="button" data-back>${esc(t.ui.common.back)}</button>
      </section>
    `
  }

  const team = role.team === 'crew' ? t.ui.reveal.teamCrew : t.ui.reveal.teamTown

  return `
    <section class="reveal reveal--open" data-phase="revealed" style="--role: var(--role-${player.roleId})">
      <p class="reveal__owner">${esc(player.name)}</p>
      <p class="reveal__label">${esc(t.ui.reveal.yourRole)}</p>
      <h2 class="reveal__role">${esc(roleStrings.name)}</h2>
      <p class="reveal__team" data-team="${role.team}">${esc(team)}</p>
      <p class="reveal__prompt">${esc(roleStrings.prompt)}</p>
      <p class="reveal__hint reveal__hint--holding">${esc(t.ui.reveal.keepHolding)}</p>
    </section>
  `
}

/**
 * Wires the hold gesture.
 *
 * Pointer events cover mouse, touch and pen in one path. `pointercancel` and
 * `pointerleave` matter as much as `pointerup`: a finger sliding off the
 * button, or the OS stealing the gesture for a scroll, must hide the role
 * exactly as releasing does.
 */
export const bindHold = (
  root: ParentNode,
  onReveal: () => void,
  onHide: () => void,
): void => {
  const button = root.querySelector<HTMLElement>('[data-hold]')
  if (!button) return

  let held = false

  const start = (event: PointerEvent): void => {
    event.preventDefault()
    if (held) return
    held = true
    buzz(15)
    onReveal()
  }

  const end = (): void => {
    if (!held) return
    held = false
    onHide()
  }

  button.addEventListener('pointerdown', start)
  for (const type of ['pointerup', 'pointercancel', 'pointerleave'] as const) {
    button.addEventListener(type, end)
  }
  // A held role must not survive the app being backgrounded.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) end()
  })
}

/** While revealed, releasing anywhere hides — the finger may drift off. */
export const bindRelease = (onHide: () => void): (() => void) => {
  const end = (): void => onHide()
  for (const type of ['pointerup', 'pointercancel'] as const) {
    window.addEventListener(type, end)
  }
  return () => {
    for (const type of ['pointerup', 'pointercancel'] as const) {
      window.removeEventListener(type, end)
    }
  }
}
