import { ROLES, type RoleId } from './roles'
import type { GameState, Player } from './types'

/**
 * Who this role may target tonight, after its own constraints.
 *
 * A game rule, so it lives in the engine: the night screen offers exactly
 * these seats, and the simulator picks among exactly these, so the two can
 * never disagree about what a role is allowed to do.
 */
export const legalTargets = (state: GameState, roleId: RoleId): Player[] => {
  const spec = ROLES[roleId].target
  const living = state.players.filter((p) => p.alive)
  if (spec.kind !== 'player') return living

  return living.filter((p) => {
    // The Family never eats its own. The Renegade may — that is his point.
    if (roleId === 'KILLER' && ROLES[p.roleId].team === 'crew') return false
    if (!spec.mayTargetSelf && p.roleId === roleId) return false
    // "…but never the same person two nights running."
    if (!spec.mayRepeatConsecutively && p.protectedLastNight) return false
    return true
  })
}
