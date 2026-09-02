import { ROLE_IDS, ROLES } from '../../engine/roles'
import { COMPLEXITIES, type Complexity } from '../../engine/deal'
import type { RoleId } from '../../engine/roles'
import type { Player } from '../../engine/types'
import { strings, type Locale } from '../../i18n'
import { esc } from '../dom'
import { circleMarkup } from './circle'

export const MIN_PLAYERS = 4
export const MAX_PLAYERS = 20

/**
 * Name entry. One field, Enter adds, repeat.
 *
 * This replaces the "how many players?" grid: the count is simply how many
 * names were typed. With roles dealt at random this is all the narrator ever
 * needs to enter, and the list is remembered between games so the same group
 * never types it twice.
 */
export const namesMarkup = (names: readonly string[], locale: Locale): string => {
  const t = strings(locale)
  const enough = names.length >= MIN_PLAYERS

  const chips = names
    .map(
      (name, i) => `
        <li class="name-chip" style="--i: ${i}">
          <span class="name-chip__text">${esc(name)}</span>
          <button class="name-chip__remove" type="button" data-remove-name="${i}"
                  aria-label="${esc(t.ui.setup.remove)}">×</button>
        </li>`,
    )
    .join('')

  return `
    <section class="screen screen--names">
      <h1 class="title">${esc(t.appName)}</h1>
      <p class="subtitle">${esc(t.ui.setup.whoIsPlaying)}</p>

      <form class="name-form" data-name-form autocomplete="off">
        <input class="field__input name-form__input" type="text" data-new-name
               placeholder="${esc(t.ui.setup.namePlaceholder)}"
               enterkeyhint="next" autocapitalize="words" autofocus>
        <button class="btn btn--primary" type="submit">${esc(t.ui.setup.addName)}</button>
      </form>
      <p class="field__hint">${esc(t.ui.setup.addHint)}</p>

      <ul class="name-list fill">${chips}</ul>

      <div class="actions">
        <button class="btn btn--primary" type="button" data-names-done ${enough ? '' : 'disabled'}>
          ${esc(enough ? t.ui.setup.namesReady(names.length) : t.ui.setup.minPlayers(MIN_PLAYERS))}
        </button>
        ${names.length > 0 ? `<button class="btn btn--ghost btn--small" type="button" data-clear-names>${esc(t.ui.setup.clearNames)}</button>` : ''}
      </div>
    </section>
  `
}

/** Players sit in a circle; ids are seating positions, which the growl uses. */
export const rosterMarkup = (
  players: readonly Player[],
  locale: Locale,
  complexity: Complexity = 'standard',
  rearranging = false,
  armed: number | null = null,
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

  // One header row: the title and the seat-rearranging toggle share it, so
  // the circle below gets every pixel it can. Complexity sits with the deal
  // button it belongs to.
  return `
    <section class="screen screen--roster">
      <header class="screen__head">
        <h1 class="title title--sm">${esc(t.ui.setup.players)}</h1>
        <button class="btn btn--ghost btn--small" type="button" data-rearrange ${rearranging ? 'data-on' : ''}>
          ${esc(rearranging ? t.ui.setup.rearrangeDone : t.ui.setup.rearrange)}
        </button>
      </header>
      <p class="subtitle subtitle--sm">${esc(rearranging ? t.ui.setup.rearrangeHint : t.ui.setup.tapToEdit)}</p>
      ${circleMarkup(players, locale, {
        pickAttr: rearranging ? 'swap' : 'seat',
        eligible: players.map((p) => p.id),
        selected: armed === null ? [] : [armed],
        showRoles: assigned,
        revealTeams: assigned,
      })}

      <div class="complexity" role="group" aria-label="${esc(t.ui.setup.complexity)}">
        <p class="label">${esc(t.ui.setup.complexity)}</p>
        <div class="chips">${levels}</div>
      </div>

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
          <button class="btn btn--ghost btn--small" type="button" data-nudge="-1">${esc(t.ui.setup.moveLeft)}</button>
          <button class="btn btn--ghost btn--small" type="button" data-nudge="1">${esc(t.ui.setup.moveRight)}</button>
        </div>
        <div class="actions actions--row">
          <button class="btn btn--ghost" type="button" data-cancel>${esc(t.ui.common.cancel)}</button>
          <button class="btn btn--primary" type="button" data-save>${esc(t.ui.setup.save)}</button>
        </div>
      </div>
    </div>
  `
}
