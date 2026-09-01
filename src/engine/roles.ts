// Canonical role definitions — the single source of truth for who acts, when,
// and on whom.
//
// IDs describe what a role DOES, not what it is called. The game is themed
// around organised crime (see src/i18n/), but the engine must not know that:
// a re-skin should cost nothing but a string table. The previous IDs were
// Spanish werewolf acronyms (LOB, VID, BRU), which tied the engine to a
// fiction it has now outgrown.
//
// Display names live in src/i18n/ and never appear here.

export const ROLE_IDS = [
  // Town
  'PLAIN',       // no ability
  'INSPECT',     // learns one player's role each night
  'SURVIVE',     // survives the first attempt on their life
  'MEDIC',       // one heal and one poison, once each per game
  'SILENCE',     // silences a player for the coming day
  'EXTRA_VOTE',  // adds a vote against a player for the coming day
  'GUARD',       // shields one player per night
  'PROTEGE',     // bonds to a mentor; joins the crew if the mentor dies
  'SENSE',       // senses a killer seated beside them
  'PAIR',        // binds two players' fates together
  'AVENGE',      // takes someone down when killed
  'MARTYR',      // wins if executed by the town
  'SWAP',        // takes on another role
  'PEEK',        // peeks during the killers' turn
  'SPLIT',       // divides the town into two factions
  // Crew
  'KILLER',      // the killers, woken as a group
  'PICK_SIDE',   // chooses a side on the first night
  'CONVERT',     // converts one victim instead of killing them, once per game
  'ROGUE',       // kills anyone, including their own side
] as const

export type RoleId = (typeof ROLE_IDS)[number]

export type Team = 'town' | 'crew'

/** When a role is prompted during the night. */
export type Activity =
  /** Acts once, on night 1. */
  | { kind: 'firstNightOnly' }
  | { kind: 'everyNight' }
  /** Nights 1, 3, 5… */
  | { kind: 'oddNights' }
  /** Nights 2, 4, 6… */
  | { kind: 'evenNights' }
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
  /** Woken as a group rather than individually. */
  readonly wakesAsGroup?: boolean
  /** Absent from the authoritative narrator script; its rule is convention. */
  readonly notInScript?: boolean
}

const player = (
  mayTargetSelf: boolean,
  mayRepeatConsecutively = true,
): TargetSpec => ({ kind: 'player', mayTargetSelf, mayRepeatConsecutively })

const NONE: TargetSpec = { kind: 'none' }

/**
 * Ordered exactly as the narrator script reads: the first-night-only roles,
 * then the nightly cycle ending with the medic, who must be told who is about
 * to die before spending a potion.
 */
export const ROLES: Readonly<Record<RoleId, RoleDef>> = {
  // ---- First night only ----
  PROTEGE: { id: 'PROTEGE', team: 'town', order: 1, activity: { kind: 'firstNightOnly' }, target: player(false) },
  PAIR: { id: 'PAIR', team: 'town', order: 2, activity: { kind: 'firstNightOnly' }, target: { kind: 'twoPlayers' } },
  SPLIT: { id: 'SPLIT', team: 'town', order: 3, activity: { kind: 'firstNightOnly' }, target: { kind: 'split' } },
  // Not in the script; picking a side on night one is this role's convention.
  PICK_SIDE: { id: 'PICK_SIDE', team: 'crew', order: 4, activity: { kind: 'firstNightOnly' }, target: NONE, notInScript: true },

  // ---- Every night, in script order ----
  SWAP: { id: 'SWAP', team: 'town', order: 10, activity: { kind: 'firstNNights', n: 3 }, target: NONE },
  EXTRA_VOTE: { id: 'EXTRA_VOTE', team: 'town', order: 20, activity: { kind: 'everyNight' }, target: player(false) },
  // May shield themselves, but never the same player two nights running.
  GUARD: { id: 'GUARD', team: 'town', order: 30, activity: { kind: 'everyNight' }, target: player(true, false) },
  INSPECT: { id: 'INSPECT', team: 'town', order: 40, activity: { kind: 'everyNight' }, target: player(false) },
  SILENCE: { id: 'SILENCE', team: 'town', order: 50, activity: { kind: 'oddNights' }, target: player(false) },
  KILLER: { id: 'KILLER', team: 'crew', order: 60, activity: { kind: 'everyNight' }, target: player(false), wakesAsGroup: true },
  // Signals after the killers sleep; the victim is converted rather than
  // killed, and must be told. Once per game — enforced in resolve.ts.
  CONVERT: { id: 'CONVERT', team: 'crew', order: 65, activity: { kind: 'everyNight' }, target: NONE },
  ROGUE: { id: 'ROGUE', team: 'crew', order: 70, activity: { kind: 'evenNights' }, target: player(false) },
  MEDIC: { id: 'MEDIC', team: 'town', order: 80, activity: { kind: 'everyNight' }, target: { kind: 'potion' } },

  // ---- No night step ----
  PLAIN: { id: 'PLAIN', team: 'town', order: 900, activity: { kind: 'passive' }, target: NONE },
  SURVIVE: { id: 'SURVIVE', team: 'town', order: 901, activity: { kind: 'passive' }, target: NONE },
  SENSE: { id: 'SENSE', team: 'town', order: 902, activity: { kind: 'passive' }, target: NONE },
  AVENGE: { id: 'AVENGE', team: 'town', order: 903, activity: { kind: 'passive' }, target: NONE, notInScript: true },
  PEEK: { id: 'PEEK', team: 'town', order: 904, activity: { kind: 'passive' }, target: NONE, notInScript: true },
  MARTYR: { id: 'MARTYR', team: 'town', order: 905, activity: { kind: 'passive' }, target: NONE, notInScript: true },
}

export const isRoleId = (value: string): value is RoleId =>
  (ROLE_IDS as readonly string[]).includes(value)

export const roleDef = (id: RoleId): RoleDef => ROLES[id]

/** Roles on the killers' side, for targeting rules and win conditions. */
export const isCrewRole = (id: RoleId): boolean => ROLES[id].team === 'crew'

/** Every role that takes a night step, in script order. */
export const NIGHT_ROLES: readonly RoleDef[] = Object.values(ROLES)
  .filter((r) => r.activity.kind !== 'passive')
  .sort((a, b) => a.order - b.order)
