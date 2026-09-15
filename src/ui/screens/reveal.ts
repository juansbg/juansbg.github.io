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
  /**
   * Whether this seat has already held its card. Until it has, Done is a
   * ghost: on the confirm screen the brightest control used to be "Done —
   * pass the phone", so the eye of a first-timer handed the phone went to
   * the one button that ends their turn without a look.
   */
  seen: boolean
  /** Which way the phone is travelling, so the name arrives from that side. */
  dir: 'next' | 'back'
}

export const revealMarkup = (props: RevealProps): string => {
  const t = strings(props.locale)
  const { player, phase } = props

  const progress =
    props.position !== null && props.total !== null
      ? `<p class="reveal__progress">${t.ui.night.stepCounter(props.position, props.total)}</p>`
      : ''

  if (phase === 'handoff') {
    // Single mode came from a screen and must be able to go back to it, since
    // picking the wrong name otherwise left the narrator confirming an
    // identity to escape.
    //
    // The pass-around has no such way back, on purpose. This screen is the one
    // in a player's hands at the moment the phone changes hands, so a Back
    // button here was a one-tap route to the previous player's handoff, their
    // "Are you Ana?", and their card — silent, and indistinguishable from an
    // ordinary handoff to a narrator glancing over. A narrator who mis-taps
    // recovers from the ⋯ menu afterwards, which a player cannot reach because
    // the pass-around renders no bar at all.
    const away =
      props.mode === 'single'
        ? `<button class="btn btn--ghost" type="button" data-reveal-cancel>${esc(t.ui.common.cancel)}</button>`
        : ''

    return `
      <section class="reveal reveal--handoff" data-phase="handoff" data-dir="${props.dir}">
        ${progress}
        <p class="reveal__lead">${esc(t.ui.reveal.passTo(player.name))}</p>
        <button class="btn btn--primary reveal__advance" type="button" data-confirm>
          ${esc(t.ui.reveal.areYou(player.name))}
        </button>
        ${away}
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
        ${holdMarkup(t.ui.reveal, props.seen)}
        <div class="reveal__flag">
          <button class="reveal__question" type="button" data-question
                  ${player.hasQuestion ? 'data-on' : ''}>
            ${esc(player.hasQuestion ? `✓ ${t.ui.reveal.questionNoted}` : t.ui.reveal.hasQuestion)}
          </button>
          ${player.hasQuestion ? `<p class="reveal__note">${esc(t.ui.reveal.questionMarked)}</p>` : ''}
        </div>
        <div class="actions actions--row">
          <button class="btn btn--ghost" type="button" data-back>${esc(t.ui.common.back)}</button>
          <button class="btn ${props.seen ? 'btn--primary' : 'btn--ghost'}" type="button" data-reveal-next>
            ${esc(props.mode === 'single' ? t.ui.common.done : t.ui.reveal.doneViewing)}
          </button>
        </div>
      </div>
    </section>
  `
}

/**
 * The charge button.
 *
 * The three labels travel on the element, so `bindHold` can flip them
 * without knowing a locale and the players' phones get the same behaviour
 * from the same markup. Before, the label read "Press and hold to see your
 * role" before, during and after the card was up, and the only sign the
 * gesture had started was a 4px rule along the bottom edge, half of it under
 * the thumb: a tapper saw nothing and tapped again.
 *
 * A seat that has already looked rests on the released line rather than the
 * invitation, so the sentence the gesture ends on survives the repaint that
 * hands Done its Ledger.
 */
export const holdMarkup = (
  r: ReturnType<typeof strings>['ui']['reveal'],
  seen: boolean,
  /**
   * The line the gesture ends on. The pass-around says "hand the phone
   * back", because it is the narrator's phone travelling round a table; a
   * player holding their own says something else, since nobody handed it to
   * them and they are not handing it on.
   */
  released: string = r.released,
): string => `
  <button class="reveal__hold" type="button" data-hold${seen ? '' : ' data-lead'}
          style="--hold-ms: ${HOLD_MS}ms"
          data-hold-idle="${esc(r.holdToReveal)}"
          data-hold-holding="${esc(r.keepHolding)}"
          data-hold-done="${esc(released)}">
    <span class="reveal__fill" data-fill aria-hidden="true"></span>
    <span class="reveal__hold-label" data-hold-label>${esc(seen ? released : r.holdToReveal)}</span>
  </button>
`

/**
 * The card shown while the finger is down. Injected, never pre-rendered.
 *
 * Deliberately carries no team colour or accent: it is the same paper for
 * every role, so the glow of the phone across the table gives nothing away.
 * The side is stated in text, to the one person holding it.
 *
 * A citizen's trade is the second line, right under the role and as bold
 * as it: "CITIZEN / BAKER" is what the player must walk away knowing, so
 * it is never a footnote.
 *
 * The role takes its `card` name, without the article: the card belongs to
 * one named person, and "EL CIUDADANO" read as a statement about her rather
 * than as the title of the card.
 *
 * The brief is all the rules the card carries; the fuller `detail` is the
 * narrator's, read to a player who flags a question, and stays off the card
 * so it cannot be cut off on a short phone.
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
      <h2 class="reveal__role">${esc(roleStrings.card)}</h2>
      ${player.trade !== null ? `<p class="reveal__trade">${esc(t.trades[player.trade] ?? '')}</p>` : ''}
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

  // The label says what the gesture is doing. The three lines ride on the
  // button so this stays free of a locale, and a button without them (an
  // older markup) simply keeps whatever label it was given.
  const label = button.querySelector<HTMLElement>('[data-hold-label]')
  const say = (key: 'idle' | 'holding' | 'done'): void => {
    const next = button.dataset[`hold${key[0]!.toUpperCase()}${key.slice(1)}`]
    if (label && next !== undefined) label.textContent = next
  }

  let timer: ReturnType<typeof setTimeout> | null = null
  let revealed = false
  let charging = false

  const start = (event: Event): void => {
    event.preventDefault()
    if (charging || revealed) return
    charging = true
    button.setAttribute('data-charging', '')
    say('holding')
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
    // A lift fires this twice — once on the button, once on the window that
    // catches a finger dragged off it — so a gesture that is already over
    // must fall straight through. Without the guard the second call read as
    // a release that revealed nothing and wrote the idle label back over
    // "Hidden. Hand the phone back." the first had just set.
    const wasRevealed = revealed
    if (!charging && !wasRevealed) return
    charging = false
    button.removeAttribute('data-charging')

    if (!wasRevealed) {
      // Lifted before the card came: nothing was shown, so the invitation
      // stands rather than claiming anything was hidden.
      say('idle')
      return
    }
    revealed = false
    button.removeAttribute('data-revealed')
    say('done')
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
