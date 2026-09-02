import { ROLE_IDS, ROLES } from '../../engine/roles'
import { COMPLEXITIES, type Complexity } from '../../engine/deal'
import type { RoleId } from '../../engine/roles'
import type { Player } from '../../engine/types'
import { strings, type Locale } from '../../i18n'
import { esc } from '../dom'
import { circleMarkup } from './circle'

export const MIN_PLAYERS = 4
export const MAX_PLAYERS = 20

export const countPickerMarkup = (locale: Locale): string => {
  const t = strings(locale)
  const buttons = Array.from({ length: MAX_PLAYERS - MIN_PLAYERS + 1 }, (_, i) => {
    const n = MIN_PLAYERS + i
    return `<button class="count" type="button" data-count="${n}">${n}</button>`
  }).join('')

  return `
    <section class="screen screen--setup">
      <h1 class="title">${esc(t.appName)}</h1>
      <p class="subtitle">${esc(t.ui.setup.howMany)}</p>
      <div class="count-grid">${buttons}</div>
    </section>
  `
}

/** Players sit in a circle; ids are seating positions, which the growl uses. */
export const rosterMarkup = (
  players: readonly Player[],
  locale: Locale,
  complexity: Complexity = 'standard',
): string => {
  const t = strings(locale)
  const named = players.every((p) => p.name.trim() !== '')
  // Roles are shown once any have been assigned, whether by the dealer or by
  // hand. Everyone starts as a Citizen, so an all-Citizen table means nothing
  // has been assigned yet.
  const assigned = players.some((p) => p.roleId !== 'PLAIN')
  // A table with no crew can never end, so it is not a startable game. This
  // also fixes Start staying disabled forever when roles were set by hand.
  const hasCrew = players.some((p) => ROLES[p.roleId].team === 'crew')
  const ready = named && hasCrew

  const levels = (COMPLEXITIES as readonly Complexity[])
    .map(
      (c) =>
        `<button class="chip" type="button" data-complexity="${c}"${
          c === complexity ? ' data-on' : ''
        }>${esc(t.ui.setup[c])}</button>`,
    )
    .join('')

  return `
    <section class="screen screen--roster">
      <h1 class="title title--sm">${esc(t.ui.setup.players)}</h1>
      <p class="subtitle subtitle--sm">${esc(t.ui.setup.tapToEdit)}</p>
      ${circleMarkup(players, locale, { pickAttr: 'seat', eligible: players.map((p) => p.id), showRoles: assigned })}

      <p class="field__label">${esc(t.ui.setup.complexity)}</p>
      <div class="chips">${levels}</div>

      <div class="actions">
        <button class="btn ${assigned ? 'btn--ghost' : 'btn--primary'}" type="button"
                data-deal-random ${named ? '' : 'disabled'}>
          ${esc(t.ui.setup.dealRandom)}
        </button>
        <button class="btn btn--primary" type="button" data-deal ${ready ? '' : 'disabled'}>
          ${esc(ready ? t.ui.setup.start : t.ui.setup.incomplete)}
        </button>
      </div>
    </section>
  `
}

export const editorMarkup = (player: Player, locale: Locale): string => {
  const t = strings(locale)
  const options = ([...ROLE_IDS] as RoleId[])
    .slice()
    .sort((a, b) => t.roles[a].name.localeCompare(t.roles[b].name, locale))
    .map(
      (id) =>
        `<option value="${id}" ${id === player.roleId ? 'selected' : ''}>${esc(t.roles[id].name)}</option>`,
    )
    .join('')

  return `
    <div class="sheet" data-sheet>
      <div class="sheet__panel" role="dialog" aria-modal="true">
        <label class="field">
          <span class="field__label">${esc(t.ui.setup.namePlaceholder)}</span>
          <input class="field__input" type="text" data-name value="${esc(player.name)}"
                 placeholder="${esc(t.ui.setup.namePlaceholder)}" autocomplete="off" enterkeyhint="done">
        </label>
        <label class="field">
          <span class="field__label">${esc(t.ui.setup.rolePlaceholder)}</span>
          <select class="field__input" data-role>${options}</select>
        </label>
        <p class="field__hint">${esc(t.roles[player.roleId].prompt)}</p>
        <div class="actions actions--row">
          <button class="btn btn--ghost" type="button" data-cancel>${esc(t.ui.common.cancel)}</button>
          <button class="btn btn--primary" type="button" data-save>${esc(t.ui.setup.save)}</button>
        </div>
      </div>
    </div>
  `
}

export const roleAccent = (roleId: RoleId): string => `var(--role-${ROLES[roleId].id})`
