import type { Player } from '../../engine/types'
import { renderWinner, strings, type Locale } from '../../i18n'
import type { SeatProjection } from '../../room/projections'
import { esc } from '../dom'

/**
 * A player's phone, as markup: what one seat is shown from its own sealed
 * projection and nothing else. Kept out of the page's entry so the
 * play-through test can render every seat at every step of a simulated game
 * and check that nobody's phone says a word about anybody else's card.
 */

/** The circle's card wants a Player; the seat has a projection. Everything else is blank. */
export const seatPlayer = (p: SeatProjection): Player => ({
  id: p.seat,
  name: p.name,
  roleId: p.roleId ?? 'PLAIN',
  alive: p.alive,
  protectedTonight: false,
  protectedLastNight: false,
  wolfAttacksSurvivable: 0,
  loverOf: null,
  silencedOnDay: null,
  extraVotesOnDay: null,
  sect: null,
  fatherOf: null,
  hasQuestion: false,
  trade: p.trade,
})

export const seatCenter = (inner: string): string => `<section class="screen screen--center mine">${inner}</section>`

export const seatMarkup = (p: SeatProjection, locale: Locale): string => {
  const t = strings(locale)
  const s = t.ui.seat
  const head = `
    <header class="mine__head">
      <p class="label">${esc(s.youAre(p.seat + 1))}</p>
      <h1 class="title title--sm">${esc(p.name)}</h1>
    </header>`

  if (p.winner !== null) {
    return `<section class="screen mine">${head}<p class="winner">${esc(renderWinner(p.winner, p.locale) ?? '')}</p></section>`
  }

  const card = p.roleId
    ? `
      <div class="reveal__stage mine__stage">
        <div class="reveal__slot" data-card></div>
        <div class="reveal__idle" data-idle><p class="reveal__hint">${esc(t.ui.reveal.shieldScreen)}</p></div>
      </div>
      <button class="reveal__hold" type="button" data-hold style="--hold-ms: 700ms">
        <span class="reveal__fill" data-fill aria-hidden="true"></span>
        <span class="reveal__hold-label" data-hold-label>${esc(t.ui.reveal.holdToReveal)}</span>
      </button>`
    : `<p class="subtitle">${esc(s.waitingForDeal)}</p>`

  let day = ''
  if (!p.alive) {
    day = `<p class="mine__note">${esc(s.out)}</p>`
  } else if (p.phase === 'night') {
    day = `<p class="mine__note">${esc(t.phase.nightFalls)}</p>`
  } else if (p.phase === 'day') {
    day = p.canVote
      ? `
        <p class="label">${esc(p.vote === null ? s.vote : s.yourVote)}</p>
        <div class="mine__ballot">
          ${p.eligible
            .map(
              (e) => `<button class="target mine__choice" type="button" data-vote="${e.id}"${p.vote === e.id ? ' data-on' : ''}>${esc(e.name)}</button>`,
            )
            .join('')}
        </div>`
      : `<p class="mine__note">${esc(s.cannotVote)}</p>`
  }

  return `<section class="screen mine">${head}${card}${day}</section>`
}
