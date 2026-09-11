import { spareCards } from '../engine/cards'
import { doomedTonight } from '../engine/resolve'
import { ROLES, type RoleId } from '../engine/roles'
import { currentStep } from '../engine/state'
import { legalTargets } from '../engine/targets'
import type { GameState, NightAction, Player, PlayerId } from '../engine/types'
import { familyVictim } from '../ui/screens/night'

/**
 * A night step taken from a player's phone (docs/BIG-SCREEN.md §10).
 *
 * The phone sends what it chose, in the shape of the tap the narrator would
 * have made; `acceptAction` turns it into the engine's `NightAction` or
 * refuses it. The rules here are the narrator's screen's rules, checked
 * again on the narrator's device because a phone is not trusted: the sender
 * must be the one whose step it is, the pick must be one the step offers,
 * the vials and the centre must hold what is asked for. What passes is
 * recorded exactly as a tap; what fails is dropped and the phone sees the
 * step unchanged.
 */
export type SeatAction =
  | { kind: 'target'; target: PlayerId }
  | { kind: 'pair'; first: PlayerId; second: PlayerId }
  | { kind: 'potion'; target: PlayerId; potion: 'heal' | 'kill' }
  | { kind: 'split'; sectOne: PlayerId[] }
  | { kind: 'chooseRole'; newRole: RoleId }
  | { kind: 'confirm' }
  | { kind: 'skip' }

/**
 * Does this seat act at this step? Its own role's step, or the Family's for
 * anyone who wakes with the Family: every living crew member but an Associate
 * who has not chosen yet, the same names the narrator's card lists.
 */
export const actsAt = (me: Player, step: RoleId | null): boolean => {
  if (step === null || !me.alive) return false
  if (step === 'KILLER') return ROLES[me.roleId].team === 'crew' && me.roleId !== 'PICK_SIDE'
  return me.roleId === step
}

/** The seats a step may pick among: the engine's rule for a target, the living for a pair or the split. */
export const eligibleAt = (state: GameState, step: RoleId): PlayerId[] => {
  const spec = ROLES[step].target
  if (spec.kind === 'none') return []
  return legalTargets(state, step).map((p) => p.id)
}

const living = (state: GameState): Set<PlayerId> =>
  new Set(state.players.filter((p) => p.alive).map((p) => p.id))

const isSeat = (value: unknown): value is PlayerId =>
  typeof value === 'number' && Number.isInteger(value) && value >= 0

export const acceptAction = (state: GameState, seat: PlayerId, action: SeatAction): NightAction | null => {
  if (state.phase !== 'night') return null
  const step = currentStep(state)
  const me = state.players.find((p) => p.id === seat)
  if (step === null || me === undefined || !actsAt(me, step)) return null
  const spec = ROLES[step].target
  const alive = living(state)

  switch (action.kind) {
    case 'target': {
      if (spec.kind !== 'player' || !isSeat(action.target)) return null
      if (!eligibleAt(state, step).includes(action.target)) return null
      return { kind: 'target', roleId: step, actor: seat, target: action.target }
    }
    case 'pair': {
      if (spec.kind !== 'twoPlayers' || !isSeat(action.first) || !isSeat(action.second)) return null
      if (action.first === action.second || !alive.has(action.first) || !alive.has(action.second)) return null
      return { kind: 'pair', roleId: step, first: action.first, second: action.second }
    }
    case 'potion': {
      if (step !== 'MEDIC' || spec.kind !== 'potion' || !isSeat(action.target) || !alive.has(action.target)) return null
      if (action.potion === 'heal') {
        if (state.healUsed || !doomedTonight(state).includes(action.target)) return null
      } else if (action.potion === 'kill') {
        if (state.poisonUsed) return null
      } else {
        return null
      }
      return { kind: 'potion', roleId: 'MEDIC', target: action.target, potion: action.potion }
    }
    case 'split': {
      if (step !== 'SPLIT' || spec.kind !== 'split' || !Array.isArray(action.sectOne)) return null
      const one = new Set(action.sectOne.filter(isSeat))
      if (one.size !== action.sectOne.length) return null
      for (const id of one) if (!alive.has(id)) return null
      const sectOne = [...alive].filter((id) => one.has(id))
      const sectTwo = [...alive].filter((id) => !one.has(id))
      if (sectOne.length === 0 || sectTwo.length === 0) return null
      return { kind: 'split', roleId: 'SPLIT', sectOne, sectTwo }
    }
    case 'chooseRole': {
      if (typeof action.newRole !== 'string') return null
      if (step === 'SWAP') {
        if (!spareCards(state.players).includes(action.newRole)) return null
      } else if (step === 'PICK_SIDE') {
        if (action.newRole !== 'KILLER' && action.newRole !== 'PLAIN') return null
      } else {
        return null
      }
      return { kind: 'chooseRole', roleId: step, newRole: action.newRole }
    }
    case 'confirm': {
      // The Godfather takes the victim in; there is nothing else a phone confirms.
      if (step !== 'CONVERT' || state.infectionUsed || familyVictim(state) === null) return null
      return { kind: 'confirm', roleId: step }
    }
    case 'skip': {
      // "No one", "keep the card", "let the hit go ahead". The Associate must choose.
      if (step === 'PICK_SIDE') return null
      return { kind: 'skip', roleId: step }
    }
    default:
      return null
  }
}

/**
 * A mark is a proposal, not a record: the seat the Family is looking at
 * tonight, moved by any Family phone and shown to all of them. It is only
 * meaningful at a step that picks one seat, and only from a seat acting at it.
 */
export const acceptMark = (state: GameState, seat: PlayerId, target: PlayerId | null): PlayerId[] | null => {
  if (state.phase !== 'night') return null
  const step = currentStep(state)
  const me = state.players.find((p) => p.id === seat)
  if (step === null || me === undefined || !actsAt(me, step)) return null
  if (ROLES[step].target.kind !== 'player') return null
  if (target === null) return []
  if (!isSeat(target) || !eligibleAt(state, step).includes(target)) return null
  return [target]
}
