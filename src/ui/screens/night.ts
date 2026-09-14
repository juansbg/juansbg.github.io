import { spareCards } from '../../engine/cards'
import { legalTargets } from '../../engine/targets'
import { ROLES, type RoleId } from '../../engine/roles'
import { doomedTonight } from '../../engine/resolve'
import { currentStep, leader } from '../../engine/state'
import type { GameState, Player, PlayerId } from '../../engine/types'
import { strings, type Locale } from '../../i18n'
import { accentOf } from '../accent'
import { sigilMarkup } from '../sigils'
import { esc } from '../dom'
import { holdMarkup } from './reveal'
import { circleMarkup, holdersOf, type CircleOptions, type Perspective } from './circle'
import { timerMarkup, type TimerView } from './timer'
import { tallyMarkup, voteChoices, voteCounts, type VoteMode } from './vote'
import { outcomeCardMarkup } from './timeline'

// The target rule is the engine's (engine/targets.ts); re-exported so the
// screen and its tests keep one import.
export { legalTargets }

/**
 * How many players this role must pick before its action can be recorded.
 *
 * The Binding needs two, the potion needs one *before* the narrator chooses
 * which vial. Roles with no target need none.
 */
export const picksNeeded = (roleId: RoleId): number => {
  switch (ROLES[roleId].target.kind) {
    case 'twoPlayers':
      return 2
    case 'player':
    case 'potion':
      return 1
    default:
      return 0
  }
}

export type Layout = 'circle' | 'list'

/** The ballot from the narrator's side: whether the count may start, and how far it is. */
export interface DayBallot {
  revealable: boolean
  count: { shown: number; total: number } | null
}

/** The Family's pick tonight, once recorded — what the Godfather decides about. */
export const familyVictim = (state: GameState): Player | null => {
  const hit = state.pending.find((a) => a.kind === 'target' && a.roleId === 'KILLER')
  if (!hit || hit.kind !== 'target') return null
  return state.players.find((p) => p.id === hit.target) ?? null
}

const nameOf = (state: GameState, id: PlayerId): string =>
  state.players.find((p) => p.id === id)?.name ?? '?'

/**
 * The board as tonight has already left it.
 *
 * A card that changes hands mid-night — the Associate picking a side, the
 * Chameleon taking one from the centre — is rewritten by the resolver at
 * "End the night", so until then the Associate who had just said out loud
 * that he was staying with the town stayed dashed red and untargetable on
 * the narrator's own table for the rest of the night, in front of the
 * narrator who had been told otherwise. The choice sits in `pending` the
 * instant it is tapped and `resolveNight` applies these before it does
 * anything else, so reading them here says nothing that will not be true,
 * only sooner.
 */
const withChosenRoles = (state: GameState): GameState => {
  const swaps = state.pending.filter((a) => a.kind === 'chooseRole')
  if (swaps.length === 0) return state
  return {
    ...state,
    players: state.players.map((p) => {
      const swap = swaps.find((s) => s.roleId === p.roleId)
      return swap === undefined ? p : { ...p, roleId: swap.newRole }
    }),
  }
}

export const nightMarkup = (
  raw: GameState,
  locale: Locale,
  picked: readonly PlayerId[] = [],
  layout: Layout = 'circle',
  peek = false,
  /** Seats acting from their own phones tonight (docs/BIG-SCREEN.md §10). */
  phones: ReadonlySet<PlayerId> = new Set(),
): string => {
  const t = strings(locale)
  const roleId = currentStep(raw)
  if (roleId === null) return ''

  // `doomedTonight` re-runs the resolver over `pending`, which applies the
  // night's card changes itself; hand it the board that already has them and
  // it would look for a card nobody is holding any more and find the wrong
  // seat. It gets the state as recorded; everything below gets the board.
  const doomed = roleId === 'MEDIC' ? doomedTonight(raw) : []
  const state = withChosenRoles(raw)

  const role = ROLES[roleId]
  const roleStrings = t.roles[roleId]
  const targets = legalTargets(state, roleId)
  const spec = role.target

  const eligible = targets.map((p) => p.id)
  const victim = familyVictim(state)

  // The table as the acting player may see it, and that is the default: the
  // narrator can turn the phone at any moment without a tap. The seats stay
  // tappable for the narrator. Peek brings the roles and colours back for
  // this one step, for a narrator who has lost track of who is who.
  const view = perspectiveFor(state, roleId, picked)
  const list = layout === 'list'
  const table = (opts: CircleOptions = {}): string =>
    circleMarkup(
      state.players,
      locale,
      peek
        ? { showRoles: true, revealTeams: true, doomed, list, fitRoles: true, ...opts }
        : { perspective: view, list, ...opts },
    )

  // The narrator has to know who to wake, not just which role. v1 never said.
  // The Family wakes as a whole: the Godfather and the Renegade sit up with
  // the killers, and to the rest of the Family they are simply Family, so
  // this is names only. The Associate has joined nobody until he chooses.
  const holders =
    roleId === 'KILLER'
      ? state.players.filter(
          (p) => p.alive && ROLES[p.roleId].team === 'crew' && p.roleId !== 'PICK_SIDE',
        )
      : holdersOf(state.players, roleId)
  const who =
    holders.length > 0
      ? `<p class="card__who">${holders.map((p) => esc(p.name)).join(' · ')}</p>`
      : ''
  // Everyone this step wakes holds a phone: the answer comes from there, and
  // the seats below stay tappable for a narrator who has to step in.
  const waiting =
    holders.length > 0 && holders.every((p) => phones.has(p.id))
      ? `<p class="card__situation" data-on-phones>${esc(t.ui.night.onPhones(holders.map((p) => p.name)))}</p>`
      : ''

  const needed = picksNeeded(roleId)
  // The Apothecary's card is the tallest in the night — a prompt, a name and
  // two vials — and hers is the step where the narrator most needs to see the
  // whole table, since she is choosing who to poison. Her prompt already says
  // to pick somebody, and the vials are under it, so the line that says it
  // again is what gives up the height.
  const hint =
    spec.kind === 'split'
      ? `<p class="label">${esc(t.ui.night.splitHint)}</p>`
      : needed > 0 && picked.length < needed && spec.kind !== 'potion'
        ? `<p class="label">${esc(needed === 2 ? t.ui.night.pickTwo : t.ui.night.pickOne)}</p>`
        : ''

  // A sentence under the prompt when the step has a specific situation to
  // report: who the Family chose, or that both vials are gone.
  let situation = ''
  // What sits inside the card under the prompt: the Apothecary's vials.
  let inCard = ''
  let chooser: string
  let action: string

  if (roleId === 'CONVERT') {
    // The choice that was missing: the only button used to be Confirm, so the
    // narrator could not record "he lets the hit go ahead" — every night he
    // was prompted, the victim was converted.
    situation = victim ? t.ui.night.convertOffer(victim.name) : t.ui.night.convertNoVictim
    chooser = table({ selected: victim ? [victim.id] : [] })
    action = victim
      ? `<div class="actions actions--row">
           <button class="btn btn--ghost" type="button" data-night-confirm>${esc(t.ui.night.convert)}</button>
           <button class="btn btn--ghost" type="button" data-skip>${esc(t.ui.night.convertDecline)}</button>
         </div>`
      : `<div class="actions"><button class="btn btn--primary" type="button" data-skip>${esc(t.ui.common.next)}</button></div>`
  } else if (roleId === 'PICK_SIDE') {
    // Confirm used to record a bare `confirm`, which the resolver ignores, so
    // the Associate never actually picked a side. The choice is a role change.
    chooser = table()
    action = `<div class="actions actions--row">
        <button class="btn btn--ghost" type="button" data-choose-role="KILLER">${esc(t.ui.night.joinCrew)}</button>
        <button class="btn btn--ghost" type="button" data-choose-role="PLAIN">${esc(t.ui.night.stayTown)}</button>
      </div>`
  } else if (roleId === 'SWAP') {
    // The cards left in the centre, for the narrator to hold up. A scrolling
    // list in place of the circle: the choice is a card, not a person.
    const spare = spareCards(state.players)
    if (spare.length === 0) situation = t.ui.night.noSpareCards
    chooser =
      spare.length === 0
        ? table()
        : `<p class="label">${esc(t.ui.night.spareCards)}</p>
           <div class="table table--list"><div class="targets">${spare
             .map((id) => `<button class="target" type="button" data-choose-role="${id}">${esc(t.roles[id].name)}</button>`)
             .join('')}</div></div>`
    action = `<div class="actions"><button class="btn btn--ghost" type="button" data-skip>${esc(t.ui.night.keepCard)}</button></div>`
  } else if (spec.kind === 'split') {
    // Tap everyone in the first faction; the rest are the second. Confirm
    // is locked until both factions have someone in them.
    const living = state.players.filter((p) => p.alive).map((p) => p.id)
    const ready = picked.length > 0 && picked.length < living.length
    chooser = table({ pickAttr: 'target', eligible: living, selected: picked })
    action = `<div class="actions actions--row">
        <button class="btn btn--ghost" type="button" data-skip>${esc(t.ui.night.noOne)}</button>
        <button class="btn btn--primary" type="button" data-split-confirm ${ready ? '' : 'disabled'}>${esc(t.ui.night.splitConfirm)}</button>
      </div>`
  } else if (spec.kind === 'potion') {
    // The potion is spent on a specific player, so the vial buttons stay
    // locked until one is chosen — they used to fire against whoever was
    // first in the list. Each vial also works once: the cure only on someone
    // who is actually about to die, the poison on anyone still breathing.
    const target = picked.length === 1 ? (picked[0] as PlayerId) : null
    const canHeal = target !== null && !state.healUsed && doomed.includes(target)
    const canPoison = target !== null && !state.poisonUsed
    const vial = (
      kind: 'heal' | 'kill',
      cls: string,
      label: string,
      enabled: boolean,
      used: boolean,
    ): string =>
      `<button class="btn ${cls}" type="button" data-potion="${kind}" ${enabled ? '' : 'disabled'} ${used ? 'data-spent' : ''}>
         ${esc(used ? `${label} · ${t.ui.night.spent}` : label)}
       </button>`
    const bothSpent = state.healUsed && state.poisonUsed
    if (bothSpent) situation = t.ui.night.bothSpent
    chooser = table({ pickAttr: 'target', eligible, selected: picked })
    // The vials live in the card, under the prompt: a second full-width row
    // over the button used to take the room the circle needed on a phone.
    inCard = bothSpent
      ? ''
      : `<div class="potion card__potion">
        ${vial('heal', 'btn--ok', t.ui.night.heal, canHeal, state.healUsed)}
        ${vial('kill', 'btn--danger', t.ui.night.poison, canPoison, state.poisonUsed)}
      </div>`
    action = `<div class="actions"><button class="btn btn--ghost" type="button" data-skip>${esc(t.ui.night.noOne)}</button></div>`
  } else if (spec.kind === 'none') {
    // A role that picks nobody still gets the table, read-only, so the screen
    // keeps its shape and the narrator keeps their bearings.
    chooser = table()
    action = `<div class="actions"><button class="btn btn--primary" type="button" data-night-confirm>${esc(t.ui.common.confirm)}</button></div>`
  } else {
    // The circle is the default: tapping someone in their seat matches what
    // the narrator is looking at around the real table. Ineligible players
    // are dimmed and unclickable rather than hidden, so the table stays
    // readable.
    chooser = table({ pickAttr: 'target', eligible, selected: picked })
    action = `<div class="actions"><button class="btn btn--ghost" type="button" data-skip>${esc(t.ui.night.noOne)}</button></div>`
  }

  return `
    <section class="screen screen--night" data-accent="${accentOf(roleId)}">
      <header class="screen__head">
        <p class="night__counter">${esc(t.ui.night.stepCounter(state.stepIndex + 1, state.schedule.length))}</p>
        <div class="screen__tools">
          <button class="icon-btn icon-btn--word" type="button" data-peek aria-pressed="${peek}">${esc(peek ? t.ui.night.hideRoles : t.ui.night.showRoles)}</button>
          <button class="icon-btn icon-btn--word" type="button" data-show-player>${esc(t.ui.night.showPlayer)}</button>
          <button class="icon-btn" type="button" data-undo aria-label="${esc(t.ui.common.undo)}" title="${esc(t.ui.common.undo)}">↶</button>
        </div>
      </header>

      <div class="card card--role" data-role-card>
        <span class="card__sigil">${sigilMarkup(roleId)}</span>
        <h2 class="card__title">${esc(roleStrings.name)}</h2>
        ${who}
        <p class="card__body">${esc(roleStrings.prompt)}</p>
        ${situation ? `<p class="card__situation">${esc(situation)}</p>` : ''}
        ${waiting}
        ${role.wakesAsGroup ? `<p class="card__aside">${esc(t.ui.night.wakeGroup)}</p>` : ''}
        ${inCard}
      </div>

      ${hint}
      ${chooser}
      ${action}
    </section>
  `
}

/**
 * The Gunman takes someone with him, and the narrator has to ask him who.
 *
 * It is a night step in everything but where it falls, so it wears the night's
 * furniture: the role's card with its sigil and the holder's name, the line
 * the narrator says out loud, and the seating ring as the picker — the same
 * ring every other choice in this app is made on, rather than a column of
 * bare names. The undo is the point of the header: the shot arrives straight
 * after an execution, and a narrator who has just hanged the wrong person
 * needs the way back on the screen they are actually looking at.
 *
 * Every living seat is legal, the shooter included: it is the engine's rule
 * and nothing here narrows it.
 */
export const hunterMarkup = (
  state: GameState,
  locale: Locale,
  layout: 'circle' | 'list' = 'circle',
): string => {
  const t = strings(locale)
  const shooter = state.players.find((p) => p.id === state.awaitingHunterShot)
  const alive = state.players.filter((p) => p.alive)
  return `
    <section class="screen screen--night" data-accent="${accentOf('AVENGE')}">
      <header class="screen__head">
        <p class="night__counter">${esc(t.ui.dawn.verdict(state.day))}</p>
        <div class="screen__tools">
          <button class="icon-btn" type="button" data-undo aria-label="${esc(t.ui.common.undo)}" title="${esc(
            t.ui.common.undo,
          )}">↶</button>
        </div>
      </header>

      <div class="card card--role" data-role-card>
        <span class="card__sigil">${sigilMarkup('AVENGE')}</span>
        <h2 class="card__title">${esc(t.roles.AVENGE.name)}</h2>
        ${shooter === undefined ? '' : `<p class="card__who">${esc(shooter.name)}</p>`}
        <p class="card__body">${esc(t.roles.AVENGE.prompt)}</p>
        <p class="card__situation">${esc(t.ui.night.askShot)}</p>
      </div>

      <p class="label">${esc(t.ui.night.pickOne)}</p>
      ${circleMarkup(state.players, locale, {
        pickAttr: 'shoot',
        eligible: alive.map((p) => p.id),
        list: layout === 'list',
      })}
    </section>
  `
}

/**
 * What the player at this step is allowed to see of the table.
 *
 * Nothing about anyone else's role or side, ever: every colour the narrator
 * relies on disappears. Then only what the role itself already knows. The
 * Family sees the Family — all of it, in one red, with no "you" mark that
 * would single out which of the red seats is the Godfather or the Renegade.
 * The Apothecary sees who is about to die. Everyone else sees their own seat
 * and a plain table.
 */
export const perspectiveFor = (
  state: GameState,
  roleId: RoleId,
  picked: readonly PlayerId[] = [],
): Perspective => {
  // The Associate counts as crew for the deal but has not joined anyone yet
  // on his one step; he is shown the Family only once he is one of them.
  const crewViewer = ROLES[roleId].team === 'crew' && roleId !== 'PICK_SIDE'
  const living = state.players.filter((p) => p.alive)
  const victim = familyVictim(state)

  return {
    self: crewViewer ? [] : holdersOf(state.players, roleId).map((p) => p.id),
    crew: crewViewer ? living.filter((p) => ROLES[p.roleId].team === 'crew').map((p) => p.id) : [],
    doomed: roleId === 'MEDIC' ? doomedTonight(state) : [],
    marked: crewViewer && victim && roleId !== 'KILLER' ? [victim.id] : [...picked],
  }
}

/**
 * The phone turned around to the player whose step it is.
 *
 * The narrator taps Show, holds the screen up, and the player sees exactly
 * what their role knows and nothing more — the same table, stripped of every
 * colour and label that belongs to the narrator. The bar is not rendered
 * beneath it, for the same reason it is absent during a reveal.
 */
export const playerViewMarkup = (
  state: GameState,
  locale: Locale,
  picked: readonly PlayerId[] = [],
): string => {
  const t = strings(locale)
  const roleId = currentStep(state)
  if (roleId === null) return ''

  const view = perspectiveFor(state, roleId, picked)
  const victim = familyVictim(state)
  const lines: string[] = []
  const chips: { label: string; spent: boolean }[] = []

  if (roleId === 'MEDIC') {
    lines.push(
      view.doomed.length > 0
        ? t.ui.view.doomed(view.doomed.map((id) => nameOf(state, id)))
        : t.ui.view.doomedNone,
    )
    chips.push({ label: state.healUsed ? t.ui.view.cureSpent : t.ui.view.cureLeft, spent: state.healUsed })
    chips.push({ label: state.poisonUsed ? t.ui.view.poisonSpent : t.ui.view.poisonLeft, spent: state.poisonUsed })
  }
  if (ROLES[roleId].team === 'crew') {
    lines.push(t.ui.view.crewMarked)
    if (victim && roleId !== 'KILLER') lines.push(t.ui.view.victim(victim.name))
  }
  if (roleId === 'CONVERT') {
    chips.push({
      label: state.infectionUsed ? t.ui.view.convertSpent : t.ui.view.convertLeft,
      spent: state.infectionUsed,
    })
  }
  if (roleId === 'SWAP') {
    // The centre is his to look at; which card he takes stays between him
    // and the narrator.
    const spare = spareCards(state.players)
    lines.push(
      spare.length > 0
        ? t.ui.view.spare(spare.map((id) => t.roles[id].name))
        : t.ui.night.noSpareCards,
    )
  }
  if (roleId === 'SPLIT' && picked.length > 0) {
    // Only the Cultist ever sees the whole list.
    const living = state.players.filter((p) => p.alive)
    lines.push(t.ui.view.sectOne(living.filter((p) => picked.includes(p.id)).map((p) => p.name)))
    lines.push(t.ui.view.sectTwo(living.filter((p) => !picked.includes(p.id)).map((p) => p.name)))
  }

  return `
    <section class="screen screen--view" data-player-view data-accent="system">
      <p class="view__eyebrow">${esc(t.ui.view.showingTo)}</p>
      <h1 class="view__role">${esc(t.roles[roleId].name)}</h1>
      ${lines.map((line) => `<p class="view__line">${esc(line)}</p>`).join('')}
      ${
        chips.length > 0
          ? `<div class="view__chips">${chips
              .map((c) => `<span class="view__chip" ${c.spent ? 'data-spent' : ''}>${esc(c.label)}</span>`)
              .join('')}</div>`
          : ''
      }
      ${circleMarkup(state.players, locale, { perspective: view, selected: view.marked })}
      <div class="actions">
        <button class="btn btn--primary" type="button" data-view-done>${esc(t.ui.view.backToNarrator)}</button>
      </div>
    </section>
  `
}

export const dayMarkup = (
  state: GameState,
  locale: Locale,
  layout: Layout = 'circle',
  peek = false,
  timer: TimerView | null = null,
  voting: VoteMode | null = null,
  ballot: DayBallot | null = null,
): string => {
  const t = strings(locale)
  // Coloured cards, one per public outcome, in the colour of the role that
  // caused it — v1's displayCards, rebuilt on structured outcomes.
  const cards = state.log
    .filter((o) => o.night === state.night && o.public)
    .map((o, i) => outcomeCardMarkup(o, state.players, locale, i))
    .filter((c): c is string => c !== null)
  const report =
    cards.length > 0
      ? cards.join('')
      : `<li class="report__card report__card--quiet">${esc(t.phase.quietNight)}</li>`

  const living = state.players.filter((p) => p.alive).map((p) => p.id)

  /**
   * The town gets one execution a day, and after it the day screen went on
   * asking who to execute with every living seat still tappable — one stray
   * tap killed a second person, with no confirmation and nothing to say it
   * had happened but a second line in the log. Once the verdict is in, the
   * question gives way to the verdict and the seats stop being a choice,
   * until "Night falls" opens the next day.
   */
  const verdict = state.log.find(
    (o) => o.type === 'death' && o.cause === 'lynch' && o.night === state.night,
  )
  const executed = verdict !== undefined && verdict.type === 'death' ? nameOf(state, verdict.target) : null

  // Recording the vote is two taps a voter and optional; the seats swap from
  // executing to voting while it is on, and the count stays up either way.
  const counts = voteCounts(state)
  const top = leader(state)
  const armed = voting?.armed ?? null
  const armedName = state.players.find((p) => p.id === armed)?.name ?? ''
  // While the count comes up on the room's screen the question gives way to
  // its progress; the narrator's own tally underneath stays complete.
  const counting = ballot?.count !== null && ballot?.count !== undefined && ballot.count.shown < ballot.count.total ? ballot.count : null
  const question = executed !== null
    ? `<p class="label" data-verdict-in>${esc(t.ui.day.executed(executed))}</p>`
    : counting
      ? `<p class="label-row__hint">${esc(t.ui.day.counting)} · ${counting.shown} / ${counting.total}</p>`
      : voting
        ? `<p class="label-row__hint">${esc(armed === null ? t.ui.day.voteHint : t.ui.day.pickFor(armedName))}</p>`
        : `<p class="label">${esc(t.ui.day.whoDies)}</p>`
  const reveal = ballot?.revealable === true && executed === null
    ? `<button class="icon-btn icon-btn--word" type="button" data-reveal-votes>${esc(t.ui.day.reveal)}</button>`
    : ''
  // No attribute at all once the verdict is in: a seat with nothing to pick
  // it for is not a button, and `circleMarkup` renders the table read-only.
  const picking = executed !== null ? {} : { pickAttr: voting ? 'vote' : 'lynch' }
  const eligible = voting ? voteChoices(state, armed) : living
  const selected = armed === null ? [] : [armed]

  const flagged = state.players.filter((p) => p.alive && p.hasQuestion)
  const questions =
    flagged.length > 0
      ? `<div class="asks"><span class="asks__label">${esc(t.ui.reveal.hasQuestions)}</span>${flagged
          .map((p) => `<button class="asks__chip" type="button" data-ask="${p.id}">${esc(p.name)}<span class="seat__flag" aria-hidden="true">?</span></button>`)
          .join('')}</div>`
      : ''

  // "Show a role again" and "End the game" live in the overflow menu: they are
  // rare, and every button under the circle costs the circle height.
  //
  // The table is plain by default — names, who is dead, who has a question —
  // so the town can look at it after the slideshow. Roles and the crew glow
  // come back with the same toggle the night uses, for the narrator only.
  return `
    <section class="screen screen--day">
      <header class="screen__head screen__head--stacked">
        <h1 class="title">${esc(t.phase.townWakes)}</h1>
        <div class="screen__tools">
          <button class="icon-btn icon-btn--word" type="button" data-peek aria-pressed="${peek}">${esc(peek ? t.ui.night.hideRoles : t.ui.night.showRoles)}</button>
          <button class="icon-btn icon-btn--word" type="button" data-dawn-play title="${esc(t.ui.dawn.play)}">${esc(t.ui.day.morning)}</button>
          <button class="icon-btn" type="button" data-undo aria-label="${esc(t.ui.common.undo)}" title="${esc(t.ui.common.undo)}">↶</button>
        </div>
      </header>
      ${timer ? timerMarkup(timer, locale) : ''}
      ${questions}
      <h2 class="label">${esc(t.ui.day.report)}</h2>
      <ul class="report report--scroll">${report}</ul>

      <div class="label-row">
        ${question}
        <span class="label-row__tools">
          ${reveal}
          ${executed !== null ? '' : `<button class="icon-btn icon-btn--word" type="button" data-voting aria-pressed="${voting !== null}">${esc(voting ? t.ui.common.done : t.ui.day.votes)}</button>`}
        </span>
      </div>
      ${tallyMarkup(state, locale)}
      ${circleMarkup(state.players, locale, {
        ...picking, eligible, selected, showRoles: peek, revealTeams: peek, votes: counts, leader: top,
        list: layout === 'list', fitRoles: peek,
      })}

      <div class="actions">
        <button class="btn ${voting ? 'btn--ghost' : 'btn--primary'}" type="button" data-next-night>${esc(t.ui.day.nextNight)}</button>
      </div>
    </section>
  `
}

/**
 * The card the narrator holds up for the detective to read across the room.
 *
 * Deliberately enormous and colour-coded: it is read from a metre away, in a
 * dark room, by one person who must not have to lean in.
 */
export const inspectionMarkup = (
  subject: Player,
  locale: Locale,
): string => {
  const t = strings(locale)
  const role = ROLES[subject.roleId]

  return `
    <section class="screen screen--inspect" data-inspect>
      <p class="inspect__who">${esc(subject.name)}</p>
      <span class="inspect__sigil">${sigilMarkup(subject.roleId)}</span>
      <h1 class="inspect__role">${esc(t.roles[subject.roleId].name)}</h1>
      <p class="inspect__team" data-team="${role.team}">
        ${esc(role.team === 'crew' ? t.ui.reveal.sideCrew : t.ui.reveal.sideTown)}
      </p>
      <div class="actions actions--row">
        <button class="btn btn--ghost" type="button" data-inspect-back>${esc(t.ui.common.back)}</button>
        <button class="btn btn--primary" type="button" data-inspect-done>${esc(t.ui.common.done)}</button>
      </div>
    </section>
  `
}

/**
 * The private card for a player who flagged a question: their role, side, the
 * short brief and the fuller explanation, sized to be read at arm's length.
 * Same shape as the detective's card so the narrator's hands already know it.
 */
export const questionCardMarkup = (
  subject: Player,
  locale: Locale,
  position: number | null = null,
  total: number | null = null,
): string => {
  const t = strings(locale)
  const progress =
    position !== null && total !== null
      ? `<p class="reveal__progress">${esc(t.ui.night.stepCounter(position, total))}</p>`
      : ''

  // The card itself goes in behind the hold, never on the screen: the
  // narrator hands this phone to a player, and a tap-to-see card can be left
  // face up, handed on still showing, or photographed. The hold is the same
  // gesture, and the same security model, as the pass-around's.
  return `
    <section class="screen screen--inspect screen--ask" data-ask-card data-reveal-root>
      <div class="reveal__stage">
        <div class="reveal__slot" data-card></div>
        <div class="reveal__idle" data-idle>
          ${progress}
          <p class="inspect__who">${esc(subject.name)}</p>
          <p class="reveal__hint">${esc(t.ui.reveal.shieldScreen)}</p>
        </div>
      </div>
      <div class="reveal__controls">
        ${holdMarkup(t.ui.reveal, false)}
        <button class="btn btn--primary" type="button" data-question-done>${esc(t.ui.reveal.clearFlag)}</button>
      </div>
    </section>
  `
}

/**
 * What the player reads while the finger is down: their role, their side and
 * both explanations. The fuller `detail` lives here and nowhere else — it is
 * the answer to the question they flagged.
 */
export const askCardMarkup = (subject: Player, locale: Locale): string => {
  const t = strings(locale)
  const role = ROLES[subject.roleId]
  const r = t.roles[subject.roleId]
  return `
    <div class="reveal__card inspect__card">
      <p class="inspect__who">${esc(subject.name)}</p>
      <span class="inspect__sigil">${sigilMarkup(subject.roleId)}</span>
      <h1 class="inspect__role inspect__role--ask">${esc(r.card)}</h1>
      <p class="inspect__team" data-team="${role.team}">
        ${esc(role.team === 'crew' ? t.ui.reveal.teamCrew : t.ui.reveal.teamTown)}
      </p>
      <div class="inspect__scroll">
        <p class="inspect__brief">${esc(r.brief)}</p>
        <p class="inspect__detail">${esc(r.detail)}</p>
      </div>
    </div>
  `
}

/** The start of the questions round: who is waiting, and a way to begin. */
export const questionsIntroMarkup = (flagged: readonly Player[], locale: Locale): string => {
  const t = strings(locale)
  const first = flagged[0]
  return `
    <section class="screen screen--center">
      <h1 class="title title--sm">${esc(t.ui.reveal.questionsRound)}</h1>
      <p class="subtitle">${esc(t.ui.reveal.questionsIntro)}</p>
      <div class="asks asks--list">${flagged
        .map((p) => `<span class="asks__chip asks__chip--static">${esc(p.name)}</span>`)
        .join('')}</div>
      ${first ? `<button class="btn btn--primary" type="button" data-ask="${first.id}">${esc(t.ui.reveal.showRoleTo(first.name))}</button>` : ''}
    </section>
  `
}
