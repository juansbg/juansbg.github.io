import { isWolfRole } from './roles'
import type { DeathCause, GameState, NightAction, Outcome, Player, PlayerId } from './types'

/**
 * Resolves one night's recorded actions into deaths and outcomes.
 *
 * This is the corrected descendant of v1's `prepararInforme()`. Two structural
 * differences: it is pure (it returns new players rather than mutating the DOM
 * and the state together), and it emits structured outcomes rather than
 * Spanish sentence fragments, so the morning report can be rendered in any
 * language.
 */

export interface Resolution {
  players: Player[]
  outcomes: Outcome[]
  infectionUsed: boolean
  awaitingHunterShot: PlayerId | null
}

const clone = (players: readonly Player[]): Player[] => players.map((p) => ({ ...p }))

const find = (players: Player[], id: PlayerId): Player | undefined =>
  players.find((p) => p.id === id)

/** Actions of a given role recorded this night. */
const actionOf = <K extends NightAction['kind']>(
  pending: readonly NightAction[],
  roleId: string,
  kind: K,
): Extract<NightAction, { kind: K }> | undefined =>
  pending.find(
    (a): a is Extract<NightAction, { kind: K }> => a.kind === kind && a.roleId === roleId,
  )

export const resolveNight = (state: GameState): Resolution => {
  const players = clone(state.players)
  const outcomes: Outcome[] = []
  const night = state.night
  const day = state.day + 1

  /** Deaths accumulated this night. A player dies at most once. */
  const deaths = new Map<PlayerId, DeathCause>()
  let infectionUsed = state.infectionUsed

  const kill = (id: PlayerId, cause: DeathCause): void => {
    if (!deaths.has(id)) deaths.set(id, cause)
  }

  // ---- Setup-style actions (first night) -------------------------------

  const pairing = actionOf(state.pending, 'CUP', 'pair')
  if (pairing) {
    const a = find(players, pairing.first)
    const b = find(players, pairing.second)
    if (a && b) {
      a.loverOf = b.id
      b.loverOf = a.id
      outcomes.push({ type: 'lovers', night, first: a.id, second: b.id, public: false })
    }
  }

  const father = actionOf(state.pending, 'NIN', 'target')
  if (father) {
    const child = players.find((p) => p.roleId === 'NIN')
    if (child) child.fatherOf = father.target
    outcomes.push({ type: 'father', night, target: father.target, public: false })
  }

  const split = actionOf(state.pending, 'SEC', 'split')
  if (split) {
    for (const p of players) {
      if (split.sectOne.includes(p.id)) p.sect = 0
      else if (split.sectTwo.includes(p.id)) p.sect = 1
    }
    outcomes.push({ type: 'sectSplit', night, public: false })
  }

  // ---- Protection ------------------------------------------------------
  // Recorded before the attacks so the wolves' target can be shielded.

  for (const p of players) p.protectedTonight = false

  const guard = actionOf(state.pending, 'PRO', 'target')
  if (guard) {
    const target = find(players, guard.target)
    if (target) {
      target.protectedTonight = true
      outcomes.push({ type: 'protected', night, target: target.id, public: false })
    }
  }

  // ---- Attacks ---------------------------------------------------------

  /**
   * Resolve one attack against a player, in the order the script implies:
   * the Anciano's one free survival first, then the Protector's shield.
   * A blocked attack is recorded but kept secret — the village must not learn
   * that the wolves chose someone and failed.
   */
  const attack = (targetId: PlayerId, cause: DeathCause): void => {
    const target = find(players, targetId)
    if (!target || !target.alive) return

    if (target.wolfAttacksSurvivable > 0) {
      target.wolfAttacksSurvivable -= 1
      outcomes.push({ type: 'attackBlocked', night, target: target.id, by: 'ANC', public: false })
      return
    }
    if (target.protectedTonight) {
      outcomes.push({ type: 'attackBlocked', night, target: target.id, by: 'PRO', public: false })
      return
    }
    kill(target.id, cause)
  }

  // Roles that turn into another role: the Actor takes a leftover card from
  // the centre on one of the first three nights, and the Perro Lobo picks a
  // side on the first night. The narrator knows which card was taken, so it is
  // recorded directly rather than modelling the undealt deck.
  for (const swap of state.pending) {
    if (swap.kind !== 'chooseRole') continue
    const subject = players.find((p) => p.roleId === swap.roleId)
    if (!subject) continue
    subject.roleId = swap.newRole
    outcomes.push({ type: 'roleChanged', night, target: subject.id, to: swap.newRole, public: false })
  }

  const wolves = actionOf(state.pending, 'LOB', 'target')
  if (wolves) {
    const infecting = actionOf(state.pending, 'INF', 'confirm') !== undefined
    const victim = find(players, wolves.target)

    if (infecting && !infectionUsed && victim?.alive) {
      // The Infecto converts instead of killing — the victim becomes a wolf
      // and must be told. This also changes tomorrow's night schedule.
      victim.roleId = 'LOB'
      infectionUsed = true
      outcomes.push({ type: 'converted', night, target: victim.id, by: 'INF', public: false })
      outcomes.push({ type: 'roleChanged', night, target: victim.id, to: 'LOB', public: false })
    } else {
      attack(wolves.target, 'wolves')
    }
  }

  const albino = actionOf(state.pending, 'ALB', 'target')
  if (albino) attack(albino.target, 'albino')

  // ---- The Bruja's potions --------------------------------------------
  // v1 populated this dropdown and then threw the answer away: there was no
  // BRU case in configureLastStep(), so the witch never affected anything.

  const potion = actionOf(state.pending, 'BRU', 'potion')
  if (potion) {
    if (potion.potion === 'heal') {
      if (deaths.delete(potion.target)) {
        outcomes.push({ type: 'attackBlocked', night, target: potion.target, by: 'BRU', public: false })
      }
    } else {
      const target = find(players, potion.target)
      // The witch's poison bypasses the Protector.
      if (target?.alive) kill(target.id, 'witch')
    }
  }

  // ---- Day-scoped effects ---------------------------------------------

  const arson = actionOf(state.pending, 'PIR', 'target')
  if (arson) {
    const target = find(players, arson.target)
    if (target) {
      target.silencedOnDay = day
      outcomes.push({ type: 'silenced', night, day, target: target.id, public: true })
    }
  }

  const raven = actionOf(state.pending, 'CUE', 'target')
  if (raven) {
    const target = find(players, raven.target)
    if (target) {
      target.extraVotesOnDay = day
      outcomes.push({ type: 'extraVote', night, day, target: target.id, public: true })
    }
  }

  const seer = actionOf(state.pending, 'VID', 'target')
  if (seer) {
    outcomes.push({ type: 'inspected', night, target: seer.target, by: 'VID', public: false })
  }

  // ---- Apply deaths, then cascade -------------------------------------

  const applied = applyDeaths(players, deaths, night, outcomes)

  // ---- The Domador's growl --------------------------------------------
  // "Cada mañana se avisa al pueblo del gruñido del oso feriante si hay un
  // lobo al lado del domador." Checked after the deaths, since the morning
  // announcement describes who is sitting beside him once the night is over.
  if (growls(players)) outcomes.push({ type: 'growl', night, public: true })

  return {
    players,
    outcomes,
    infectionUsed,
    awaitingHunterShot: applied.awaitingHunterShot,
  }
}

/**
 * Does the bear growl this morning?
 *
 * Player ids are seating positions around the circle, so the Domador's
 * neighbours are the nearest living players on either side, wrapping around.
 * Dead players are skipped rather than counted — the survivors close up the
 * circle.
 */
export const growls = (players: readonly Player[]): boolean => {
  const living = players.filter((p) => p.alive)
  const tamerIndex = living.findIndex((p) => p.roleId === 'DOM')
  if (tamerIndex === -1 || living.length < 2) return false

  const left = living[(tamerIndex - 1 + living.length) % living.length]!
  const right = living[(tamerIndex + 1) % living.length]!

  return isWolfRole(left.roleId) || isWolfRole(right.roleId)
}

/**
 * Marks players dead and follows the consequences: lovers die of heartbreak,
 * and a dying Cazador still owes a shot. Loops because heartbreak can kill a
 * lover who is themselves a Cazador.
 */
export const applyDeaths = (
  players: Player[],
  deaths: Map<PlayerId, DeathCause>,
  night: number,
  outcomes: Outcome[],
): { awaitingHunterShot: PlayerId | null } => {
  let awaitingHunterShot: PlayerId | null = null
  const settled = new Set<PlayerId>()

  let queue = [...deaths.keys()]
  while (queue.length > 0) {
    const next: PlayerId[] = []

    for (const id of queue) {
      if (settled.has(id)) continue
      const player = find(players, id)
      if (!player || !player.alive) continue

      settled.add(id)
      player.alive = false
      outcomes.push({
        type: 'death',
        night,
        target: id,
        cause: deaths.get(id) ?? 'wolves',
        public: true,
      })

      if (player.roleId === 'CAZ' && awaitingHunterShot === null) {
        awaitingHunterShot = player.id
      }

      if (player.loverOf !== null) {
        const lover = find(players, player.loverOf)
        if (lover?.alive && !settled.has(lover.id)) {
          deaths.set(lover.id, 'heartbreak')
          next.push(lover.id)
        }
      }
    }

    queue = next
  }

  return { awaitingHunterShot }
}
