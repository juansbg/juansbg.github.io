import type { Player } from '../../engine/types'
import { renderWinner, strings, type Locale, type Strings } from '../../i18n'
import type { PlayerId } from '../../engine/types'
import type { TvCast, TvProjection, TvSeat } from '../../room/projections'
import { esc } from '../dom'
import { qrSvg } from '../../room/qr'
import { circleMarkup } from './circle'
import { dailyMarkup, editionOf, paperFrom, paperPage } from './paper'
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

/**
 * The circle wants players; the projection has seats. Everyone is a Citizen
 * here — except once the game is over, when `cast` (from `p.cast`, empty
 * until then) is the sanctioned way for the room to learn who was who: the
 * one moment besides the paper's day-late reveal that a role reaches it.
 */
const seatOf = (s: TvSeat, cast?: TvCast): Player => ({
  id: s.id,
  name: s.name,
  roleId: cast?.roleId ?? 'PLAIN',
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
  trade: cast?.trade ?? null,
})

/**
 * The narrator's way back off a page the room is reading.
 *
 * The ✕ at the corner of the table view sits in `.screen--table`'s grid, and
 * the paper branches below return their own page above it — so showing the
 * table at game over left the narrator's phone with no control at all. Not a
 * small one, not one off the edge: zero buttons a finger could land on, with
 * the bar deliberately not rendered because the room is looking at this
 * screen. A page the room reads must still be a page the narrator can leave.
 *
 * Fixed, not placed: these pages bring their own layout, and the one thing
 * that must not depend on which of them won is the way out of it. It carries
 * the paper's ink because both pages that need it are newsprint.
 */
const exitMarkup = (t: Strings): string =>
  `<button class="icon-btn tableview__exit" type="button" data-table-close aria-label="${esc(t.ui.common.back)}" title="${esc(t.ui.common.back)}">✕</button>`

export const tableMarkup = (p: TvProjection, controls = true): string => {
  const t = strings(p.locale)
  if (p.phase === 'setup')
    return lobbyMarkup({ code: codeOf(p.join), join: p.join, roster: p.roster, dealt: p.dealt }, controls, p.locale)
  // The engine's phase stays where the game ended; the projection says when it
  // is over (a win, or the narrator ending it early from the menu).
  const over = p.over
  const caption = over
    ? t.ui.over.title
    : p.phase === 'night'
      ? t.ui.timeline.nightStart(p.night)
      : p.phase === 'day'
        ? t.ui.table.day(p.day)
        : ''
  // Who was who, the paper's second and last way a role reaches the room:
  // never before `over`, and `p.cast` is empty until then (`projections.ts`).
  const castMap = new Map(p.cast.map((c) => [c.id, c]))
  const ended = over ? (renderWinner(p.winner, p.locale) ?? t.ui.over.endedOn(p.night)) : ''
  const votes = new Map(p.tally.map((e) => [e.target, e.votes]))
  const complete = p.count !== null && p.count.total > 0 && p.count.shown >= p.count.total
  const verdict = complete ? verdictLine(p, t) : ''

  // The paper is open on the phone: the room reads the same edition, set
  // from the projection's public facts, with no Done of its own.
  if (p.paper !== null) {
    const e = editionOf({ day: p.paper, players: p.players, log: p.log, revealed: p.revealed }, p.locale)
    // No Done: the room's copy is turned by the narrator, not by the room. The
    // narrator's own device still needs the way back off it.
    return dailyMarkup(e, p.locale, false) + (controls ? exitMarkup(t) : '')
  }

  // And the last one the same way. It is the whole evening as a front page and
  // it used to reach nobody but the narrator holding it, while the room looked
  // at something else — so the one object of this game anybody would keep was
  // shown to one person. Nothing on it is new to the room: every death was
  // read out at dawn, the cast is what the ring reveals once the game is over,
  // and the record is the public log.
  if (p.finalPaper && over) {
    const paper = paperFrom(
        {
          night: p.night,
          players: p.players.map((s) => ({
            id: s.id,
            name: s.name,
            alive: s.alive,
            roleId: castMap.get(s.id)?.roleId ?? 'PLAIN',
          })),
          log: p.log,
          winner: p.winner,
        },
        p.locale,
      )
    // The room's copy stops at who was who. The night-by-night record runs the
    // page past 1080 and a television cannot scroll, so it was simply cut off
    // mid-heading; and of the three sections it is the one the room least
    // needs, having sat through every line of it. It stays on the narrator's
    // page and in the image they share.
    return paperPage({ ...paper, record: [] }, p.locale) + (controls ? exitMarkup(t) : '')
  }

  return `
    <section class="screen screen--table" data-table data-phase="${p.phase}"${over ? ' data-over' : ''}>
      <header class="tableview__head">
        <p class="label">${esc(caption)}</p>
        ${over || p.phase !== 'day' ? '' : ballotEyebrow(p, t)}
      </header>
      ${p.timer && p.phase === 'day' ? `<div class="tableview__clock">${timerMarkup(p.timer, p.locale)}</div>` : ''}
      ${circleMarkup(p.players.map((s) => seatOf(s)), p.locale, {
        // The ring never reveals a role, not even at the end.
        //
        // It used to, keyed off `over` — and `over` is the engine's answer, not
        // the narrator's. A side wins the moment the last crew member dies,
        // while the narrator is still standing on the day screen with the
        // clock running, so the room was shown every seat's role before
        // anybody had presented anything. Measured over a whole game: thirteen
        // frames of a ring reading "ANA CITIZEN · BETO FAMILY" under the words
        // GAME OVER and a discussion clock still counting down.
        //
        // Gating it on the narrator actually reaching the ending does not
        // help, because that is the same moment the final edition takes the
        // screen and returns above — so the reveal is either early or never.
        // The room's ending is the paper, where "who was who" is set to be
        // read from a sofa. The ring stays a table of names.
        showRoles: false,
        revealTeams: false,
        fitRoles: false,
        votes,
        leader: p.leader,
        // A hand up is marked while the ballot is sealed; once the count comes
        // up the corner belongs to the ballots against the seat.
        cast: p.phase === 'day' && !over && p.count === null ? p.players.filter((s) => s.voted).map((s) => s.id) : [],
        fresh: p.count?.last ?? null,
        centre: over
          ? `<p class="tableview__result" data-result>${esc(ended)}</p>`
          : verdict
            ? `<p class="tableview__verdict" data-verdict>${esc(verdict)}</p>`
            : p.phase === 'night'
              ? nightMarkup(p, t)
              : ballotMarkup(p, t),
      })}
      ${readingMarkup(p, controls)}
      ${controls ? `<button class="icon-btn tableview__close" type="button" data-table-close aria-label="${esc(t.ui.common.back)}" title="${esc(t.ui.common.back)}">✕</button>` : ''}
    </section>
  `
}

/**
 * The night, with nothing to read aloud yet: the ring's centre used to sit
 * empty and unchanged for the whole night, whatever step was live, so a
 * couch three metres away had no way to tell the game had not frozen. This
 * is the room's one cue that time is passing — a role-blind step count, the
 * only thing `TvProjection.nightStep` carries — never who is acting or what
 * they are deciding, which the room could not see before and still cannot.
 */
const nightMarkup = (p: TvProjection, t: ReturnType<typeof strings>): string => {
  const step = p.nightStep
  if (step === null) return ''
  const at = Math.min(step.index + 1, step.of)
  const through = step.of > 0 ? Math.round((at / step.of) * 100) : 0
  return `
    <div class="tableview__night">
      <p class="label tableview__night-label">${esc(t.ui.tv.deciding)}</p>
      <p class="tableview__night-count">${esc(t.ui.night.stepCounter(at, step.of))}</p>
      <div class="tableview__night-track" aria-hidden="true"><span style="--through: ${through}%"></span></div>
    </div>`
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
  /**
   * Who has taken a seat while the room is still unclaimed, by name.
   *
   * Only meaningful when `roster` is null: before a narrator claims the room
   * there is no projection to build a roster from, so a player who scanned the
   * QR and sat down had nothing on the screen to tell them it had worked. Names
   * only, which the lobby shows in any case.
   */
  waiting?: readonly string[]
  /** One quiet line under the narrator's: the relay's state, when it is not simply open. */
  note?: string
  /**
   * The cards are out and the table is learning who it is. The door is shut:
   * the QR would refuse anyone who scanned it now, so it goes, and the screen
   * says what is actually happening instead of what happened ten minutes ago.
   */
  dealt?: boolean
}

/**
 * The join address as a person would type it: the QR's own target, without
 * its protocol or its fragment. A camera that will not scan is the only way
 * into this game that does not exist otherwise.
 */
export const addressOf = (join: string | null): string | null =>
  join === null ? null : (join.split('#')[0] ?? '').replace(/^https?:\/\//, '').replace(/\/+$/, '') || null

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
  const dealing = lobby.dealt === true
  const address = addressOf(lobby.join)
  // Everyone at the table already holds a phone — a fresh lobby that just
  // filled, or a rematch where every phone reconnected under its old name in
  // the seconds after "Play again". Either way the QR has done its job: the
  // roster leads, and the code stays only for a latecomer or a second screen.
  //
  // It takes a table, though, not a person. On the road where the screen opens
  // the room, the roster IS the list of phones that have joined, so equality
  // holds from the very first one: the code and the QR were measured dropping
  // from 194px and 626px to 76px and 320px the moment ONE person was in, which
  // is exactly when everybody else still has to scan. Nothing here can know
  // how many are coming, so the floor is the smallest table the game will run.
  const settled = roster.length >= MIN_PLAYERS && joined === roster.length
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
           ${
             // Whoever has already sat down. The narrator's line is still the
             // point of this column, so the names sit under it rather than
             // taking it over — but somebody who scans first should see
             // themselves on the screen instead of wondering.
             (lobby.waiting ?? []).length === 0
               ? ''
               : // Not "2 of 2": nobody has said how many are coming yet, and a
                 // total the narrator has not set reads as a full table.
                 `<p class="label lobby__here">${esc(t.ui.room.players((lobby.waiting ?? []).length))}</p>
                  <ul class="lobby__names lobby__names--waiting">${(lobby.waiting ?? [])
                    .map((n) => `<li class="lobby__name" data-joined><span>${esc(n)}</span></li>`)
                    .join('')}</ul>`
           }
           ${lobby.note === undefined ? '' : `<p class="lobby__note">${esc(lobby.note)}</p>`}
         </div>`
      : `<div class="lobby__roster">
           ${
             dealing
               ? ''
               : `<p class="${settled ? 'title title--sm lobby__headline' : 'label'}">${esc(t.ui.table.joined(joined, roster.length))}</p>`
           }
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
    <section class="screen screen--lobby" data-table data-phase="setup"${lobby.roster === null ? ' data-unclaimed' : ''}${
      settled ? ' data-settled' : ''
    }${dealing ? ' data-dealing' : ''}>
      <div class="lobby__code">
        ${
          dealing
            ? `<h1 class="title lobby__dealt">${esc(t.ui.reveal.dealt)}</h1>`
            : `<p class="label">${esc(t.ui.table.scanToJoin)}</p>
               ${lobby.code === null ? '' : `<p class="title lobby__room">${esc(lobby.code)}</p>`}
               ${lobby.join === null ? '' : `<div class="room__qr lobby__qr" aria-hidden="true">${qrSvg(lobby.join)}</div>`}
               ${address === null ? '' : `<p class="lobby__address">${esc(t.ui.tv.orType(address))}</p>`}`
        }
      </div>
      ${column}
      ${
        // The way back, which the table view has had all along and the lobby
        // had not: a narrator who taps "Show the table" during setup to put
        // the code up was left with the lobby's own button as the only
        // control on the screen — and that button *proceeds*, and is disabled
        // below four names. Under four, the screen had no working control at
        // all and the phone was stuck.
        controls
          ? `<button class="icon-btn tableview__close" type="button" data-table-close aria-label="${esc(t.ui.common.back)}" title="${esc(t.ui.common.back)}">✕</button>`
          : ''
      }
    </section>
  `
}
