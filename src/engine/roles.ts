// Canonical role definitions — the single source of truth for who acts, when,
// and on whom.
//
// v1 spread this across four maps (playerColors, playerTitles,
// playerDescriptions) plus two hardcoded order arrays, so adding a role meant
// editing five places and forgetting one was silent. Here a role is one row.
//
// IDs are INTERNAL and never shown to a user; display names live in src/i18n/.
// The acronyms are inherited from v1 because they are the join key across the
// whole project.
//
// Note NIN vs NIA: v1 used NIN for "Niño Salvaje" (wild child) and NIA for
// "Niña Pequeña" (little girl); the abandoned v2 tree used NIN for the little
// girl. v3 follows v1.

export const ROLE_IDS = [
  'ALD', 'VID', 'ANC', 'BRU', 'PIR', 'CUE', 'PRO', 'NIN', 'DOM',
  'CUP', 'CAZ', 'ANG', 'ACT', 'NIA', 'SEC',
  'LOB', 'PER', 'INF', 'ALB',
] as const

export type RoleId = (typeof ROLE_IDS)[number]

export type Team = 'village' | 'wolf'

/** When a role is prompted during the night. */
export type Activity =
  /** Acts once, on night 1 (Niño Salvaje, Cupido, Sectario). */
  | { kind: 'firstNightOnly' }
  /** Acts every night (Protector, Vidente, wolves, Bruja). */
  | { kind: 'everyNight' }
  /** Pirómano: nights 1, 3, 5… */
  | { kind: 'oddNights' }
  /** Lobo albino: nights 2, 4, 6… */
  | { kind: 'evenNights' }
  /** Actor: the first three nights only. */
  | { kind: 'firstNNights'; n: number }
  /** Has no night step at all — resolves passively or on death. */
  | { kind: 'passive' }

/** What the narrator is asked to record at this role's step. */
export type TargetSpec =
  | { kind: 'none' }
  | { kind: 'player'; mayTargetSelf: boolean; mayRepeatConsecutively: boolean }
  | { kind: 'twoPlayers' }
  | { kind: 'potion' }
  | { kind: 'split' }

export interface RoleDef {
  readonly id: RoleId
  readonly team: Team
  /** Position in the narrator script. Lower runs first. Gaps are intentional. */
  readonly order: number
  readonly activity: Activity
  readonly target: TargetSpec
  /** True for roles the narrator wakes as a group rather than individually. */
  readonly wakesAsGroup?: boolean
  /** Not present in the authoritative PDF narrator script; see NOTES below. */
  readonly notInScript?: boolean
}

const player = (
  mayTargetSelf: boolean,
  mayRepeatConsecutively = true,
): TargetSpec => ({ kind: 'player', mayTargetSelf, mayRepeatConsecutively })

const NONE: TargetSpec = { kind: 'none' }

/**
 * Ordered exactly as the narrator script reads.
 *
 * First night (1-9): Niño Salvaje, Cupido, Abominable Sectario, then the two
 * reminder roles (Domador, Anciano) that the script lists but which take no
 * decision.
 *
 * Every night (10-99): Actor, Cuervo, Protector, Vidente, Pirómano, Lobos,
 * Infecto, Lobo albino, Bruja.
 */
export const ROLES: Readonly<Record<RoleId, RoleDef>> = {
  // ---- First night only ----
  NIN: { id: 'NIN', team: 'village', order: 1, activity: { kind: 'firstNightOnly' }, target: player(false) },
  CUP: { id: 'CUP', team: 'village', order: 2, activity: { kind: 'firstNightOnly' }, target: { kind: 'twoPlayers' } },
  SEC: { id: 'SEC', team: 'village', order: 3, activity: { kind: 'firstNightOnly' }, target: { kind: 'split' } },
  // The Wolf Dog picks a side on the first night. Not in the PDF script, but
  // it is a selectable role in v1 and this is its standard rule.
  PER: { id: 'PER', team: 'wolf', order: 4, activity: { kind: 'firstNightOnly' }, target: NONE, notInScript: true },

  // ---- Every night, in script order ----
  ACT: { id: 'ACT', team: 'village', order: 10, activity: { kind: 'firstNNights', n: 3 }, target: NONE },
  CUE: { id: 'CUE', team: 'village', order: 20, activity: { kind: 'everyNight' }, target: player(false) },
  // "Puede elegirse a sí mismo pero nunca la misma dos noches seguidas."
  PRO: { id: 'PRO', team: 'village', order: 30, activity: { kind: 'everyNight' }, target: player(true, false) },
  VID: { id: 'VID', team: 'village', order: 40, activity: { kind: 'everyNight' }, target: player(false) },
  PIR: { id: 'PIR', team: 'village', order: 50, activity: { kind: 'oddNights' }, target: player(false) },
  LOB: { id: 'LOB', team: 'wolf', order: 60, activity: { kind: 'everyNight' }, target: player(false), wakesAsGroup: true },
  // The Infecto raises its hand after the wolves sleep; its victim becomes a
  // wolf instead of dying. Once per game — enforced in resolve.ts.
  INF: { id: 'INF', team: 'wolf', order: 65, activity: { kind: 'everyNight' }, target: NONE },
  ALB: { id: 'ALB', team: 'wolf', order: 70, activity: { kind: 'evenNights' }, target: player(false) },
  BRU: { id: 'BRU', team: 'village', order: 80, activity: { kind: 'everyNight' }, target: { kind: 'potion' } },

  // ---- No night step ----
  ALD: { id: 'ALD', team: 'village', order: 900, activity: { kind: 'passive' }, target: NONE },
  // Survives his first wolf attack. Resolved in resolve.ts, not prompted.
  ANC: { id: 'ANC', team: 'village', order: 901, activity: { kind: 'passive' }, target: NONE },
  // Growls each morning when a wolf sits beside him. A morning announcement.
  DOM: { id: 'DOM', team: 'village', order: 902, activity: { kind: 'passive' }, target: NONE },
  // Takes someone with him when he dies. Triggered on death, not at night.
  CAZ: { id: 'CAZ', team: 'village', order: 903, activity: { kind: 'passive' }, target: NONE, notInScript: true },
  // Peeks during the wolves' turn — no separate step of her own.
  NIA: { id: 'NIA', team: 'village', order: 904, activity: { kind: 'passive' }, target: NONE, notInScript: true },
  ANG: { id: 'ANG', team: 'village', order: 905, activity: { kind: 'passive' }, target: NONE, notInScript: true },
}

export const isRoleId = (value: string): value is RoleId =>
  (ROLE_IDS as readonly string[]).includes(value)

export const roleDef = (id: RoleId): RoleDef => ROLES[id]

/** Roles that count as wolves for kill targeting and win conditions. */
export const isWolfRole = (id: RoleId): boolean => ROLES[id].team === 'wolf'

/** Every role that takes a night step, in script order. */
export const NIGHT_ROLES: readonly RoleDef[] = Object.values(ROLES)
  .filter((r) => r.activity.kind !== 'passive')
  .sort((a, b) => a.order - b.order)
