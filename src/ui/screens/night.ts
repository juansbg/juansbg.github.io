import { ROLES, type RoleId } from '../../engine/roles'
import { currentStep } from '../../engine/state'
import type { GameState, Player, PlayerId } from '../../engine/types'
import { morningReport, strings, type Locale } from '../../i18n'
import { esc } from '../dom'

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

export const nightMarkup = (
  state: GameState,
  locale: Locale,
  picked: readonly PlayerId[] = [],
): string => {
  const t = strings(locale)
  const roleId = currentStep(state)
  if (roleId === null) return ''

  const role = ROLES[roleId]
  const roleStrings = t.roles[roleId]
  const targets = legalTargets(state, roleId)
  const spec = role.target

  const options = targets
    .map(
      (p) =>
        `<button class="target" type="button" data-target="${p.id}"${
          picked.includes(p.id) ? ' data-picked' : ''
        }>${esc(p.name)}</button>`,
    )
    .join('')

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

  const needed = picksNeeded(roleId)
  const hint =
    needed > 0 && picked.length < needed
      ? `<p class="night__hint">${esc(needed === 2 ? t.ui.night.pickTwo : t.ui.night.pickOne)}</p>`
      : ''

  const targetList =
    spec.kind === 'none'
      ? `<button class="btn btn--primary" type="button" data-confirm>${esc(t.ui.common.confirm)}</button>`
      : `<div class="targets">${options}</div>`

  return `
    <section class="screen screen--night" style="--role: var(--role-${roleId})">
      <header class="night__head">
        <p class="night__counter">${esc(t.ui.night.stepCounter(state.stepIndex + 1, state.schedule.length))}</p>
        <button class="icon-btn" type="button" data-undo aria-label="${esc(t.ui.common.undo)}">↶</button>
      </header>

      <div class="card" data-role-card>
        <h2 class="card__title">${esc(roleStrings.name)}</h2>
        <p class="card__body">${esc(roleStrings.prompt)}</p>
        ${role.wakesAsGroup ? `<p class="card__aside">${esc(t.ui.night.wakeGroup)}</p>` : ''}
      </div>

      ${hint}
      ${targetList}
      ${potion}

      <button class="btn btn--ghost" type="button" data-skip>${esc(t.ui.night.noOne)}</button>
    </section>
  `
}

export const dayMarkup = (state: GameState, locale: Locale): string => {
  const t = strings(locale)
  const lines = morningReport(state, state.night, locale)

  const report = lines
    .map((line, i) => `<li class="report__line" style="--i: ${i}">${esc(line)}</li>`)
    .join('')

  const living = state.players.filter((p) => p.alive)
  const candidates = living
    .map((p) => {
      const silenced = p.silencedOnDay === state.day
      return `
        <button class="target" type="button" data-lynch="${p.id}" ${silenced ? 'data-silenced' : ''}>
          ${esc(p.name)}${silenced ? ' 🤐' : ''}
        </button>
      `
    })
    .join('')

  return `
    <section class="screen screen--day">
      <h1 class="title title--sm">${esc(t.phase.townWakes)}</h1>
      <h2 class="subtitle subtitle--sm">${esc(t.ui.day.report)}</h2>
      <ul class="report">${report}</ul>

      <p class="subtitle subtitle--sm">${esc(t.ui.day.whoDies)}</p>
      <div class="targets">${candidates}</div>

      <div class="actions actions--row">
        <button class="btn btn--ghost" type="button" data-show-role>${esc(t.ui.reveal.showAgain)}</button>
        <button class="btn btn--primary" type="button" data-next-night>${esc(t.ui.day.nextNight)}</button>
      </div>
    </section>
  `
}
