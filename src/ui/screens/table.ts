import type { Player } from '../../engine/types'
import { renderWinner, strings, type Locale } from '../../i18n'
import type { PlayerId } from '../../engine/types'
import type { TvProjection, TvSeat } from '../../room/projections'
import { esc } from '../dom'
import { qrSvg } from '../../room/qr'
import { circleMarkup } from './circle'
import { dailyMarkup, editionOf } from './paper'
import { MIN_PLAYERS } from './setup'
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
  if (p.phase === 'setup') return lobbyMarkup({ code: codeOf(p.join), join: p.join, roster: p.roster }, controls, p.locale)
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
  const complete = p.count !== null && p.count.total > 0 && p.count.shown >= p.count.total
  const verdict = complete ? verdictLine(p, t) : ''

  // The paper is open on the phone: the room reads the same edition, set
  // from the projection's public facts, with no Done of its own.
  if (p.paper !== null) {
    const e = editionOf({ day: p.paper, players: p.players, log: p.log, revealed: p.revealed }, p.locale)
    return dailyMarkup(e, p.locale, false)
  }

  return `
    <section class="screen screen--table" data-table data-phase="${p.phase}">
      <header class="tableview__head">
        <p class="label">${esc(caption)}</p>
        ${over || p.phase !== 'day' ? '' : ballotEyebrow(p, t)}
      </header>
      ${p.timer && p.phase === 'day' ? `<div class="tableview__clock">${timerMarkup(p.timer, p.locale)}</div>` : ''}
      ${circleMarkup(p.players.map(seatOf), p.locale, {
        votes,
        leader: p.leader,
        // A hand up is marked while the ballot is sealed; once the count comes
        // up the corner belongs to the ballots against the seat.
        cast: p.phase === 'day' && !over && p.count === null ? p.players.filter((s) => s.voted).map((s) => s.id) : [],
        fresh: p.count?.last ?? null,
        centre: over
          ? ''
          : verdict
            ? `<p class="tableview__verdict" data-verdict>${esc(verdict)}</p>`
            : ballotMarkup(p, t),
      })}
      ${readingMarkup(p, controls)}
      ${line ? `<p class="tableview__winner winner">${esc(line)}</p>` : ''}
      ${controls ? `<button class="icon-btn tableview__close" type="button" data-table-close aria-label="${esc(t.ui.common.back)}" title="${esc(t.ui.common.back)}">✕</button>` : ''}
    </section>
  `
}

/**
 * The ballot as a figure the whole room watches, in the middle of the ring:
 * while it is sealed, how many hands are up of the living; while the count
 * comes up, how many ballots are on the seats of how many. Mono digits at
 * display size, the way the clock is read from across the table. Nothing
 * while nobody has voted. The word for it (the ballot, the count) sits
 * under the day in the caption.
 */
const ballotMarkup = (p: TvProjection, t: ReturnType<typeof strings>): string => {
  if (p.phase !== 'day') return ''
  const c = p.count
  if (c === null) {
    if (p.voted === 0) return ''
    return figureMarkup(p.voted, p.players.filter((s) => s.alive).length, t.ui.table.haveVoted)
  }
  if (c.total === 0) return ''
  return figureMarkup(c.shown, c.total, t.ui.table.counted)
}

const ballotEyebrow = (p: TvProjection, t: ReturnType<typeof strings>): string => {
  if (p.count === null) return p.voted === 0 ? '' : `<p class="label tableview__eyebrow">${esc(t.ui.table.ballot)}</p>`
  return p.count.total === 0 ? '' : `<p class="label tableview__eyebrow">${esc(t.ui.table.count)}</p>`
}

const figureMarkup = (n: number, total: number, under: string): string => `
  <div class="tableview__ballot" data-ballot>
    <p class="tableview__figure"><b>${n}</b><span class="tableview__of">/</span><b>${total}</b></p>
    <p class="label">${esc(under)}</p>
  </div>`

/** The count is complete: who the town points at, or the names it is torn between. */
const verdictLine = (p: TvProjection, t: ReturnType<typeof strings>): string => {
  const nameOf = (id: PlayerId): string => p.players.find((s) => s.id === id)?.name ?? '?'
  if (p.leader !== null) return t.ui.table.pointsAt(nameOf(p.leader))
  const top = p.tally[0]
  if (!top) return ''
  const tied = p.tally.filter((e) => e.votes === top.votes).map((e) => nameOf(e.target))
  return `${t.ui.table.tie} · ${tied.join(' · ')}`
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

/** What the lobby is drawn from: the projection's slice of it, or what a screen knows on its own. */
export interface Lobby {
  /** The room code, read from the sofa. */
  code: string | null
  /** The players' address, drawn as the QR. */
  join: string | null
  /**
   * The names at the table, each marked once a phone holds it; null while no
   * narrator has claimed the room (docs/BIG-SCREEN.md §11), when the screen
   * has opened it by itself and the column carries the narrator's line instead.
   */
  roster: { name: string; joined: boolean }[] | null
  /** One quiet line under the narrator's: the relay's state, when it is not simply open. */
  note?: string
}

/** The code inside a join address, so the projection need not carry it twice. */
export const codeOf = (join: string | null): string | null =>
  join === null ? null : new URLSearchParams(join.split('#')[1] ?? '').get('room')

/**
 * Before the game: the screen everyone looks at shows the code and the QR the
 * players join with, and the roster filling up. The narrator's own device
 * gets the button to go on; a TV through the relay just shows. A TV that
 * opened the room itself paints the same screen before any narrator is on
 * it, with the narrator's one instruction where the roster will be, so the
 * claim swaps a column and never the screen.
 */
export const lobbyMarkup = (lobby: Lobby, controls: boolean, locale: Locale): string => {
  const t = strings(locale)
  const roster = lobby.roster ?? []
  const joined = roster.filter((r) => r.joined).length
  const enough = roster.length >= MIN_PLAYERS
  const names = roster
    .map(
      (r) => `<li class="lobby__name"${r.joined ? ' data-joined' : ''}>${esc(r.name)}${
        r.joined ? `<span class="lobby__mark" aria-label="${esc(t.ui.table.onPhone)}">●</span>` : ''
      }</li>`,
    )
    .join('')
  const column =
    lobby.roster === null
      ? `<div class="lobby__narrator">
           <p class="label">${esc(t.ui.tv.forNarrator)}</p>
           <p class="lobby__ask">${esc(t.ui.tv.enterCode)}</p>
           ${lobby.note === undefined ? '' : `<p class="lobby__note">${esc(lobby.note)}</p>`}
         </div>`
      : `<div class="lobby__roster">
           <p class="label">${esc(t.ui.table.joined(joined, roster.length))}</p>
           <ul class="lobby__names">${names}</ul>
           ${
             controls
               ? `<div class="actions">
                    <button class="btn btn--primary" type="button" data-table-proceed${enough ? '' : ' disabled'}>${esc(
                      enough ? t.ui.table.proceed : t.ui.setup.minPlayers(MIN_PLAYERS),
                    )}</button>
                  </div>`
               : ''
           }
         </div>`
  return `
    <section class="screen screen--lobby" data-table data-phase="setup"${lobby.roster === null ? ' data-unclaimed' : ''}>
      <div class="lobby__code">
        <p class="label">${esc(t.ui.table.scanToJoin)}</p>
        ${lobby.code === null ? '' : `<p class="title lobby__room">${esc(lobby.code)}</p>`}
        ${lobby.join === null ? '' : `<div class="room__qr lobby__qr" aria-hidden="true">${qrSvg(lobby.join)}</div>`}
      </div>
      ${column}
    </section>
  `
}
