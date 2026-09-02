import { ROLES } from '../../engine/roles'
import type { Player } from '../../engine/types'
import { strings, type Locale } from '../../i18n'
import { buzz, esc } from '../dom'
import { sigilMarkup } from '../sigils'

/**
 * Pass-the-phone role reveal.
 *
 *   handoff  — "Pass the phone to Ana". No role information on screen at all.
 *   confirm  — "Are you Ana?", then hold to charge the reveal.
 *
 * Holding fills a bar over HOLD_MS before the role appears, so a stray tap
 * reveals nothing. Releasing hides the role again but STAYS on the same
 * player — advancing is a separate, deliberate button. An earlier version
 * advanced on release, which meant a fumbled press skipped someone with no
 * way back.
 *
 * The hold button sits below the card, in the thumb zone, so the hand holding
 * it is never covering the role it is revealing.
 *
 * CRITICAL: the button must stay mounted for the whole gesture. On touch,
 * `pointerdown` gives it implicit pointer capture, and unmounting a captured
 * element fires `pointercancel` — indistinguishable from the finger lifting.
 * The card is therefore injected into a slot beside the live button rather
 * than re-rendering the screen.
 */

export type RevealPhase = 'handoff' | 'confirm'

/** How long the finger must stay down before the role appears. */
export const HOLD_MS = 650

export interface RevealProps {
  player: Player
  /** 1-based position in the pass-around; null in single-player mode. */
  position: number | null
  total: number | null
  phase: RevealPhase
  locale: Locale
  mode: 'onboarding' | 'single'
  canGoBack: boolean
}

export const revealMarkup = (props: RevealProps): string => {
  const t = strings(props.locale)
  const { player, phase } = props

  const progress =
    props.position !== null && props.total !== null
      ? `<p class="reveal__progress">${t.ui.night.stepCounter(props.position, props.total)}</p>`
      : ''

  if (phase === 'handoff') {
    const back = props.canGoBack
      ? `<button class="btn btn--ghost" type="button" data-reveal-back>${esc(t.ui.common.back)}</button>`
      : ''

    return `
      <section class="reveal reveal--handoff" data-phase="handoff">
        ${progress}
        <p class="reveal__lead">${esc(t.ui.reveal.passTo(player.name))}</p>
        <button class="btn btn--primary reveal__advance" type="button" data-confirm>
          ${esc(t.ui.reveal.areYou(player.name))}
        </button>
        ${back}
      </section>
    `
  }

  return `
    <section class="reveal reveal--confirm" data-phase="confirm" data-reveal-root>
      <div class="reveal__stage">
        <div class="reveal__slot" data-card></div>
        <div class="reveal__idle" data-idle>
          ${progress}
          <p class="reveal__lead">${esc(t.ui.reveal.areYou(player.name))}</p>
          <p class="reveal__hint">${esc(t.ui.reveal.shieldScreen)}</p>
        </div>
      </div>

      <div class="reveal__controls">
        <button class="reveal__hold" type="button" data-hold
                style="--hold-ms: ${HOLD_MS}ms">
          <span class="reveal__fill" data-fill aria-hidden="true"></span>
          <span class="reveal__hold-label" data-hold-label>${esc(t.ui.reveal.holdToReveal)}</span>
        </button>
        <button class="reveal__question" type="button" data-question
                ${player.hasQuestion ? 'data-on' : ''}>
          ${esc(player.hasQuestion ? t.ui.reveal.questionMarked : t.ui.reveal.hasQuestion)}
        </button>
        <div class="actions actions--row">
          <button class="btn btn--ghost" type="button" data-back>${esc(t.ui.common.back)}</button>
          <button class="btn btn--primary" type="button" data-reveal-next>
            ${esc(t.ui.reveal.doneViewing)}
          </button>
        </div>
      </div>
    </section>
  `
}

/**
 * The card shown while the finger is down. Injected, never pre-rendered.
 *
 * Deliberately carries no team colour or accent: it is the same paper for
 * every role, so the glow of the phone across the table gives nothing away.
 * The side is stated in text, to the one person holding it.
 */
export const roleCardMarkup = (player: Player, locale: Locale): string => {
  const t = strings(locale)
  const role = ROLES[player.roleId]
  const roleStrings = t.roles[player.roleId]
  const team = role.team === 'crew' ? t.ui.reveal.teamCrew : t.ui.reveal.teamTown

  return `
    <div class="reveal__card">
      <p class="reveal__owner">${esc(player.name)}</p>
      <p class="reveal__label">${esc(t.ui.reveal.yourRole)}</p>
      <span class="reveal__sigil">${sigilMarkup(player.roleId)}</span>
      <h2 class="reveal__role">${esc(roleStrings.name)}</h2>
      <p class="reveal__team" data-team="${role.team}">${esc(team)}</p>
      <p class="reveal__prompt">${esc(roleStrings.brief)}</p>
    </div>
  `
}

export interface HoldHandlers {
  /** The bar finished filling — show the role. */
  onReveal: () => void
  /** The finger lifted — hide the role, but stay on this player. */
  onHide: () => void
}

/**
 * Wires the charge-then-reveal gesture. Returns a teardown.
 *
 * A press that ends before HOLD_MS reveals nothing at all, which is what makes
 * a misspress harmless.
 */
export const bindHold = (
  root: ParentNode,
  { onReveal, onHide }: HoldHandlers,
  holdMs: number = HOLD_MS,
): (() => void) => {
  const button = root.querySelector<HTMLElement>('[data-hold]')
  if (!button) return () => {}

  let timer: ReturnType<typeof setTimeout> | null = null
  let revealed = false
  let charging = false

  const start = (event: Event): void => {
    event.preventDefault()
    if (charging || revealed) return
    charging = true
    button.setAttribute('data-charging', '')
    buzz(8)

    timer = setTimeout(() => {
      timer = null
      revealed = true
      button.removeAttribute('data-charging')
      button.setAttribute('data-revealed', '')
      buzz(18)
      onReveal()
    }, holdMs)
  }

  const end = (): void => {
    if (timer !== null) {
      clearTimeout(timer)
      timer = null
    }
    charging = false
    button.removeAttribute('data-charging')

    if (!revealed) return
    revealed = false
    button.removeAttribute('data-revealed')
    onHide()
  }

  button.addEventListener('pointerdown', start)
  for (const type of ['pointerup', 'pointercancel', 'pointerleave'] as const) {
    button.addEventListener(type, end)
  }
  window.addEventListener('pointerup', end)
  window.addEventListener('pointercancel', end)

  // A held role must not survive the app being backgrounded.
  const onVisibility = (): void => {
    if (document.hidden) end()
  }
  document.addEventListener('visibilitychange', onVisibility)

  return () => {
    if (timer !== null) clearTimeout(timer)
    window.removeEventListener('pointerup', end)
    window.removeEventListener('pointercancel', end)
    document.removeEventListener('visibilitychange', onVisibility)
  }
}
