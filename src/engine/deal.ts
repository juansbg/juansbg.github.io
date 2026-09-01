import type { RoleId } from './roles'

/**
 * Automatic, balanced role dealing.
 *
 * Narrators normally only type names and let the app hand out roles. Three
 * things matter: the crew must be the right size for the table, the town must
 * keep the roles that make the game playable, and two games with the same
 * settings must not feel identical.
 */

export type Complexity = 'simple' | 'standard' | 'complex'

export const COMPLEXITIES: readonly Complexity[] = ['simple', 'standard', 'complex']

/** A source of randomness in [0, 1). Injected so tests are deterministic. */
export type Random = () => number

/**
 * How many killers for a table of this size.
 *
 * Roughly a quarter of the table, the standard ratio for this family of games.
 * Fewer and the town wins on arithmetic; more and the first night decides it.
 */
export const crewSize = (players: number): number => {
  if (players < 5) return 1
  return Math.max(1, Math.round(players / 4))
}

/**
 * The crew's make-up.
 *
 * Simple tables get plain killers. Richer ones promote one to the Godfather
 * (who converts instead of killing) and, on big complex tables, add the
 * Renegade, who can shoot his own side.
 */
const crewRoles = (size: number, complexity: Complexity): RoleId[] => {
  const crew: RoleId[] = Array.from({ length: size }, () => 'KILLER')
  if (complexity === 'simple') return crew
  if (size >= 2) crew[0] = 'CONVERT'
  if (complexity === 'complex' && size >= 3) crew[1] = 'ROGUE'
  return crew
}

/**
 * Town power roles, in the order they are worth adding.
 *
 * The Detective and Bodyguard come first at every level: without an
 * investigator the town is guessing, and without a shield the investigator
 * dies on night one.
 */
const TOWN_POOL: Record<Complexity, readonly RoleId[]> = {
  simple: ['INSPECT', 'GUARD'],
  standard: ['INSPECT', 'GUARD', 'MEDIC', 'SURVIVE', 'AVENGE'],
  complex: [
    'INSPECT', 'GUARD', 'MEDIC', 'SURVIVE', 'AVENGE',
    'SILENCE', 'EXTRA_VOTE', 'PAIR', 'PROTEGE', 'SENSE',
    'PEEK', 'MARTYR',
  ],
}

/**
 * Roles the dealer must never hand out, because the engine does not fully
 * implement them — dealing one would quietly cost a side a player.
 *
 * SPLIT: the narrator script says only "divides the town in two" and gives no
 * further rules, so there is nothing to implement without inventing it.
 * SWAP: needs the narrator to record which card was taken from the centre, and
 * that picker does not exist yet.
 *
 * Both remain available for manual assignment, where the narrator adjudicates.
 */
export const NOT_AUTO_DEALT: readonly RoleId[] = ['SPLIT', 'SWAP', 'PICK_SIDE']

/** Always dealt when the table is big enough — the game needs them. */
const ESSENTIAL: readonly RoleId[] = ['INSPECT', 'GUARD']

/** How many of the town should hold a power role. */
const poweredShare: Record<Complexity, number> = {
  simple: 0.34,
  standard: 0.55,
  complex: 0.75,
}

/** Fisher-Yates, using the injected source so results are reproducible. */
export const shuffle = <T>(items: readonly T[], random: Random): T[] => {
  const out = [...items]
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1))
    const a = out[i] as T
    const b = out[j] as T
    out[i] = b
    out[j] = a
  }
  return out
}

/**
 * Deals one role per player, shuffled into seating order.
 *
 * Power roles are unique — one Detective, one Bodyguard — while killers repeat.
 * Whatever is left over becomes plain Citizens, so there are always innocents
 * with nothing to reveal.
 */
export const dealRoles = (
  players: number,
  complexity: Complexity,
  random: Random,
): RoleId[] => {
  if (players <= 0) return []

  const crew = crewRoles(crewSize(players), complexity)
  const townSeats = players - crew.length

  const essentials = ESSENTIAL.slice(0, Math.max(0, Math.min(ESSENTIAL.length, townSeats)))
  const optional = TOWN_POOL[complexity].filter((r) => !essentials.includes(r))

  const wanted = Math.round(townSeats * poweredShare[complexity])
  const extraCount = Math.max(0, Math.min(wanted - essentials.length, optional.length, townSeats - essentials.length))
  const extras = shuffle(optional, random).slice(0, extraCount)

  const town: RoleId[] = [...essentials, ...extras]
  while (town.length < townSeats) town.push('PLAIN')

  return shuffle([...crew, ...town], random)
}

/** Cryptographically-seeded randomness for real play. */
export const systemRandom: Random = () => {
  const buf = new Uint32Array(1)
  crypto.getRandomValues(buf)
  return (buf[0] as number) / 2 ** 32
}
