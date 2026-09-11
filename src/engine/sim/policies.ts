import { spareCards } from '../cards'
import type { Random } from '../deal'
import { doomedTonight } from '../resolve'
import { ROLES, type RoleId } from '../roles'
import { legalTargets } from '../targets'
import type { GameState, NightAction, PlayerId } from '../types'
import { pick } from './rng'

/**
 * How the bots play.
 *
 * These are deliberately crude. The simulator exists to find structural
 * problems — deals that end before a vote, games that never end, states the
 * engine cannot leave — and for those the quality of play hardly matters. The
 * win rates it prints are indicative, not a measurement of the real game.
 */

/** Decides what a role records at its night step. */
export type NightPolicy = (state: GameState, roleId: RoleId, random: Random) => NightAction

/** Decides whom the town hangs. Called only while someone is alive. */
export type VotePolicy = (state: GameState, random: Random) => PlayerId

/** Decides whom the Gunman takes with him. Called only while someone is alive. */
export type ShotPolicy = (state: GameState, random: Random) => PlayerId

export interface Policies {
  night: NightPolicy
  vote: VotePolicy
  shot: ShotPolicy
}

/** Everyone picks a legal target at random; the once-per-game moves are coin flips. */
export const randomNight: NightPolicy = (state, roleId, random) => {
  switch (roleId) {
    case 'PAIR': {
      const living = state.players.filter((p) => p.alive)
      if (living.length < 2) return { kind: 'skip', roleId }
      const first = pick(living, random)
      const second = pick(living.filter((p) => p.id !== first.id), random)
      return { kind: 'pair', roleId, first: first.id, second: second.id }
    }
    case 'SWAP': {
      const cards = spareCards(state.players)
      if (cards.length === 0 || random() < 0.4) return { kind: 'skip', roleId }
      return { kind: 'chooseRole', roleId, newRole: pick(cards, random) }
    }
    case 'CONVERT':
      return random() < 0.5 ? { kind: 'confirm', roleId } : { kind: 'skip', roleId }
    case 'MEDIC': {
      const doomed = doomedTonight(state)
      if (doomed.length > 0 && !state.healUsed && random() < 0.7) {
        return { kind: 'potion', roleId, target: doomed[0] as PlayerId, potion: 'heal' }
      }
      const others = state.players.filter((p) => p.alive && p.roleId !== 'MEDIC')
      if (!state.poisonUsed && others.length > 0 && random() < 0.25) {
        return { kind: 'potion', roleId, target: pick(others, random).id, potion: 'kill' }
      }
      return { kind: 'skip', roleId }
    }
    // Neither is dealt automatically; when assigned by hand, the bot sits them out.
    case 'SPLIT':
    case 'PICK_SIDE':
      return { kind: 'skip', roleId }
    default: {
      const targets = legalTargets(state, roleId)
      if (targets.length === 0) return { kind: 'skip', roleId }
      const actor =
        roleId === 'KILLER'
          ? null
          : (state.players.find((p) => p.alive && p.roleId === roleId)?.id ?? null)
      return { kind: 'target', roleId, actor, target: pick(targets, random).id }
    }
  }
}

/** The town hangs anyone at all. The floor of how badly a table can play. */
export const randomVote: VotePolicy = (state, random) =>
  pick(state.players.filter((p) => p.alive), random).id

/**
 * The town follows the Detective: while he lives, hang a crew member he has
 * found, otherwise someone he has not cleared. Once he is dead, vote at random.
 *
 * The Detective's findings are read off the log. A player who was converted
 * after being inspected counts by what they are now, which flatters the town a
 * little; the bot is not trying to be fair, only to be a plausible ceiling.
 */
export const detectiveVote: VotePolicy = (state, random) => {
  const living = state.players.filter((p) => p.alive)
  const detective = living.some((p) => p.roleId === 'INSPECT')
  if (!detective) return pick(living, random).id

  const seen = new Set<PlayerId>()
  for (const o of state.log) if (o.type === 'inspected') seen.add(o.target)

  const found = living.find((p) => seen.has(p.id) && ROLES[p.roleId].team === 'crew')
  if (found) return found.id

  const unknown = living.filter((p) => !seen.has(p.id) && p.roleId !== 'INSPECT')
  return pick(unknown.length > 0 ? unknown : living, random).id
}

/** Who was alive once night `night` had been resolved: everyone not yet dead by then. */
const aliveAfter = (state: GameState, night: number): PlayerId[] => {
  const dead = new Set<PlayerId>()
  for (const o of state.log) if (o.type === 'death' && o.night <= night) dead.add(o.target)
  return state.players.filter((p) => !dead.has(p.id)).map((p) => p.id)
}

/** The two seats either side of `id` in a ring of the given seats, the way `crewNextDoor` reads it. */
const neighboursIn = (ring: readonly PlayerId[], id: PlayerId): PlayerId[] => {
  const index = ring.indexOf(id)
  if (index === -1 || ring.length < 3) return []
  return [ring[(index - 1 + ring.length) % ring.length]!, ring[(index + 1) % ring.length]!]
}

/**
 * The town follows the Detective and reads the paper.
 *
 * The model of the table: every citizen has said what their trade is and the
 * town believes them (so a living trade-holder is never hanged, which a
 * converted citizen exploits), and the paper's `neighbour` breadcrumbs are
 * read against the seating as it was on the night they were printed: "the
 * Family lives next door to the baker" puts a point on both of the baker's
 * neighbours that night; "nobody from the Family lives next door to the
 * baker" clears them. The `doors` breadcrumb only fixes where the trade sits
 * and so says nothing about who to hang; the town ignores it.
 *
 * Hang: a crew member the Detective has found, else the most suspected seat
 * that nobody has cleared, else anyone not cleared, else anyone. Compared with
 * `detectiveVote` this measures what the breadcrumbs are worth to a town that
 * trusts every claim; the difference is the paper's weight on the game.
 */
export const clueVote: VotePolicy = (state, random) => {
  const living = state.players.filter((p) => p.alive)
  const detectiveAlive = living.some((p) => p.roleId === 'INSPECT')
  const seen = new Set<PlayerId>()
  for (const o of state.log) if (o.type === 'inspected') seen.add(o.target)
  if (detectiveAlive) {
    const found = living.find((p) => seen.has(p.id) && ROLES[p.roleId].team === 'crew')
    if (found) return found.id
  }

  const cleared = new Set<PlayerId>()
  const suspicion = new Map<PlayerId, number>()
  for (const p of living) {
    if (p.trade !== null) cleared.add(p.id)
    if (detectiveAlive && seen.has(p.id)) cleared.add(p.id)
  }
  for (const o of state.log) {
    if (o.type !== 'clue' || o.clue.kind !== 'neighbour') continue
    const holder = state.players.find((p) => p.trade === o.trade)
    if (holder === undefined) continue
    for (const n of neighboursIn(aliveAfter(state, o.night), holder.id)) {
      if (o.clue.crew) suspicion.set(n, (suspicion.get(n) ?? 0) + 1)
      else cleared.add(n)
    }
  }

  const open = living.filter((p) => !cleared.has(p.id))
  if (open.length === 0) return pick(living, random).id
  const top = Math.max(...open.map((p) => suspicion.get(p.id) ?? 0))
  if (top === 0) return pick(open, random).id
  return pick(open.filter((p) => (suspicion.get(p.id) ?? 0) === top), random).id
}

/** The Gunman shoots whoever. */
export const randomShot: ShotPolicy = (state, random) =>
  pick(state.players.filter((p) => p.alive), random).id

/**
 * The tables the report prints: the worst town, a plausible one, and the same
 * plausible town reading the paper, so the breadcrumbs' weight is the gap
 * between the last two.
 */
export const POLICIES: Readonly<Record<'random' | 'detective' | 'clues', Policies>> = {
  random: { night: randomNight, vote: randomVote, shot: randomShot },
  detective: { night: randomNight, vote: detectiveVote, shot: randomShot },
  clues: { night: randomNight, vote: clueVote, shot: randomShot },
}

export type PolicyName = keyof typeof POLICIES
