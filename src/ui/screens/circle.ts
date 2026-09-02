import { ROLES } from '../../engine/roles'
import type { Player, PlayerId } from '../../engine/types'
import { strings, type Locale } from '../../i18n'
import { accentOf } from '../accent'
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
}

export const circleMarkup = (
  players: readonly Player[],
  locale: Locale,
  options: CircleOptions = {},
): string => {
  const t = strings(locale)
  const {
    pickAttr, eligible, selected = [], showRoles = false, compact = false, revealTeams = false,
  } = options

  const seats = players
    .map((p) => {
      const named = p.name.trim() !== ''
      const role = ROLES[p.roleId]
      const canPick =
        pickAttr !== undefined && (eligible === undefined ? p.alive : eligible.includes(p.id))

      return `
        <button class="seat" type="button"
                ${canPick ? `data-${pickAttr}="${p.id}"` : 'disabled'}
                ${canPick ? '' : 'aria-hidden="true"'}
                data-accent="${accentOf(p.roleId)}"
                data-named="${named}"
                data-team="${role.team}"
                ${p.alive ? '' : 'data-dead'}
                ${pickAttr !== undefined && !canPick && p.alive ? 'data-ineligible' : ''}
                ${canPick ? 'data-pickable' : ''}
                ${selected.includes(p.id) ? 'data-selected' : ''}
                ${p.hasQuestion ? 'data-question-flag' : ''}
                ${revealTeams && role.team === 'crew' && p.alive ? 'data-crew' : ''}>
          <span class="seat__n" aria-hidden="true">${String(p.id + 1).padStart(2, '0')}</span>
          <span class="seat__name">${named ? esc(p.name) : '—'}</span>
          ${showRoles ? `<span class="seat__role">${esc(t.roles[p.roleId].name)}</span>` : ''}
          ${p.hasQuestion ? '<span class="seat__flag" aria-hidden="true">?</span>' : ''}
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
