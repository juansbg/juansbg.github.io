import { ROLES, type RoleId } from '../engine/roles'
import type { Outcome } from '../engine/types'
import { outcomeAccent } from '../i18n'

/**
 * Colour says whose side; type says who.
 *
 * The palette is four colours (docs/DESIGN.md), so roles are not coloured
 * individually. Every coloured thing — a seat, a report line, a log row —
 * carries one of these accents as `data-accent`, and tokens.css maps it to
 * the team colour. The role's sigil (`sigils.ts`) carries its identity.
 *
 * This is a presentation concern, so it lives in the UI: the engine knows
 * teams, not accents.
 */
export type Accent = 'crew' | 'town' | 'occult' | 'system'

/**
 * The two roles with the occult streak. They are still town, but their mark
 * is hollow — an outline instead of a fill — so they read as *other* without
 * a fifth colour.
 */
const OCCULT: ReadonlySet<RoleId> = new Set<RoleId>(['MEDIC', 'SPLIT'])

export const accentOf = (roleId: RoleId): Accent =>
  OCCULT.has(roleId) ? 'occult' : ROLES[roleId].team

/** The accent an outcome's line should carry: that of the role that caused it. */
export const outcomeAccentOf = (outcome: Outcome): Accent => {
  const source = outcomeAccent(outcome)
  return source === 'town' ? 'town' : accentOf(source)
}
