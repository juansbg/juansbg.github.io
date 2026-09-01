import { ROLES } from '../../engine/roles'
import type { Player, PlayerId } from '../../engine/types'
import { strings, type Locale } from '../../i18n'
import { esc } from '../dom'

/**
 * The seating circle.
 *
 * Player ids are seating positions, so this is the true table layout — which
 * is also what the Bloodhound's adjacency rule reads. It stays on screen for
 * the whole game rather than only during setup: the narrator needs to see who
 * is sitting where, and who has already died, at every step.
 *
 * Laid out entirely from --seats and --i so it reflows on rotation. v1
 * computed inline transforms in JS from offsetWidth at creation time and did
 * not survive a resize.
 */

export interface CircleOptions {
  /** Attach data-seat and make seats tappable. */
  interactive?: boolean
  /** Highlighted, e.g. the players chosen at the current night step. */
  selected?: readonly PlayerId[]
  /** Show each player's role under their name. */
  showRoles?: boolean
  /** Dim to a compact size beside other content. */
  compact?: boolean
}

export const circleMarkup = (
  players: readonly Player[],
  locale: Locale,
  options: CircleOptions = {},
): string => {
  const t = strings(locale)
  const { interactive = false, selected = [], showRoles = false, compact = false } = options

  const seats = players
    .map((p) => {
      const named = p.name.trim() !== ''
      const role = ROLES[p.roleId]
      return `
        <button class="seat" type="button"
                ${interactive ? `data-seat="${p.id}"` : 'disabled aria-hidden="true"'}
                style="--role: var(--role-${p.roleId})"
                data-named="${named}"
                data-team="${role.team}"
                ${p.alive ? '' : 'data-dead'}
                ${selected.includes(p.id) ? 'data-selected' : ''}
                ${p.hasQuestion ? 'data-question' : ''}>
          <span class="seat__name">${named ? esc(p.name) : '—'}</span>
          ${showRoles ? `<span class="seat__role">${esc(t.roles[p.roleId].name)}</span>` : ''}
          ${p.hasQuestion ? '<span class="seat__flag" aria-hidden="true">?</span>' : ''}
        </button>
      `
    })
    .join('')

  return `<div class="circle${compact ? ' circle--compact' : ''}" style="--seats: ${players.length}">${seats}</div>`
}

/** Who currently holds a role — what the narrator actually needs to know. */
export const holdersOf = (players: readonly Player[], roleId: string): Player[] =>
  players.filter((p) => p.alive && p.roleId === roleId)
