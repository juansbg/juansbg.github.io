import type { Player } from '../../engine/types'
import { renderWinner, strings } from '../../i18n'
import type { TvProjection, TvSeat } from '../../room/projections'
import { esc } from '../dom'
import { qrSvg } from '../../room/qr'
import { circleMarkup } from './circle'
import { timerMarkup } from './timer'

/**
 * The table, for the whole room.
 *
 * The seating plan is the screen; everything else is laid over it: who is
 * dead, the count against each seat, the discussion clock, the morning and
 * the verdict as a card in the middle. It is meant for a phone or an iPad
 * stood on its side, or mirrored to a TV, and it renders a `TvProjection`
 * and nothing else, so it cannot show what the projection does not carry.
 *
 * With `controls` the reading can be turned from this screen (the narrator's
 * own device); a TV through the relay renders it without.
 */

/** The circle wants players; the projection has seats. Everyone is a Citizen here. */
const seatOf = (s: TvSeat): Player => ({
  id: s.id,
  name: s.name,
  roleId: 'PLAIN',
  alive: s.alive,
  protectedTonight: false,
  protectedLastNight: false,
  wolfAttacksSurvivable: 0,
  loverOf: null,
  silencedOnDay: null,
  extraVotesOnDay: null,
  sect: null,
  fatherOf: null,
  hasQuestion: s.hasQuestion,
  trade: null,
})

export const tableMarkup = (p: TvProjection, controls = true): string => {
  const t = strings(p.locale)
  if (p.phase === 'setup') return lobbyMarkup(p, controls, t)
  // The engine's phase stays where the game ended; a winner is what "over" means.
  const over = p.winner !== null
  const caption = over
    ? t.ui.over.title
    : p.phase === 'night'
      ? t.ui.timeline.nightStart(p.night)
      : p.phase === 'day'
        ? t.ui.table.day(p.day)
        : ''
  const line = over ? (renderWinner(p.winner, p.locale) ?? '') : ''
  const votes = new Map(p.tally.map((e) => [e.target, e.votes]))

  return `
    <section class="screen screen--table" data-table data-phase="${p.phase}">
      <header class="tableview__head">
        <p class="label">${esc(caption)}</p>
        ${
          p.voted > 0 && p.tally.length === 0
            ? `<p class="tableview__voted">${esc(t.ui.table.voted(p.voted, p.players.filter((s) => s.alive).length))}</p>`
            : ''
        }
      </header>
      ${p.timer && p.phase === 'day' ? `<div class="tableview__clock">${timerMarkup(p.timer, p.locale)}</div>` : ''}
      ${circleMarkup(p.players.map(seatOf), p.locale, { votes, leader: p.leader })}
      ${readingMarkup(p, controls)}
      ${line ? `<p class="tableview__winner winner">${esc(line)}</p>` : ''}
      ${controls ? `<button class="icon-btn tableview__close" type="button" data-table-close aria-label="${esc(t.ui.common.back)}" title="${esc(t.ui.common.back)}">✕</button>` : ''}
    </section>
  `
}

/** The slide up right now, as a card over the table. */
const readingMarkup = (p: TvProjection, controls: boolean): string => {
  const reading = p.reading
  if (!reading) return ''
  const slide = reading.slides[Math.min(reading.index, reading.slides.length - 1)]
  if (!slide) return ''
  const t = strings(p.locale)
  const last = reading.index >= reading.slides.length - 1
  const heading =
    reading.kind === 'dawn' ? t.ui.timeline.nightStart(p.night) : t.ui.dawn.verdict(p.day)
  const body = slide.name !== null
    ? `<h1 class="dawn__name">${esc(slide.name)}</h1>
       <p class="dawn__line">${esc(slide.line)}</p>`
    : `<h1 class="dawn__name dawn__name--line">${esc(slide.line)}</h1>`

  return `
    <div class="tableview__card" data-accent="${slide.accent}" data-kind="${slide.kind}"${slide.lethal ? ' data-lethal' : ''}>
      <p class="dawn__counter">${esc(heading)} · ${esc(t.ui.night.stepCounter(reading.index + 1, reading.slides.length))}</p>
      <span class="mark dawn__mark" aria-hidden="true">${slide.mark}</span>
      ${body}
      ${
        controls
          ? `<div class="actions actions--row">
               <button class="btn btn--ghost" type="button" data-dawn-prev ${reading.index === 0 ? 'disabled' : ''}>${esc(t.ui.common.back)}</button>
               ${
                 last
                   ? `<button class="btn btn--primary" type="button" data-dawn-close>${esc(t.ui.common.done)}</button>`
                   : `<button class="btn btn--primary" type="button" data-dawn-next>${esc(t.ui.common.next)}</button>`
               }
             </div>`
          : ''
      }
    </div>
  `
}

/**
 * Before the game: the screen everyone looks at shows the code and the QR the
 * players join with, and the roster filling up. The narrator's own device
 * gets the button to go on; a TV through the relay just shows.
 */
const lobbyMarkup = (p: TvProjection, controls: boolean, t: ReturnType<typeof strings>): string => {
  const code = p.join === null ? null : new URLSearchParams(p.join.split('#')[1] ?? '').get('room')
  const joined = p.roster.filter((r) => r.joined).length
  const names = p.roster
    .map(
      (r) => `<li class="lobby__name"${r.joined ? ' data-joined' : ''}>${esc(r.name)}${
        r.joined ? `<span class="lobby__mark" aria-label="${esc(t.ui.table.onPhone)}">●</span>` : ''
      }</li>`,
    )
    .join('')
  return `
    <section class="screen screen--lobby" data-table data-phase="setup">
      <div class="lobby__code">
        <p class="label">${esc(t.ui.table.scanToJoin)}</p>
        ${code === null ? '' : `<p class="title lobby__room">${esc(code)}</p>`}
        ${p.join === null ? '' : `<div class="room__qr lobby__qr" aria-hidden="true">${qrSvg(p.join)}</div>`}
      </div>
      <div class="lobby__roster">
        <p class="label">${esc(t.ui.table.joined(joined, p.roster.length))}</p>
        <ul class="lobby__names">${names}</ul>
        ${
          controls
            ? `<div class="actions">
                 <button class="btn btn--primary" type="button" data-table-proceed>${esc(t.ui.table.proceed)}</button>
               </div>`
            : ''
        }
      </div>
    </section>
  `
}
