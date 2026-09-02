import { ROLES } from '../../engine/roles'
import type { Player, PlayerId } from '../../engine/types'
import { strings, type Locale } from '../../i18n'
import { accentOf } from '../accent'
import { sigilMarkup } from '../sigils'
import { esc } from '../dom'

/**
 * The seating circle.
 *
 * Player ids are seating positions, so this is the real table layout — which
 * is also what the Bloodhound's adjacency rule reads. It stays on screen for
 * the whole game and is the primary way the narrator picks targets: tapping
 * the person in their seat matches what the narrator is looking at around the
 * actual table far better than reading a list of names.
 *
 * Laid out entirely from --seats and --i so it reflows on rotation. v1
 * computed inline transforms in JS from offsetWidth at creation time and did
 * not survive a resize.
 */

/**
 * The table as one player is allowed to see it.
 *
 * Only the seats listed get any mark at all; every other seat is a name and
 * a number. `crew` is what the Family sees of itself, `doomed` what the
 * Santera is told, `self` the viewer's own chair, `marked` whatever their
 * own step has already chosen.
 */
export interface Perspective {
  self: readonly PlayerId[]
  crew: readonly PlayerId[]
  doomed: readonly PlayerId[]
  marked: readonly PlayerId[]
}

export interface CircleOptions {
  /**
   * Data attribute the seats carry, e.g. 'target' renders data-target="3" and
   * so reuses whatever handler already exists for that action. Omit for a
   * read-only circle.
   */
  pickAttr?: string
  /**
   * Who may be chosen right now. Everyone else is dimmed and disabled, so an
   * illegal target cannot be tapped by mistake. Omit to allow everyone living.
   */
  eligible?: readonly PlayerId[]
  /** Already chosen at this step. */
  selected?: readonly PlayerId[]
  showRoles?: boolean
  compact?: boolean
  /**
   * Mark the crew with a red glow. v2 did this on the narrator's board and it
   * is the fastest way to read a table: the narrator already knows everything,
   * and a glance beats reading six role labels.
   */
  revealTeams?: boolean
  /** Who is set to die tonight, for the Santera's step. */
  doomed?: readonly PlayerId[]
  /**
   * Render for a player's eyes rather than the narrator's: no roles, no team
   * colour, no question flags, no accent on any seat. Only what the
   * perspective lists is marked. Everything above that would leak is ignored.
   */
  perspective?: Perspective
}

const ARTICLE = /^(the|el|la|los|las)\s+/i

export const circleMarkup = (
  players: readonly Player[],
  locale: Locale,
  options: CircleOptions = {},
): string => {
  const t = strings(locale)
  const {
    pickAttr, eligible, selected = [], showRoles = false, compact = false, revealTeams = false,
    perspective,
  } = options
  // The tile has room for one word, not a title: "Bodyguard", not "The
  // Bodyguard"; "Santera", not "La Santera". The sigil above it already says
  // which role, so the label only has to confirm it.
  const tileRole = (roleId: Player['roleId']): string =>
    t.roles[roleId].name.replace(ARTICLE, '').trim()
  // A player is looking: nothing the narrator sees may reach the markup.
  const hidden = perspective !== undefined
  const doomed = perspective?.doomed ?? options.doomed ?? []

  const seats = players
    .map((p) => {
      const named = p.name.trim() !== ''
      const role = ROLES[p.roleId]
      const canPick =
        !hidden &&
        pickAttr !== undefined &&
        (eligible === undefined ? p.alive : eligible.includes(p.id))
      const crew = hidden
        ? perspective.crew.includes(p.id)
        : revealTeams && role.team === 'crew' && p.alive
      const self = hidden && perspective.self.includes(p.id)
      const doom = doomed.includes(p.id) && p.alive

      return `
        <button class="seat" type="button"
                ${canPick ? `data-${pickAttr}="${p.id}"` : 'disabled'}
                ${canPick ? '' : 'aria-hidden="true"'}
                data-accent="${hidden ? 'system' : accentOf(p.roleId)}"
                data-named="${named}"
                ${hidden ? '' : `data-team="${role.team}"`}
                ${p.alive ? '' : 'data-dead'}
                ${pickAttr !== undefined && !canPick && p.alive && !hidden ? 'data-ineligible' : ''}
                ${canPick ? 'data-pickable' : ''}
                ${selected.includes(p.id) ? 'data-selected' : ''}
                ${!hidden && p.hasQuestion ? 'data-question-flag' : ''}
                ${crew ? 'data-crew' : ''}
                ${self ? 'data-self' : ''}
                ${doom ? 'data-doomed' : ''}>
          <span class="seat__n" aria-hidden="true">${String(p.id + 1).padStart(2, '0')}</span>
          ${showRoles && !hidden ? `<span class="seat__sigil">${sigilMarkup(p.roleId)}</span>` : ''}
          <span class="seat__name" style="--len: ${named ? p.name.trim().length : 1}">${named ? esc(p.name) : '—'}</span>
          ${showRoles && !hidden ? `<span class="seat__role" style="--len: ${tileRole(p.roleId).length}">${esc(tileRole(p.roleId))}</span>` : ''}
          ${self ? `<span class="seat__you">${esc(t.ui.view.you)}</span>` : ''}
          ${!hidden && p.hasQuestion ? '<span class="seat__flag" aria-hidden="true">?</span>' : ''}
          ${doom ? '<span class="seat__doom" aria-hidden="true">✕</span>' : ''}
        </button>
      `
    })
    .join('')

  // The wrapper is a size container: the circle measures the room it has been
  // given (width *and* height) and shrinks to fit, so the whole table stays on
  // one phone screen instead of pushing the buttons below it off the bottom.
  return `<div class="table${compact ? ' table--compact' : ''}"><div class="circle${compact ? ' circle--compact' : ''}" style="--seats: ${players.length}">${seats}</div></div>`
}

/** A plain list of the same choices, for narrators who prefer names to seats. */
export const listMarkup = (
  players: readonly Player[],
  pickAttr: string,
  eligible: readonly PlayerId[],
  selected: readonly PlayerId[] = [],
): string => {
  const options = players
    .filter((p) => eligible.includes(p.id))
    .map(
      (p) =>
        `<button class="target" type="button" data-${pickAttr}="${p.id}"${
          selected.includes(p.id) ? ' data-picked' : ''
        }>${esc(p.name)}</button>`,
    )
    .join('')

  return `<div class="table table--list"><div class="targets">${options}</div></div>`
}

/** Who currently holds a role — what the narrator actually needs to know. */
export const holdersOf = (players: readonly Player[], roleId: string): Player[] =>
  players.filter((p) => p.alive && p.roleId === roleId)
