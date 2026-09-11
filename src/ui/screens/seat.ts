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

export const seatCenter = (inner: string): string => `<section class="screen screen--center mine">${inner}</section>`

export const seatMarkup = (p: SeatProjection, locale: Locale, picks: SeatPicks = NO_PICKS): string => {
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

  if (p.phase === 'night' && p.tonight !== null && p.roleId !== null) {
    return nightMarkup(p, p.tonight, locale, picks, head)
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

/**
 * The night. The step's card (the night, the role being read, its sigil) and
 * the plain circle on every phone; the hint, the picks and the action row on
 * the acting phone alone. The role's prompt stays off the phone: it is
 * written for the narrator to read aloud, and the buttons name the choice. The card the Detective looked at
 * stays on his phone for the rest of the night, in the night's own dark
 * voice: one phone turning paper-white would tell the table who looked.
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
  const plain = (): string => circleMarkup(p.players.map(tableSeat), locale, { perspective: view, selected: chosen })
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

  const looked =
    n.looked === null
      ? ''
      : `
      <div class="card card--role mine__looked" data-accent="system" data-looked>
        <span class="card__sigil">${sigilMarkup(n.looked.roleId)}</span>
        <p class="night__counter">${esc(s.looked(nameOf(n.looked.target)))}</p>
        <h2 class="card__title">${esc(t.roles[n.looked.roleId].name)}</h2>
        <p class="card__aside">${esc(ROLES[n.looked.roleId].team === 'crew' ? t.ui.reveal.sideCrew : t.ui.reveal.sideTown)}</p>
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
      ${looked}
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
