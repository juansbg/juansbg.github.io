import { ROLES, ROLE_IDS, type RoleId } from './roles'
import type { Player } from './types'

/**
 * The cards left in the centre after the deal — what the Chameleon may take.
 *
 * Roles are dealt digitally, so there is no physical pile: the centre is
 * every town card nobody at the table holds, dead or alive. Three kinds are
 * never there. The Chameleon's own card. Cards whose only move is on the first
 * night, because that step has already passed by the time the Chameleon acts
 * and the card would be inert. And the plain Citizen, which is the card he
 * effectively has already. The Family's cards are never in the centre either:
 * the deal puts every one of them in a hand.
 */
export const spareCards = (players: readonly Player[]): RoleId[] => {
  const held = new Set(players.map((p) => p.roleId))
  return ROLE_IDS.filter((id) => {
    const role = ROLES[id]
    return (
      role.team === 'town' &&
      id !== 'SWAP' &&
      id !== 'PLAIN' &&
      role.activity.kind !== 'firstNightOnly' &&
      !held.has(id)
    )
  })
}
