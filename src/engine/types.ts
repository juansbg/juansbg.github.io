import type { RoleId } from './roles'

/**
 * Stable identifier assigned at setup and never reused.
 *
 * This exists because v1 identified players by their display name, so two
 * players called "Ana" were the same player as far as the game was concerned:
 * killing one marked both dead and dropped a still-living player's role from
 * the night order. Nothing in the engine may ever key off `name`.
 */
export type PlayerId = number

export interface Player {
  readonly id: PlayerId
  name: string
  roleId: RoleId
  alive: boolean

  /** Set by the Protector for one night, then cleared. */
  protectedTonight: boolean
  /** Who the Protector shielded last night — may not be chosen twice running. */
  protectedLastNight: boolean
  /** The Anciano survives his first wolf attack. Counts down from 1. */
  wolfAttacksSurvivable: number
  /** Paired by Cupido; when one lover dies the other dies with them. */
  loverOf: PlayerId | null
  /** Burned out by the Pirómano: cannot speak or vote on the given day. */
  silencedOnDay: number | null
  /** Extra votes against this player, from the Cuervo, for one day. */
  extraVotesOnDay: number | null
  /** Which half of the village the Abominable Sectario placed them in. */
  sect: 0 | 1 | null
  /** The protégé's chosen mentor; if the mentor dies, they join the crew. */
  fatherOf: PlayerId | null
  /**
   * The player raised a question about their role during the reveal.
   *
   * Nobody can ask out loud without giving something away, so they flag it
   * privately and the narrator checks on them before the first night.
   */
  hasQuestion: boolean
  /**
   * A citizen's trade: an index into the string tables' `trades`, so the
   * engine never holds a word for it. Null for anyone with a role. Dealt at
   * setup, unique within a game, kept if the citizen is converted, and
   * secret until the paper names the dead (docs/GAZETTE.md).
   */
  trade: number | null
}

export type Phase = 'setup' | 'night' | 'day' | 'over'

/** One person's vote in the day's tally. A voter has at most one. */
export interface Vote {
  readonly voter: PlayerId
  readonly target: PlayerId
}

/**
 * The complete game. Must stay JSON-serializable: autosave (Sprint 3) and
 * undo both depend on structured-cloning this and nothing else.
 */
export interface GameState {
  /** Bumped when the shape changes, so saved games can be migrated. */
  readonly version: number
  phase: Phase
  /** 1-based. 0 during setup. */
  night: number
  day: number
  players: Player[]
  /** Roles to prompt for tonight, in narrator-script order. */
  schedule: RoleId[]
  /** Index into `schedule`. Equal to `schedule.length` once the night is done. */
  stepIndex: number
  /** Actions recorded tonight, not yet resolved. */
  pending: NightAction[]
  /**
   * The day's votes so far, one per voter. Optional: the narrator may still
   * just tap whom the town chose. The execution records them as a public
   * `tally` outcome and clears them; so does nightfall.
   */
  votes: Vote[]
  /** Everything that has actually happened, oldest first. */
  log: Outcome[]
  /** The Infecto converts a victim once per game. */
  infectionUsed: boolean
  /**
   * The medic's two vials, one cure and one poison, each good once per game.
   * Neither was tracked before, so the potions were effectively unlimited.
   */
  healUsed: boolean
  poisonUsed: boolean
  /** Set when a dead Cazador still owes a revenge shot the narrator must pick. */
  awaitingHunterShot: PlayerId | null
  /**
   * Seeds anything the engine rolls on its own (the paper's clues), so an
   * undo and a redo roll the same and the log never changes under the
   * narrator. Set once at createGame.
   */
  readonly seed: number
}

/** What the narrator recorded at one night step. */
export type NightAction =
  | { kind: 'target'; roleId: RoleId; actor: PlayerId | null; target: PlayerId }
  | { kind: 'pair'; roleId: RoleId; first: PlayerId; second: PlayerId }
  | { kind: 'potion'; roleId: 'MEDIC'; target: PlayerId; potion: 'heal' | 'kill' }
  | { kind: 'split'; roleId: 'SPLIT'; sectOne: PlayerId[]; sectTwo: PlayerId[] }
  /** A role that acts but picks no target — the Infecto raising its hand. */
  | { kind: 'confirm'; roleId: RoleId }
  /** A role that becomes another: the Actor's card, the Perro Lobo's side. */
  | { kind: 'chooseRole'; roleId: RoleId; newRole: RoleId }
  /** The narrator declined this role's action tonight. */
  | { kind: 'skip'; roleId: RoleId }

/**
 * A resolved fact about the game.
 *
 * Deliberately structured and string-free. v1 stored a rendered Spanish
 * sentence here and rewrote it mid-resolution ("Ha muerto " became "Han
 * intentado matar a ") to signal a blocked kill, which made the log
 * untranslatable and left presentation carrying game state. The UI turns
 * these into sentences at render time, per language.
 */
export type Outcome =
  | { type: 'death'; night: number; target: PlayerId; cause: DeathCause; public: true }
  | { type: 'attackBlocked'; night: number; target: PlayerId; by: 'GUARD' | 'SURVIVE' | 'MEDIC'; public: false }
  | { type: 'inspected'; night: number; target: PlayerId; by: 'INSPECT'; public: false }
  | { type: 'protected'; night: number; target: PlayerId; public: false }
  | { type: 'lovers'; night: number; first: PlayerId; second: PlayerId; public: false }
  | { type: 'father'; night: number; target: PlayerId; public: false }
  | { type: 'converted'; night: number; target: PlayerId; by: 'CONVERT'; public: false }
  | { type: 'silenced'; night: number; day: number; target: PlayerId; public: true }
  | { type: 'extraVote'; night: number; day: number; target: PlayerId; public: true }
  | { type: 'sectSplit'; night: number; public: false }
  | { type: 'growl'; night: number; public: true }
  | { type: 'roleChanged'; night: number; target: PlayerId; to: RoleId; public: false }
  /** The Chameleon took a card from the centre; the table learns which, not who. */
  | { type: 'cardTaken'; night: number; role: RoleId; public: true }
  /**
   * The paper's breadcrumb: something a citizen noticed, told through their
   * trade and never their name. True of the game by construction
   * (resolve.ts, rollClue) and rolled from the seed, so an undo repeats it.
   */
  | { type: 'clue'; night: number; trade: number; clue: Clue; public: true }
  /** Who voted for whom before the town executed someone. Raw votes; the Raven's extra is its own outcome. */
  | { type: 'tally'; night: number; day: number; votes: Vote[]; public: true }

/** What a clue says. Each kind is a fact the resolver can check. */
export type Clue =
  /** Someone from the Family lives next door to this trade's holder — or nobody does. */
  | { kind: 'neighbour'; crew: boolean }
  /** Tonight's victim lived this many doors from the holder, round the circle. */
  | { kind: 'doors'; doors: number }

export type DeathCause =
  | 'killers'
  | 'rogue'
  | 'poison'
  | 'lynch'
  | 'heartbreak'
  | 'revenge'

export const STATE_VERSION = 4
