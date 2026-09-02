import { NIGHT_ROLES, type RoleId, type Activity } from './roles'
import type { Player } from './types'

/**
 * Does a role act on this night at all?
 *
 * These timing rules are in the narrator script but were honoured by neither
 * old implementation — v1 prompted the Pirómano, the albino wolf and the Actor
 * every single night.
 */
export const actsOnNight = (activity: Activity, night: number): boolean => {
  switch (activity.kind) {
    case 'firstNightOnly':
      return night === 1
    case 'everyNight':
      return true
    case 'oddNights':
      return night % 2 === 1
    case 'evenNights':
      return night % 2 === 0
    case 'firstNNights':
      return night <= activity.n
    case 'passive':
      return false
  }
}

export interface ScheduleOptions {
  /**
   * The one-time conversion has been spent. The Godfather wakes with the
   * Family regardless, so his separate step — "does he signal?" — has nothing
   * left to ask and is dropped rather than prompting the narrator for nothing.
   */
  infectionUsed?: boolean
}

/**
 * The ordered list of roles the narrator is prompted for on a given night.
 *
 * A role is included when it acts on this night AND at least one living player
 * still holds it. The liveness check reads `players`, not a mutable
 * `rollsUsed` array — v1 kept that array in sync by hand and dropped entries
 * for players who were never actually dead.
 */
export const scheduleFor = (
  players: readonly Player[],
  night: number,
  options: ScheduleOptions = {},
): RoleId[] => {
  const livingRoles = new Set(players.filter((p) => p.alive).map((p) => p.roleId))

  return NIGHT_ROLES.filter(
    (role) =>
      livingRoles.has(role.id) &&
      actsOnNight(role.activity, night) &&
      !(role.id === 'CONVERT' && options.infectionUsed === true),
  ).map((role) => role.id)
}
