import { ROLE_IDS, ROLES } from '../../engine/roles'
import { balanceOf } from '../../engine/balance'
import { COMPLEXITIES, type Complexity } from '../../engine/deal'
import type { RoleId } from '../../engine/roles'
import type { Player } from '../../engine/types'
import { strings, type Locale } from '../../i18n'
import { esc } from '../dom'
import { circleMarkup } from './circle'

export const MIN_PLAYERS = 4
export const MAX_PLAYERS = 20

/**
 * The big screen, as the names screen shows it (docs/BIG-SCREEN.md §11).
 * Before a room: the code field, and the key under it the first time. With
 * a room: one line saying which screen this phone runs and who is on it;
 * the QR is the screen's, never this phone's.
 */
export interface ScreenJoin {
  room: { code: string; tvs: number; phones: number } | null
  /** No key stored yet, or the relay refused the one there was. */
  needsKey: boolean
  busy: boolean
  error: 'key' | 'relay' | 'room' | null
  /** Where a TV goes to start a room, as something to read out. */
  address: string
  /**
   * Whether the code and key fields are unfolded.
   *
   * They are two hundred pixels of room plumbing on a screen whose job is
   * names — on a 375x667 phone they left the roster one row tall, so a
   * narrator typing four names could see two of them. Most tables have no
   * screen at all, so the fields wait behind one line until somebody with a
   * screen asks for them.
   */
  open: boolean
  /**
   * What is typed in the two fields right now.
   *
   * A refused claim used to come back with both boxes empty, so a narrator
   * who had the code right and fumbled only the key retyped both of them in
   * front of the table. Only the field the relay actually rejected is
   * cleared; the other comes back as it was typed.
   */
  code: string
  key: string
}

/** Two people at the table answer to the same name. Case and spacing aside. */
const sameName = (a: string, b: string): boolean =>
  a.trim().toLocaleLowerCase() === b.trim().toLocaleLowerCase()

/**
 * Name entry. One field, Enter adds, repeat.
 *
 * This replaces the "how many players?" grid: the count is simply how many
 * names were typed. With roles dealt at random this is all the narrator ever
 * needs to enter, and the list is remembered between games so the same group
 * never types it twice.
 */
/** Stands in for the address in the hint until it is set as a link. */
const ADDRESS = '\u0000address\u0000'

/** The hint with the TV's address as a link a TV on the root page can follow. */
const addressLine = (hint: string, address: string, title: string): string =>
  esc(hint).replace(ADDRESS, `<a class="screen-link" href="tv.html" title="${esc(title)}" data-this-is-screen>${esc(address)}</a>`)

export const namesMarkup = (
  names: readonly string[],
  locale: Locale,
  joined: ReadonlySet<number> = new Set(),
  screen: ScreenJoin | null = null,
): string => {
  const t = strings(locale)
  const enough = names.length >= MIN_PLAYERS
  const st = t.ui.setup
  const r = t.ui.room

  // The screen's block. With a room it is a status line; without, the
  // field for the code the TV shows, and the key the first time.
  let screenBlock = ''
  if (screen !== null && screen.room !== null) {
    const status = `${screen.room.tvs > 0 ? r.tvs(screen.room.tvs) : r.noTv} · ${r.players(screen.room.phones)}`
    screenBlock = `
      <div class="room-line" data-room-line>
        <span class="room-line__code">${esc(st.onScreen(screen.room.code))}</span>
        <span class="room-line__status">${esc(status)}</span>
      </div>`
  } else if (screen !== null && !screen.open) {
    // Folded: where a TV goes, and the way in for a narrator who has one.
    screenBlock = `
      <div class="screen-fold">
        <p class="field__hint">${addressLine(st.screenHint(ADDRESS), screen.address, st.thisIsScreen)}</p>
        <button class="btn btn--ghost btn--small" type="button" data-screen-open>${esc(st.screenOpen)}</button>
      </div>`
  } else if (screen !== null) {
    const error =
      screen.error === 'room' ? st.noSuchScreen : screen.error === 'key' ? r.refused : screen.error === 'relay' ? r.failed : ''
    screenBlock = `
      <form class="screen-join" data-screen-form autocomplete="off">
        <label class="field">
          <span class="field__label">${esc(st.screenCode)}</span>
          <div class="screen-join__row">
            <input class="field__input screen-join__input" type="text" data-screen-code
                   inputmode="latin" autocapitalize="characters" autocorrect="off" spellcheck="false"
                   maxlength="5" pattern="[A-Za-z0-9]{5}" placeholder="·····"
                   value="${esc(screen.code)}"${screen.busy ? ' disabled' : ''}>
            <button class="btn btn--primary" type="submit" data-screen-submit${
              screen.busy || screen.code.length !== 5 ? ' disabled' : ''
            }>${esc(screen.busy ? st.screenJoining : st.screenJoin)}</button>
          </div>
        </label>
        ${
          screen.needsKey
            ? `<label class="field">
                 <span class="field__label">${esc(r.key)}</span>
                 <input class="field__input" type="text" data-screen-key
                        autocapitalize="off" autocorrect="off" spellcheck="false" autocomplete="off"
                        value="${esc(screen.key)}">
                 <span class="field__hint">${esc(st.screenKeyHint)}</span>
               </label>`
            : ''
        }
        ${error === '' ? `<p class="field__hint">${addressLine(st.screenHint(ADDRESS), screen.address, st.thisIsScreen)}</p>` : `<p class="notice" data-screen-error>${esc(error)}</p>`}
      </form>`
  }

  // A seat taken from a phone through the room carries the same mark the big
  // screen gives it — a separated dot in the accent, not a character glued to
  // the end of the name — since this is the list the narrator reads to work
  // out who still has to scan.
  //
  // Two people answering to one name is allowed and always has been, but two
  // phones under one name are two chips nobody can tell apart, so the ones
  // that clash say so and the list carries a quiet line naming them.
  const clashes = names.filter((name, i) => names.some((other, j) => j !== i && sameName(name, other)))
  // One entry a clash, in the spelling it was first typed in: "Ana" and
  // "ana" are the same collision, and naming both of them would read as two.
  const clashing = clashes.filter((name, i) => !clashes.some((other, j) => j < i && sameName(name, other)))
    .map((n) => n.trim())
  const chips = names
    .map(
      (name, i) => `
        <li class="name-chip" style="--i: ${i}"${joined.has(i) ? ' data-joined' : ''}${
          clashes.includes(name) ? ' data-clash' : ''
        }>
          <span class="name-chip__text">${esc(name)}</span>
          ${joined.has(i) ? `<span class="name-chip__mark" aria-label="${esc(t.ui.table.onPhone)}">●</span>` : ''}
          <button class="name-chip__remove" type="button" data-remove-name="${i}"
                  aria-label="${esc(t.ui.setup.remove)}">×</button>
        </li>`,
    )
    .join('')

  return `
    <section class="screen screen--names">
      <h1 class="title">${esc(t.appName)}</h1>
      ${screen?.room ? screenBlock : ''}
      <p class="subtitle">${esc(t.ui.setup.whoIsPlaying)}</p>

      <form class="name-form" data-name-form autocomplete="off">
        <input class="field__input name-form__input" type="text" data-new-name
               placeholder="${esc(t.ui.setup.namePlaceholder)}"
               enterkeyhint="next" autocapitalize="words" autofocus>
        <button class="btn btn--primary" type="submit">${esc(t.ui.setup.addName)}</button>
      </form>
      <p class="field__hint">${esc(t.ui.setup.addHint)}</p>

      <ul class="name-list"${names.length === 0 ? ' data-empty' : ''}>${chips}</ul>
      ${clashing.length === 0 ? '' : `<p class="field__hint field__hint--clash">${esc(st.sameName(clashing))}</p>`}
      ${screen?.room ? '' : screenBlock}

      <div class="actions">
        <button class="btn btn--primary" type="button" data-names-done ${enough && clashing.length === 0 ? '' : 'disabled'}>
          ${esc(
            !enough
              ? t.ui.setup.minPlayers(MIN_PLAYERS)
              : clashing.length > 0
                ? t.ui.setup.sameNameFirst
                : screen?.room !== null && screen !== null
                  ? t.ui.table.proceed
                  : t.ui.setup.namesReady(names.length),
          )}
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
        ${balanceMarkup(players, locale, complexity, assigned)}
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

/**
 * One line under the complexity: how many will be Family, and which way the
 * table leans. Before the deal it describes what the dealer will do; after it,
 * or after roles were set by hand, it counts the Family actually at the table,
 * and the lean is only claimed when that matches the dealer's plan.
 */
export const balanceMarkup = (
  players: readonly Player[],
  locale: Locale,
  complexity: Complexity,
  assigned: boolean,
): string => {
  const t = strings(locale)
  const plan = balanceOf(players.length, complexity)
  const crew = assigned ? players.filter((p) => ROLES[p.roleId].team === 'crew').length : plan.crew
  const lean = crew === plan.crew ? t.ui.setup.lean[plan.lean] : null
  return `
    <p class="balance" data-lean="${crew === plan.crew ? plan.lean : 'custom'}">
      ${esc(t.ui.setup.balance(crew, players.length))}${lean === null ? '' : ` · ${esc(lean)}`}
    </p>
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
