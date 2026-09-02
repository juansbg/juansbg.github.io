import { ROLES, type RoleId } from '../../engine/roles'
import { currentStep } from '../../engine/state'
import type { GameState, Player, PlayerId } from '../../engine/types'
import { strings, type Locale } from '../../i18n'
import { esc } from '../dom'
import { circleMarkup, holdersOf, listMarkup } from './circle'
import { outcomeCardMarkup } from './timeline'

/** Who this role may target tonight, after its own constraints. */
export const legalTargets = (state: GameState, roleId: RoleId): Player[] => {
  const spec = ROLES[roleId].target
  const living = state.players.filter((p) => p.alive)
  if (spec.kind !== 'player') return living

  return living.filter((p) => {
    // The killers never eat their own.
    if (ROLES[roleId].team === 'crew' && ROLES[p.roleId].team === 'crew') return false
    if (!spec.mayTargetSelf && p.roleId === roleId) return false
    // "…but never the same person two nights running."
    if (!spec.mayRepeatConsecutively && p.protectedLastNight) return false
    return true
  })
}

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

/**
 * The circle/list switch, as an icon in the screen header. It sits beside the
 * chooser it affects; the overflow menu carries the same switch with words.
 */
export const layoutToggleMarkup = (layout: Layout, locale: Locale): string => {
  const t = strings(locale)
  const label = layout === 'circle' ? t.ui.night.asList : t.ui.night.asCircle
  return `<button class="icon-btn" type="button" data-layout aria-label="${esc(label)}" title="${esc(label)}">${
    layout === 'circle' ? '☰' : '◯'
  }</button>`
}

export const nightMarkup = (
  state: GameState,
  locale: Locale,
  picked: readonly PlayerId[] = [],
  layout: Layout = 'circle',
): string => {
  const t = strings(locale)
  const roleId = currentStep(state)
  if (roleId === null) return ''

  const role = ROLES[roleId]
  const roleStrings = t.roles[roleId]
  const targets = legalTargets(state, roleId)
  const spec = role.target

  const eligible = targets.map((p) => p.id)

  // The potion is spent on a specific player, so the vial buttons stay locked
  // until one is chosen. Previously they fired against whoever happened to be
  // first in the list, which silently healed or poisoned the wrong person.
  const armed = picked.length === 1
  const potion =
    spec.kind === 'potion'
      ? `<div class="potion">
           <button class="btn btn--ok" type="button" data-potion="heal" ${armed ? '' : 'disabled'}>
             ${esc(t.ui.night.heal)}
           </button>
           <button class="btn btn--danger" type="button" data-potion="kill" ${armed ? '' : 'disabled'}>
             ${esc(t.ui.night.poison)}
           </button>
         </div>`
      : ''

  // The narrator has to know who to wake, not just which role. v1 never said.
  const holders = holdersOf(state.players, roleId)
  const who =
    holders.length > 0
      ? `<p class="card__who">${holders.map((p) => esc(p.name)).join(' · ')}</p>`
      : ''

  const needed = picksNeeded(roleId)
  const hint =
    needed > 0 && picked.length < needed
      ? `<p class="label">${esc(needed === 2 ? t.ui.night.pickTwo : t.ui.night.pickOne)}</p>`
      : ''

  // The circle is the default: tapping someone in their seat matches what the
  // narrator is looking at around the real table. Ineligible players are
  // dimmed and unclickable rather than hidden, so the table stays readable.
  // A role that picks nobody still gets the table, read-only, so the screen
  // keeps its shape and the narrator keeps their bearings.
  const chooser =
    spec.kind === 'none'
      ? circleMarkup(state.players, locale, { showRoles: true, revealTeams: true })
      : layout === 'circle'
        ? circleMarkup(state.players, locale, {
            pickAttr: 'target',
            eligible,
            selected: picked,
            showRoles: true,
            revealTeams: true,
          })
        : listMarkup(state.players, 'target', eligible, picked)

  const action =
    spec.kind === 'none'
      ? `<button class="btn btn--primary" type="button" data-night-confirm>${esc(t.ui.common.confirm)}</button>`
      : `${potion}<button class="btn btn--ghost" type="button" data-skip>${esc(t.ui.night.noOne)}</button>`

  return `
    <section class="screen screen--night" style="--role: var(--role-${roleId})">
      <header class="screen__head">
        <p class="night__counter">${esc(t.ui.night.stepCounter(state.stepIndex + 1, state.schedule.length))}</p>
        <div class="screen__tools">
          ${layoutToggleMarkup(layout, locale)}
          <button class="icon-btn" type="button" data-undo aria-label="${esc(t.ui.common.undo)}" title="${esc(t.ui.common.undo)}">↶</button>
        </div>
      </header>

      <div class="card" data-role-card>
        <h2 class="card__title">${esc(roleStrings.name)}</h2>
        ${who}
        <p class="card__body">${esc(roleStrings.prompt)}</p>
        ${role.wakesAsGroup ? `<p class="card__aside">${esc(t.ui.night.wakeGroup)}</p>` : ''}
      </div>

      ${hint}
      ${chooser}
      <div class="actions">${action}</div>
    </section>
  `
}

export const dayMarkup = (
  state: GameState,
  locale: Locale,
  layout: Layout = 'circle',
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

  const flagged = state.players.filter((p) => p.alive && p.hasQuestion)
  const questions =
    flagged.length > 0
      ? `<p class="card__aside card__aside--flag">${esc(t.ui.reveal.hasQuestions)}: ${flagged
          .map((p) => esc(p.name))
          .join(' · ')}</p>`
      : ''

  // "Show a role again" and "End the game" live in the overflow menu: they are
  // rare, and every button under the circle costs the circle height.
  return `
    <section class="screen screen--day">
      <header class="screen__head">
        <h1 class="title title--sm">${esc(t.phase.townWakes)}</h1>
        <div class="screen__tools">${layoutToggleMarkup(layout, locale)}</div>
      </header>
      ${questions}
      <h2 class="label">${esc(t.ui.day.report)}</h2>
      <ul class="report report--scroll">${report}</ul>

      <p class="label">${esc(t.ui.day.whoDies)}</p>
      ${
        layout === 'circle'
          ? circleMarkup(state.players, locale, {
              pickAttr: 'lynch', eligible: living, showRoles: true, revealTeams: true,
            })
          : listMarkup(state.players, 'lynch', living)
      }

      <div class="actions">
        <button class="btn btn--primary" type="button" data-next-night>${esc(t.ui.day.nextNight)}</button>
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
    <section class="screen screen--inspect" data-inspect
             style="--role: var(--role-${subject.roleId})">
      <p class="inspect__who">${esc(subject.name)}</p>
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
