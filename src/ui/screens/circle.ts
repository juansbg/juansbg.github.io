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
 * Apothecary is told, `self` the viewer's own chair, `marked` whatever their
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
  /** Who is set to die tonight, for the Apothecary's step. */
  doomed?: readonly PlayerId[]
  /** Votes against each seat today, as a badge. Public: the town cast them. */
  votes?: ReadonlyMap<PlayerId, number>
  /** The seat the vote points at, marked as the execution's preselection. */
  leader?: PlayerId | null
  /** The viewer's own chair, on a phone that is not looking through a role's perspective. */
  self?: readonly PlayerId[]
  /** Who has cast a ballot today: a mark in the badge's corner until the count comes up. */
  cast?: readonly PlayerId[]
  /** The seat the last ballot of the count fell on: its badge lands. */
  fresh?: PlayerId | null
  /** Markup for the middle of the ring (the ballot's figure, the verdict); not drawn in rows. */
  centre?: string
  /**
   * Render for a player's eyes rather than the narrator's: no roles, no
   * sigils, no team colour, no question flags, no accent on any seat. Only
   * what the perspective lists is marked. The seats stay tappable — the
   * narrator records the pick while the player looks on — but nothing a
   * seat says may come from outside the perspective.
   */
  perspective?: Perspective
  /**
   * Rows instead of a ring: the narrator's list layout. The same seats, the
   * same marks, stacked full width and scrolling, so nothing the circle
   * shows is lost when there is no room for a circle.
   */
  list?: boolean
  /**
   * The role labels have to be readable, or the ring gives way to rows.
   *
   * For the Roles toggle, which exists for a narrator who has lost track of
   * who is who: a tile that cannot carry its longest label makes that a
   * control that shows no roles. `fitTables` reads this.
   */
  fitRoles?: boolean
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
    perspective, votes, leader = null, list = false, cast = [], fresh = null, self: own = [], centre = '',
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
        pickAttr !== undefined && (eligible === undefined ? p.alive : eligible.includes(p.id))
      const crew = hidden
        ? perspective.crew.includes(p.id)
        : revealTeams && role.team === 'crew' && p.alive
      const self = hidden ? perspective.self.includes(p.id) : own.includes(p.id)
      const doom = doomed.includes(p.id) && p.alive
      const count = p.alive ? votes?.get(p.id) ?? 0 : 0
      const voted = p.alive && cast.includes(p.id)

      return `
        <button class="seat" type="button"
                ${canPick ? `data-${pickAttr}="${p.id}"` : 'disabled'}
                ${canPick ? '' : 'aria-hidden="true"'}
                data-accent="${hidden ? 'system' : accentOf(p.roleId)}"
                data-named="${named}"
                ${hidden ? '' : `data-team="${role.team}"`}
                ${p.alive ? '' : 'data-dead'}
                ${pickAttr !== undefined && !canPick && p.alive ? 'data-ineligible' : ''}
                ${canPick ? 'data-pickable' : ''}
                ${selected.includes(p.id) ? 'data-selected' : ''}
                ${!hidden && p.hasQuestion ? 'data-question-flag' : ''}
                ${crew ? 'data-crew' : ''}
                ${self ? 'data-self' : ''}
                ${doom ? 'data-doomed' : ''}
                ${!hidden && p.alive && leader === p.id ? 'data-leader' : ''}
                ${voted ? 'data-voted' : ''}
                ${fresh === p.id ? 'data-fresh' : ''}>
          <span class="seat__n" aria-hidden="true">${String(p.id + 1).padStart(2, '0')}</span>
          ${showRoles && !hidden ? `<span class="seat__sigil">${sigilMarkup(p.roleId)}</span>` : ''}
          <span class="seat__name" style="--len: ${named ? p.name.trim().length : 1}">${named ? esc(p.name) : '—'}</span>
          ${showRoles && !hidden ? `<span class="seat__role" style="--len: ${tileRole(p.roleId).length}">${esc(tileRole(p.roleId))}</span>` : ''}
          ${self ? `<span class="seat__you">${esc(t.ui.view.you)}</span>` : ''}
          ${!hidden && p.hasQuestion ? '<span class="seat__flag" aria-hidden="true">?</span>' : ''}
          ${doom ? '<span class="seat__doom" aria-hidden="true">✕</span>' : ''}
          ${!hidden && count > 0 ? `<span class="seat__votes">${count}</span>` : voted ? '<span class="seat__cast" aria-hidden="true">✓</span>' : ''}
        </button>
      `
    })
    .join('')

  // The wrapper is a size container: the circle measures the room it has been
  // given (width *and* height) and shrinks to fit, so the whole table stays on
  // one phone screen instead of pushing the buttons below it off the bottom.
  const tableClass = `table${compact ? ' table--compact' : ''}${list ? ' table--list' : ''}`
  const circleClass = `circle${compact ? ' circle--compact' : ''}${list ? ' circle--list' : ''}`
  const middle = centre === '' ? '' : `<div class="circle__centre">${centre}</div>`
  const fit = options.fitRoles === true ? ' data-fit-roles' : ''
  // `--offset` rides with `--seats`: 0 puts seat 1 at the top of an odd
  // table, 0.5 makes an even one straddle it so both halves of the room
  // mirror. It was CSS (`mod()`) until it turned out to take the whole ring
  // down on an engine that does not have it; see the note in styles.css.
  const offset = players.length % 2 === 0 ? '0.5' : '0'
  return `<div class="${tableClass}"><div class="${circleClass}"${fit} style="--seats: ${players.length}; --offset: ${offset}">${seats}${middle}</div></div>`
}

/** The smallest tile a name still reads in, in px (3.5rem). Under it, rows. */
export const SEAT_FLOOR = 56

/**
 * The role label's own floor and advance, mirrored from `.seat__role`.
 *
 * The label is set in Plex Mono at 0.66em a character with 0.04em of tracking
 * on top, and it will not go below 0.625rem, because under that nobody reads
 * it across a dark room. Those three numbers decide whether a label can be
 * shown whole.
 */
const LABEL_FLOOR = 10
const LABEL_ADVANCE = 0.7

/** The label's own length, as the markup wrote it. */
const lengthOf = (label: HTMLElement): number =>
  Number(label.style.getPropertyValue('--len')) || (label.textContent ?? '').trim().length

/**
 * The smallest tile this table can be drawn in before it goes to rows.
 *
 * A plain table only has to hold a name. A table drawn for the Roles toggle
 * has to hold the longest role label it carries as well, at a size somebody
 * can read across a dark room — and a Roles toggle that shows no roles is a
 * dead control. Nine players on a short phone is the commonest table there
 * is, and the ring there cannot carry a word, so it gives way to the rows
 * list, which is the narrator's own list view and shows every label whole.
 */
const floorFor = (circle: HTMLElement): number => {
  if (!circle.hasAttribute('data-fit-roles')) return SEAT_FLOOR
  let longest = 0
  for (const label of circle.querySelectorAll<HTMLElement>('.seat__role')) {
    longest = Math.max(longest, lengthOf(label))
  }
  if (longest === 0) return SEAT_FLOOR
  // The tile, less its border and padding, has to hold the word.
  return Math.max(SEAT_FLOOR, longest * LABEL_ADVANCE * LABEL_FLOOR + 6)
}

/**
 * Lets a circle that cannot give every seat a readable tile fall back to
 * rows, after a paint and on resize.
 *
 * The tile size is solved in CSS from the room the table is given (the
 * `--avail` / `--seat` algebra on `.circle` in styles.css); this mirrors it
 * so the decision can be made before the ring is drawn small. A short
 * phone with a two-line report, an Apothecary's step with its vial row, or
 * twelve seats at 375px all land under the floor, and the rows are the
 * answer the design gives for that, now taken without a trip to the menu.
 */
export const fitTables = (root: ParentNode): void => {
  const rem = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16
  for (const circle of root.querySelectorAll<HTMLElement>('.circle:not(.circle--list)')) {
    const table = circle.parentElement
    if (!table) continue
    const seats = circle.querySelectorAll('.seat').length || 1
    // Always measured as a ring. The stylesheet gives a table in rows a
    // different height from the same table as a ring, so measuring it in
    // whichever state it happens to be in makes the answer depend on the
    // last answer — a table that fell back once could measure too short to
    // ever come back, and the ring would not return when the Roles toggle
    // went off. Taking the attribute off first costs one synchronous layout
    // and makes the question the same every time it is asked.
    // Measuring means taking the attribute off and putting it back, and a seat
    // transitions its transform: on a screen that repaints often — a phone
    // taking projections — every paint restarted that transition from wherever
    // the last one had got to, so the tiles sat permanently part way between
    // the ring and the rows, overlapping each other and running off the edge.
    // The transition is held for the length of the measurement only.
    const tiles = [...circle.querySelectorAll<HTMLElement>('.seat')]
    for (const tile of tiles) tile.style.transition = 'none'
    circle.removeAttribute('data-rows')
    const box = table.getBoundingClientRect()
    const cap = circle.classList.contains('circle--compact') ? 17 : 24.5
    const avail = Math.max(Math.min(box.width, box.height, cap * rem), 9 * rem)
    const gap = Math.sin(Math.PI / seats)
    const seat = Math.min(avail * 0.31, (avail * gap) / (Math.SQRT2 + gap))
    const rows = seat < floorFor(circle)
    circle.toggleAttribute('data-rows', rows)
    // Land in the answer, then give the tiles their transition back for the
    // next real change (a seat picked, the Roles toggle).
    void circle.offsetWidth
    for (const tile of tiles) tile.style.transition = ''
    // A role label with no size left that anybody could read goes, and the
    // sigil carries the role on its own — the same answer the stylesheet
    // already gives under a 3.25rem tile, taken one tile earlier for the
    // longest names. A clipped word reads as a paint fault; a sigil with no
    // word under it reads as the design. In rows the label has the width of
    // the phone and always fits.
    for (const label of circle.querySelectorAll<HTMLElement>('.seat__role')) {
      const fits = rows || lengthOf(label) * LABEL_ADVANCE * LABEL_FLOOR <= seat - 6
      label.toggleAttribute('data-over', !fits)
    }
  }
}

/** Who currently holds a role — what the narrator actually needs to know. */
export const holdersOf = (players: readonly Player[], roleId: string): Player[] =>
  players.filter((p) => p.alive && p.roleId === roleId)
