import { ROLES, type RoleId } from '../../engine/roles'
import type { Player, PlayerId } from '../../engine/types'
import { renderWinner, strings, type Locale } from '../../i18n'
import type { SeatAction } from '../../room/actions'
import type { SeatNight, SeatProjection } from '../../room/projections'
import { esc } from '../dom'
import { sigilMarkup } from '../sigils'
import { circleMarkup, type Perspective } from './circle'

/**
 * A player's phone, as markup: what one seat is shown from its own sealed
 * projection and nothing else. Kept out of the page's entry so the
 * play-through test can render every seat at every step of a simulated game
 * and check that nobody's phone says a word about anybody else's card.
 *
 * At night (docs/BIG-SCREEN.md §10) every phone shows the same screen at
 * every step — the night, the role being read, the table as a plain circle —
 * so a lit phone never says who is awake. Only the acting seat's phone
 * carries the chooser, mirroring the narrator's night screen step for step;
 * what it sees of the table is `tonight.view`, `perspectiveFor()` as data.
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

/** A seat of the table as the circle wants it: a name, a chair, alive or not. No role reaches it. */
const tableSeat = (s: SeatProjection['players'][number]): Player => ({
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
  hasQuestion: false,
  trade: null,
})

/**
 * What the phone holds between taps and has not yet handed the narrator:
 * the seats picked at this step, and whether an action has gone out. The
 * projection is the truth; these only let the screen answer a tap at once.
 */
export interface SeatPicks {
  picked: readonly PlayerId[]
  sent: boolean
}

const NO_PICKS: SeatPicks = { picked: [], sent: false }

/** Which night and step a set of picks belongs to; a new step starts clean. */
export const stepKeyOf = (p: SeatProjection): string =>
  p.tonight === null ? '' : `${p.night}:${p.tonight.step ?? ''}`

/**
 * The picks after a projection arrives. The projection is the narrator's
 * answer: it closes whatever was on its way (accepted, the step moved on;
 * refused, the step comes back unchanged and the buttons return) and, on a
 * player step, it carries the mark itself, so the local pick that bridged
 * the round trip is dropped for it. The pair's, the potion's and the
 * split's picks are the phone's alone until they are sent, so those survive
 * a repaint and go only with the step.
 */
export const settlePicks = (p: SeatProjection, picks: SeatPicks, previousKey: string): SeatPicks => {
  const n = p.tonight
  const playerStep = n !== null && n.step !== null && ROLES[n.step].target.kind === 'player'
  const keep = n !== null && n.acting && !playerStep && stepKeyOf(p) === previousKey
  return { picked: keep ? picks.picked : [], sent: false }
}

/**
 * The gate around the chooser (user, 2026-09-11). When a step becomes this
 * seat's, the phone shows "[Name], it's your turn" and one button, nothing
 * else; the chooser comes only when the button is tapped; once the step is
 * done (by this phone, another Family phone or the narrator) it shows "Close
 * your eyes, [Name]" and one button, the Detective's looked card first. So a
 * player whose eyes opened early reads no role and no choice off a neighbour's
 * phone: what they can read is what every phone shows, in the same layout,
 * with one sentence changed. `key` is the step the gate belongs to.
 */
export interface SeatGate {
  kind: 'turn' | 'chooser' | 'looked' | 'close'
  key: string
}

/**
 * The gate after a projection arrives. A step of mine opens on "your turn"
 * and stays wherever the tap left it while it lasts; when it ends, the phone
 * that was on the chooser, or still on "your turn", is told to close its
 * eyes (after the card, for the Detective) until it taps; a step that is
 * mine again straight away (the Godfather after the Family's pick) skips the
 * closing page. By day, or before the deal, there is no gate.
 */
export const nextGate = (gate: SeatGate | null, p: SeatProjection): SeatGate | null => {
  const n = p.tonight
  if (p.phase !== 'night' || n === null || p.roleId === null) return null
  const key = stepKeyOf(p)
  if (n.acting && p.alive && n.step !== null) {
    if (gate !== null && gate.key === key && (gate.kind === 'turn' || gate.kind === 'chooser')) return gate
    return { kind: 'turn', key }
  }
  if (gate === null) return null
  if (gate.kind === 'turn' || gate.kind === 'chooser') {
    return { kind: n.looked !== null && p.roleId === 'INSPECT' ? 'looked' : 'close', key: gate.key }
  }
  return gate
}

export const seatCenter = (inner: string): string => `<section class="screen screen--center mine">${inner}</section>`

/** A room code is five of these, as the relay makes them. */
export const CODE_SHAPE = /^[A-Z0-9]{5}$/

/**
 * A phone opened without a room in its address (docs/BIG-SCREEN.md §11): the
 * code is read off the screen and typed here. The field is the code itself,
 * set as the screen sets it, so what is typed looks like what is being read.
 */
export const codeMarkup = (locale: Locale, gone = false): string => {
  const s = strings(locale).ui.seat
  return `
    <section class="screen screen--center mine">
      <p class="label">${esc(s.title)}</p>
      ${gone ? `<h1 class="title title--sm">${esc(s.roomGone)}</h1>` : ''}
      <form class="mine__join mine__join--code" data-code-form>
        <label class="field">
          <span class="field__label">${esc(s.roomCode)}</span>
          <input class="field__input mine__code" type="text" data-room-code size="5" maxlength="5" pattern="[A-Za-z0-9]{5}"
                 inputmode="text" autocomplete="one-time-code" autocapitalize="characters" autocorrect="off"
                 spellcheck="false" required>
          <span class="field__hint">${esc(s.codeHint)}</span>
        </label>
        <button class="btn btn--primary" type="submit">${esc(s.join)}</button>
      </form>
    </section>`
}

/**
 * The table filling up, on a phone that has just taken a seat (§12.3). The
 * same names the screen's lobby shows, this seat marked as its own: a player
 * watches the others arrive instead of being told the cards are being dealt.
 */
const lobbySeatMarkup = (p: SeatProjection, locale: Locale, head: string): string => {
  const s = strings(locale).ui.seat
  const joined = p.roster.filter((r) => r.joined).length
  const t = strings(locale)
  const names = p.roster
    .map(
      (r, i) =>
        `<li class="lobby__name"${r.joined ? ' data-joined' : ''}${i === p.seat ? ' data-me' : ''}>${esc(r.name)}${
          r.joined ? `<span class="lobby__mark" aria-label="${esc(t.ui.table.onPhone)}">●</span>` : ''
        }</li>`,
    )
    .join('')
  return `
    <section class="screen mine mine--lobby">
      ${head}
      <p class="subtitle">${esc(s.atTheTable)}</p>
      <p class="label">${esc(s.seated(joined, p.roster.length))}</p>
      <ul class="lobby__names mine__guests">${names}</ul>
    </section>`
}

/**
 * The night is resolved and the narrator is reading it to the room (§12.3).
 * The phone waits with everyone else: the same page the night gate uses, so
 * nobody reads the morning off a screen before it is said aloud.
 */
const wakingMarkup = (locale: Locale, head: string): string => {
  const s = strings(locale).ui.seat
  return `
    <section class="screen screen--center mine">
      ${head}
      <p class="mine__waking">${esc(s.waking)}</p>
    </section>`
}

export const seatMarkup = (
  p: SeatProjection,
  locale: Locale,
  picks: SeatPicks = NO_PICKS,
  gate: SeatGate | null = null,
): string => {
  const t = strings(locale)
  const s = t.ui.seat
  const head = `
    <header class="mine__head">
      <p class="label">${esc(s.youAre(p.seat + 1))}</p>
      <h1 class="title title--sm">${esc(p.name)}</h1>
    </header>`

  if (p.over) {
    const line = renderWinner(p.winner, p.locale) ?? strings(p.locale).ui.over.title
    return `<section class="screen mine">${head}<p class="winner">${esc(line)}</p></section>`
  }

  // The table is still filling up: the roster, not a sentence about cards.
  if (p.phase === 'setup' && p.roleId === null && p.roster.length > 0) {
    return lobbySeatMarkup(p, locale, head)
  }

  // The narrator is reading the night to the room; the phone hears it first.
  if (p.reading) return wakingMarkup(locale, head)

  if (p.phase === 'night' && p.tonight !== null && p.roleId !== null) {
    return gate !== null && gate.kind !== 'chooser'
      ? gateMarkup(p, p.tonight, locale, head, gate)
      : nightMarkup(p, p.tonight, locale, picks, head)
  }

  const card = p.roleId
    ? `
      <div class="reveal__stage mine__stage">
        <div class="reveal__slot" data-card></div>
        <div class="reveal__idle" data-idle><p class="reveal__hint">${esc(t.ui.reveal.shieldScreen)}</p></div>
      </div>
      ${holdMarkup(locale)}`
    : `<p class="subtitle">${esc(s.waitingForDeal)}</p>`

  if (p.phase === 'day' && p.roleId !== null) {
    return dayMarkup(p, locale, head)
  }

  let day = ''
  if (!p.alive) {
    day = `<p class="mine__note">${esc(s.out)}</p>`
  } else if (p.phase === 'night') {
    day = `<p class="mine__note">${esc(t.phase.nightFalls)}</p>`
  }

  return `<section class="screen mine">${head}${card}${day}</section>`
}

/**
 * The day: the vote on the ring. The card says where the ballot stands
 * (how many hands are up; the count as it comes up; who the town points at
 * once it is complete), the ring takes the vote — tap a chair, tap it again
 * to take it back — with the badges landing on the seats as the room's
 * screen shows them, and the hold stays a bar at the bottom.
 */
const dayMarkup = (p: SeatProjection, locale: Locale, head: string): string => {
  const t = strings(locale)
  const s = t.ui.seat
  const nameOf = (id: PlayerId): string => p.players.find((x) => x.id === id)?.name ?? '?'
  const living = p.players.filter((x) => x.alive).length
  const c = p.count
  const complete = c !== null && c.total > 0 && c.shown >= c.total
  const top = p.tally[0]
  const runnerUp = p.tally[1]
  const leader = complete && top !== undefined && (runnerUp === undefined || runnerUp.votes < top.votes) ? top.target : null

  let title: string
  let situation = ''
  if (complete && top !== undefined) {
    title =
      leader !== null
        ? t.ui.table.pointsAt(nameOf(leader))
        : `${t.ui.table.tie} · ${p.tally.filter((e) => e.votes === top.votes).map((e) => nameOf(e.target)).join(' · ')}`
  } else if (c !== null && c.total > 0) {
    title = t.ui.table.count
    situation = `${c.shown} / ${c.total} · ${t.ui.table.counted}`
  } else {
    title = t.ui.table.ballot
    situation = t.ui.table.voted(p.voted, living)
  }

  const note = !p.alive
    ? `<p class="mine__note">${esc(s.out)}</p>`
    : !p.canVote
      ? `<p class="mine__note">${esc(s.cannotVote)}</p>`
      : c !== null
        ? ''
        : p.vote !== null
          ? `<p class="mine__note">${esc(s.voted)} ${esc(s.yourVote)}</p>`
          : `<p class="label mine__hint">${esc(s.vote)}</p>`

  const table = circleMarkup(p.players.map(tableSeat), locale, {
    ...(p.canVote ? { pickAttr: 'vote', eligible: p.eligible.map((e) => e.id) } : {}),
    selected: p.vote === null ? [] : [p.vote],
    votes: new Map(p.tally.map((e) => [e.target, e.votes])),
    leader,
    self: [p.seat],
    cast: p.players.filter((x) => x.voted).map((x) => x.id),
    fresh: c?.last ?? null,
  })

  return `
    <section class="screen mine mine--table" data-day ${complete ? 'data-counted' : ''}>
      ${head}
      <div class="card card--role mine__step" data-accent="system">
        <p class="night__counter">${esc(t.ui.table.day(p.day))}</p>
        <h2 class="card__title">${esc(title)}</h2>
        ${situation ? `<p class="card__situation">${esc(situation)}</p>` : ''}
      </div>
      ${note}
      ${table}
      <div class="reveal__slot mine__card" data-card></div>
      ${holdMarkup(locale)}
    </section>`
}

/** The hold that shows the card: the same gesture as the pass-around, the same slot beside it. */
const holdMarkup = (locale: Locale): string => {
  const t = strings(locale)
  return `
      <button class="reveal__hold" type="button" data-hold style="--hold-ms: 700ms">
        <span class="reveal__fill" aria-hidden="true"></span>
        <span class="reveal__hold-label" data-hold-label>${esc(t.ui.reveal.holdToReveal)}</span>
      </button>`
}

/** The ring as every phone shows it between steps: names, the dead, my own chair, nothing else. */
const plainView = (p: SeatProjection): Perspective => ({ self: [p.seat], crew: [], doomed: [], marked: [] })

/**
 * A gate page: the same head, the same card block and the same ring as the
 * common screen, the sentence where the role's name would be, and one button
 * where the hold bar sits, so from across the table this phone looks like
 * every other. The Detective's card, in the night's own dark voice (a phone
 * turning paper-white would tell the table who looked), is the one thing a
 * gate page carries besides its sentence, and only on his.
 */
const gateMarkup = (p: SeatProjection, n: SeatNight, locale: Locale, head: string, gate: SeatGate): string => {
  const t = strings(locale)
  const s = t.ui.seat
  const nameOf = (id: PlayerId): string => p.players.find((x) => x.id === id)?.name ?? '?'
  const look = gate.kind === 'looked' ? n.looked : null
  const counter = look === null ? t.ui.timeline.nightStart(p.night) : s.looked(nameOf(look.target))
  const title = look !== null ? t.roles[look.roleId].name : gate.kind === 'turn' ? s.yourTurn(p.name) : s.closeEyes(p.name)
  const inCard =
    look === null
      ? ''
      : `<span class="card__sigil">${sigilMarkup(look.roleId)}</span>
        <p class="card__aside">${esc(ROLES[look.roleId].team === 'crew' ? t.ui.reveal.sideCrew : t.ui.reveal.sideTown)}</p>`
  const attr = gate.kind === 'turn' ? 'data-enter' : 'data-close'
  return `
    <section class="screen mine mine--table" data-gate="${gate.kind}" data-step="${n.step ?? ''}">
      ${head}
      <div class="card card--role mine__step" data-accent="system" ${look === null ? '' : 'data-looked'}>
        <p class="night__counter">${esc(counter)}</p>
        <h2 class="card__title">${esc(title)}</h2>
        ${inCard}
      </div>
      ${circleMarkup(p.players.map(tableSeat), locale, { perspective: plainView(p) })}
      <button class="reveal__hold mine__gate" type="button" ${attr}>
        <span class="reveal__hold-label">${esc(s.proceed)}</span>
      </button>
    </section>`
}

/**
 * The night. The step's card (the night, the role being read, its sigil) and
 * the plain circle on every phone; the hint, the picks and the action row on
 * the acting phone alone. The role's prompt stays off the phone: it is
 * written for the narrator to read aloud, and the buttons name the choice.
 * Between steps the ring is plain on every phone, the Family's included: what
 * a role knows of the table is drawn only while it is choosing, so a phone
 * left face up says nothing to a neighbour whose eyes opened early. The card
 * the Detective looked at is the gate page after his step, not a fixture.
 */
const nightMarkup = (
  p: SeatProjection,
  n: SeatNight,
  locale: Locale,
  picks: SeatPicks,
  head: string,
): string => {
  const t = strings(locale)
  const s = t.ui.seat
  const step = n.step
  const kind = step === null ? null : ROLES[step].target.kind
  const acting = n.acting && p.alive && step !== null
  const nameOf = (id: PlayerId): string => p.players.find((x) => x.id === id)?.name ?? '?'
  const living = p.players.filter((x) => x.alive).map((x) => x.id)

  // My own chair is mine to see, whatever the role's perspective leaves out.
  const view: Perspective = {
    ...n.view,
    self: n.view.self.includes(p.seat) ? n.view.self : [...n.view.self, p.seat],
  }

  // On a player step the narrator's mark is the truth and the local pick only
  // bridges the round trip; on every other step the picks are the phone's
  // until it sends them.
  const chosen: readonly PlayerId[] =
    kind === 'player' ? (picks.picked.length > 0 ? picks.picked : n.view.marked) : picks.picked
  const target = chosen[0] ?? null

  let hint = ''
  let situation = ''
  let inCard = ''
  let table: string
  let actions = ''

  const btn = (attrs: string, label: string, cls = 'btn--ghost', enabled = true): string =>
    `<button class="btn ${cls}" type="button" ${attrs} ${enabled && !picks.sent ? '' : 'disabled'}>${esc(label)}</button>`
  const skip = (label: string): string => btn('data-act="skip"', label)
  const plain = (): string =>
    circleMarkup(p.players.map(tableSeat), locale, acting ? { perspective: view, selected: chosen } : { perspective: plainView(p) })
  const picker = (eligible: readonly PlayerId[]): string =>
    circleMarkup(p.players.map(tableSeat), locale, {
      perspective: view,
      pickAttr: 'pick',
      eligible: picks.sent ? [] : eligible,
      selected: chosen,
    })

  if (!acting) {
    table = plain()
  } else if (step === 'CONVERT') {
    const victim = n.victim
    situation = victim === null ? t.ui.night.convertNoVictim : s.convertOffer(nameOf(victim))
    table = circleMarkup(p.players.map(tableSeat), locale, { perspective: view, selected: victim === null ? [] : [victim] })
    actions =
      victim === null
        ? `<div class="actions">${btn('data-act="skip"', t.ui.common.next, 'btn--primary')}</div>`
        : `<div class="actions actions--row">${btn('data-act="confirm"', t.ui.night.convert)}${skip(t.ui.night.convertDecline)}</div>`
  } else if (step === 'PICK_SIDE') {
    table = plain()
    actions = `<div class="actions actions--row">
        ${btn('data-act="role" data-role="KILLER"', s.joinCrew)}
        ${btn('data-act="role" data-role="PLAIN"', s.stayTown)}
      </div>`
  } else if (step === 'SWAP') {
    if (n.spare.length === 0) situation = t.ui.night.noSpareCards
    table =
      n.spare.length === 0
        ? plain()
        : `<p class="label">${esc(t.ui.night.spareCards)}</p>
           <div class="table table--list"><div class="targets">${n.spare
             .map((id) => `<button class="target" type="button" data-act="role" data-role="${id}" ${picks.sent ? 'disabled' : ''}>${esc(t.roles[id].name)}</button>`)
             .join('')}</div></div>`
    actions = `<div class="actions">${skip(s.keepCard)}</div>`
  } else if (kind === 'split') {
    hint = t.ui.night.splitHint
    const ready = chosen.length > 0 && chosen.length < living.length
    table = picker(living)
    actions = `<div class="actions actions--row">
        ${skip(t.ui.night.noOne)}
        ${btn('data-act="split"', t.ui.night.splitConfirm, 'btn--primary', ready)}
      </div>`
  } else if (kind === 'potion') {
    const vials = n.vials ?? { heal: false, poison: false }
    const bothSpent = !vials.heal && !vials.poison
    const canHeal = target !== null && vials.heal && n.view.doomed.includes(target)
    const canPoison = target !== null && vials.poison
    const vial = (potion: 'heal' | 'kill', cls: string, label: string, enabled: boolean, left: boolean): string =>
      btn(`data-act="potion" data-potion="${potion}" ${left ? '' : 'data-spent'}`, left ? label : `${label} · ${t.ui.night.spent}`, cls, enabled)
    situation = bothSpent
      ? s.bothSpent
      : n.view.doomed.length > 0
        ? t.ui.view.doomed(n.view.doomed.map(nameOf))
        : t.ui.view.doomedNone
    hint = bothSpent ? '' : t.ui.night.pickOne
    inCard = bothSpent
      ? ''
      : `<div class="potion card__potion">
        ${vial('heal', 'btn--ok', t.ui.night.heal, canHeal, vials.heal)}
        ${vial('kill', 'btn--danger', t.ui.night.poison, canPoison, vials.poison)}
      </div>`
    table = bothSpent ? plain() : picker(n.eligible)
    actions = `<div class="actions">${skip(t.ui.night.noOne)}</div>`
  } else if (kind === 'twoPlayers') {
    hint = t.ui.night.pickTwo
    table = picker(n.eligible)
    actions = `<div class="actions actions--row">
        ${skip(t.ui.night.noOne)}
        ${btn('data-act="pair"', t.ui.common.confirm, 'btn--primary', chosen.length === 2)}
      </div>`
  } else if (kind === 'player') {
    hint = step === 'KILLER' ? s.familyMark : t.ui.night.pickOne
    table = picker(n.eligible)
    actions = `<div class="actions actions--row">
        ${skip(t.ui.night.noOne)}
        ${btn(`data-act="target"`, t.ui.common.confirm, 'btn--primary', target !== null)}
      </div>`
  } else {
    table = plain()
    actions = `<div class="actions">${btn('data-act="confirm"', t.ui.common.confirm, 'btn--primary')}</div>`
  }

  const stepCard = `
      <div class="card card--role mine__step" data-accent="system">
        ${step === null ? '' : `<span class="card__sigil">${sigilMarkup(step)}</span>`}
        <p class="night__counter">${esc(t.ui.timeline.nightStart(p.night))}${acting ? ` · ${esc(s.yourMove)}` : ''}</p>
        <h2 class="card__title">${esc(step === null ? t.phase.nightFalls : t.roles[step].name)}</h2>
        ${situation ? `<p class="card__situation">${esc(situation)}</p>` : ''}
        ${inCard}
      </div>`

  const note = !p.alive
    ? `<p class="mine__note">${esc(s.out)}</p>`
    : picks.sent
      ? `<p class="mine__note">${esc(s.sent)}</p>`
      : hint
        ? `<p class="label mine__hint">${esc(hint)}</p>`
        : ''

  return `
    <section class="screen mine mine--table" data-step="${step ?? ''}" ${acting ? 'data-acting' : ''} ${picks.sent ? 'data-sent' : ''}>
      ${head}
      ${stepCard}
      ${note}
      ${table}
      ${actions}
      <div class="reveal__slot mine__card" data-card></div>
      ${holdMarkup(locale)}
    </section>`
}

/**
 * Turns a `data-act` tap into the action the phone sends, or null when the
 * picks do not add up to one (a pair with one seat, a target with none). The
 * narrator checks everything again; this only keeps a half-made choice off
 * the wire.
 */
export const seatAction = (
  act: string,
  data: { potion?: string | undefined; role?: string | undefined },
  p: SeatProjection,
  picks: SeatPicks,
): SeatAction | null => {
  const n = p.tonight
  if (n === null) return null
  const kind = n.step === null ? null : ROLES[n.step].target.kind
  const chosen = kind === 'player' ? (picks.picked.length > 0 ? picks.picked : n.view.marked) : picks.picked
  switch (act) {
    case 'skip':
      return { kind: 'skip' }
    case 'confirm':
      return { kind: 'confirm' }
    case 'target':
      return chosen[0] === undefined ? null : { kind: 'target', target: chosen[0] }
    case 'pair':
      return chosen.length === 2 ? { kind: 'pair', first: chosen[0] as PlayerId, second: chosen[1] as PlayerId } : null
    case 'potion':
      return chosen[0] === undefined || (data.potion !== 'heal' && data.potion !== 'kill')
        ? null
        : { kind: 'potion', target: chosen[0], potion: data.potion }
    case 'split':
      return chosen.length === 0 ? null : { kind: 'split', sectOne: [...chosen] }
    case 'role':
      return data.role !== undefined && data.role in ROLES ? { kind: 'chooseRole', newRole: data.role as RoleId } : null
    default:
      return null
  }
}
