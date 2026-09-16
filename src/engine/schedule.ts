import { NIGHT_ROLES, ROLES, type RoleId, type Activity } from './roles'
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

/**
 * The ordered list of roles the narrator is prompted for on a given night.
 *
 * A role is included when it acts on this night AND at least one living player
 * still holds it. The liveness check reads `players`, not a mutable
 * `rollsUsed` array — v1 kept that array in sync by hand and dropped entries
 * for players who were never actually dead.
 */
export const scheduleFor = (players: readonly Player[], night: number): RoleId[] => {
  const livingRoles = new Set(players.filter((p) => p.alive).map((p) => p.roleId))

  // The hit is the Family's, not the plain member's. As long as anyone who
  // wakes with the Family is alive — the Godfather, the Renegade, a convert —
  // the step happens; it used to vanish with the last plain member, leaving
  // the rest of the Family asleep for the rest of the game. The Associate
  // only counts once he has joined.
  const familyAwake = players.some(
    (p) => p.alive && ROLES[p.roleId].team === 'crew' && p.roleId !== 'PICK_SIDE',
  )
  if (familyAwake) livingRoles.add('KILLER')

  // The Godfather keeps his step after the conversion is spent, with nothing
  // left to ask. Dropping it shortened the night by one, and the room reads
  // that: every other reason this list changes is public — a death is named the
  // next morning, parity is in the rules — so a count that falls with no death
  // to explain it says he has used it.
  //
  // The invariant to hold, rather than the rule: EVERY CHANGE IN THE LENGTH OF
  // THIS LIST IS EXPLAINED BY SOMETHING THE ROOM HAS ALREADY BEEN TOLD. The
  // death path satisfies it — he dies on night N, is named on the morning of
  // day N+1, and the schedule that loses his step is built at nightfall of
  // that same day — so it stays as it is. This is the Apothecary's precedent,
  // whose spent vials do not shorten the night either.
  return NIGHT_ROLES.filter(
    (role) => livingRoles.has(role.id) && actsOnNight(role.activity, night),
  ).map((role) => role.id)
}
