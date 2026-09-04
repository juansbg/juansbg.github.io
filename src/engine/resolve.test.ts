import { describe, expect, it } from 'vitest'
import { doomedTonight, resolveNight } from './resolve'
import type { GameState, NightAction, Outcome, Player } from './types'
import { STATE_VERSION } from './types'
import type { RoleId } from './roles'

const makePlayer = (id: number, roleId: RoleId, name = `P${id}`): Player => ({
  id,
  name,
  roleId,
  alive: true,
  protectedTonight: false,
  protectedLastNight: false,
  wolfAttacksSurvivable: roleId === 'SURVIVE' ? 1 : 0,
  loverOf: null,
  silencedOnDay: null,
  extraVotesOnDay: null,
  sect: null,
  fatherOf: null,
  hasQuestion: false,
})

const stateWith = (
  roles: RoleId[],
  pending: NightAction[],
  overrides: Partial<GameState> = {},
): GameState => ({
  version: STATE_VERSION,
  phase: 'night',
  night: 1,
  day: 0,
  players: roles.map((r, i) => makePlayer(i, r)),
  schedule: [],
  stepIndex: 0,
  pending,
  votes: [],
  log: [],
  infectionUsed: false,
  healUsed: false,
  poisonUsed: false,
  awaitingHunterShot: null,
  ...overrides,
})

const deadIds = (outcomes: Outcome[]): number[] =>
  outcomes.filter((o) => o.type === 'death').map((o) => o.target)

describe('wolf attacks', () => {
  it('kills an unprotected victim', () => {
    const state = stateWith(
      ['KILLER', 'PLAIN'],
      [{ kind: 'target', roleId: 'KILLER', actor: 0, target: 1 }],
    )
    const { players, outcomes } = resolveNight(state)

    expect(deadIds(outcomes)).toEqual([1])
    expect(players[1]!.alive).toBe(false)
  })

  it('is stopped by the Protector, and the block stays secret', () => {
    const state = stateWith(
      ['KILLER', 'PLAIN', 'GUARD'],
      [
        { kind: 'target', roleId: 'GUARD', actor: 2, target: 1 },
        { kind: 'target', roleId: 'KILLER', actor: 0, target: 1 },
      ],
    )
    const { players, outcomes } = resolveNight(state)

    expect(deadIds(outcomes)).toEqual([])
    expect(players[1]!.alive).toBe(true)

    const blocked = outcomes.find((o) => o.type === 'attackBlocked')
    expect(blocked).toMatchObject({ by: 'GUARD', public: false })
  })

  it('lets the Anciano survive his first attack but not his second', () => {
    const first = stateWith(
      ['KILLER', 'SURVIVE'],
      [{ kind: 'target', roleId: 'KILLER', actor: 0, target: 1 }],
    )
    const afterFirst = resolveNight(first)

    expect(afterFirst.players[1]!.alive).toBe(true)
    expect(afterFirst.players[1]!.wolfAttacksSurvivable).toBe(0)
    expect(afterFirst.outcomes.find((o) => o.type === 'attackBlocked')).toMatchObject({ by: 'SURVIVE' })

    const second = stateWith(
      ['KILLER', 'SURVIVE'],
      [{ kind: 'target', roleId: 'KILLER', actor: 0, target: 1 }],
      { night: 2, players: afterFirst.players },
    )
    expect(resolveNight(second).players[1]!.alive).toBe(false)
  })

  it('lets the albino wolf kill another wolf', () => {
    const state = stateWith(
      ['KILLER', 'ROGUE', 'PLAIN'],
      [{ kind: 'target', roleId: 'ROGUE', actor: 1, target: 0 }],
      { night: 2 },
    )
    expect(resolveNight(state).players[0]!.alive).toBe(false)
  })
})

describe("the Bruja's potions", () => {
  // v1 populated the Curar/Matar dropdown and discarded the answer entirely:
  // configureLastStep() had no MEDIC case.
  it('heals the wolves’ victim', () => {
    const state = stateWith(
      ['KILLER', 'PLAIN', 'MEDIC'],
      [
        { kind: 'target', roleId: 'KILLER', actor: 0, target: 1 },
        { kind: 'potion', roleId: 'MEDIC', target: 1, potion: 'heal' },
      ],
    )
    const { players, outcomes } = resolveNight(state)

    expect(deadIds(outcomes)).toEqual([])
    expect(players[1]!.alive).toBe(true)
    expect(outcomes.find((o) => o.type === 'attackBlocked')).toMatchObject({ by: 'MEDIC' })
  })

  it('poisons a second victim on the same night', () => {
    const state = stateWith(
      ['KILLER', 'PLAIN', 'MEDIC', 'INSPECT'],
      [
        { kind: 'target', roleId: 'KILLER', actor: 0, target: 1 },
        { kind: 'potion', roleId: 'MEDIC', target: 3, potion: 'kill' },
      ],
    )
    expect(deadIds(resolveNight(state).outcomes).sort()).toEqual([1, 3])
  })

  it('poisons through the Protector’s shield', () => {
    const state = stateWith(
      ['KILLER', 'PLAIN', 'MEDIC', 'GUARD'],
      [
        { kind: 'target', roleId: 'GUARD', actor: 3, target: 1 },
        { kind: 'potion', roleId: 'MEDIC', target: 1, potion: 'kill' },
      ],
    )
    expect(resolveNight(state).players[1]!.alive).toBe(false)
  })
})

describe('Cupido', () => {
  it('pairs two lovers', () => {
    const state = stateWith(
      ['PAIR', 'PLAIN', 'INSPECT'],
      [{ kind: 'pair', roleId: 'PAIR', first: 1, second: 2 }],
    )
    const { players } = resolveNight(state)

    expect(players[1]!.loverOf).toBe(2)
    expect(players[2]!.loverOf).toBe(1)
  })

  it('kills the surviving lover of heartbreak', () => {
    const paired = resolveNight(
      stateWith(['PAIR', 'PLAIN', 'INSPECT', 'KILLER'], [{ kind: 'pair', roleId: 'PAIR', first: 1, second: 2 }]),
    )

    const state = stateWith(
      [],
      [{ kind: 'target', roleId: 'KILLER', actor: 3, target: 1 }],
      { night: 2, players: paired.players },
    )
    const { players, outcomes } = resolveNight(state)

    expect(players[1]!.alive).toBe(false)
    expect(players[2]!.alive).toBe(false)
    expect(outcomes.find((o) => o.type === 'death' && o.target === 2)).toMatchObject({
      cause: 'heartbreak',
    })
  })
})

describe('the Infecto', () => {
  it('converts its victim into a wolf instead of killing them', () => {
    const state = stateWith(
      ['CONVERT', 'PLAIN', 'KILLER'],
      [
        { kind: 'target', roleId: 'KILLER', actor: 2, target: 1 },
        { kind: 'skip', roleId: 'GUARD' },
        { kind: 'confirm', roleId: 'CONVERT' },
      ],
    )
    const { players, outcomes, infectionUsed } = resolveNight(state)

    expect(players[1]!.alive).toBe(true)
    expect(players[1]!.roleId).toBe('KILLER')
    expect(infectionUsed).toBe(true)
    expect(outcomes.find((o) => o.type === 'converted')).toBeDefined()
  })

  it('only converts once per game — the second attack kills', () => {
    const state = stateWith(
      ['CONVERT', 'PLAIN', 'KILLER'],
      [
        { kind: 'target', roleId: 'KILLER', actor: 2, target: 1 },
        { kind: 'confirm', roleId: 'CONVERT' },
      ],
      { infectionUsed: true },
    )
    const { players } = resolveNight(state)

    expect(players[1]!.alive).toBe(false)
    expect(players[1]!.roleId).toBe('PLAIN')
  })
})

describe('day-scoped effects', () => {
  it('silences the Píromano’s target for the coming day', () => {
    const state = stateWith(
      ['SILENCE', 'PLAIN'],
      [{ kind: 'target', roleId: 'SILENCE', actor: 0, target: 1 }],
      { night: 1, day: 0 },
    )
    const { players, outcomes } = resolveNight(state)

    expect(players[1]!.silencedOnDay).toBe(1)
    expect(outcomes.find((o) => o.type === 'silenced')).toMatchObject({ public: true })
  })

  it('records the Cuervo’s extra vote publicly and the Vidente’s look secretly', () => {
    const state = stateWith(
      ['EXTRA_VOTE', 'INSPECT', 'PLAIN'],
      [
        { kind: 'target', roleId: 'EXTRA_VOTE', actor: 0, target: 2 },
        { kind: 'target', roleId: 'INSPECT', actor: 1, target: 2 },
      ],
    )
    const { outcomes } = resolveNight(state)

    expect(outcomes.find((o) => o.type === 'extraVote')).toMatchObject({ public: true })
    expect(outcomes.find((o) => o.type === 'inspected')).toMatchObject({ public: false })
  })
})

describe('the Cazador', () => {
  it('still owes a shot when killed', () => {
    const state = stateWith(
      ['KILLER', 'AVENGE'],
      [{ kind: 'target', roleId: 'KILLER', actor: 0, target: 1 }],
    )
    expect(resolveNight(state).awaitingHunterShot).toBe(1)
  })
})

describe('duplicate names', () => {
  // The v1 corruption this engine exists to prevent.
  it('kills only the targeted player when two share a name', () => {
    const state = stateWith(
      ['KILLER', 'INSPECT', 'PLAIN'],
      [{ kind: 'target', roleId: 'KILLER', actor: 0, target: 2 }],
    )
    state.players[1]!.name = 'Ana'
    state.players[2]!.name = 'Ana'

    const { players, outcomes } = resolveNight(state)

    expect(deadIds(outcomes)).toEqual([2])
    expect(players[1]!.alive).toBe(true)
    expect(players[2]!.alive).toBe(false)
  })
})

describe('purity', () => {
  it('does not mutate the state it is given', () => {
    const state = stateWith(
      ['KILLER', 'PLAIN'],
      [{ kind: 'target', roleId: 'KILLER', actor: 0, target: 1 }],
    )
    const before = structuredClone(state)
    resolveNight(state)

    expect(state).toEqual(before)
  })

  it('emits no user-visible strings', () => {
    const state = stateWith(
      ['KILLER', 'PLAIN', 'GUARD', 'MEDIC'],
      [
        { kind: 'target', roleId: 'GUARD', actor: 2, target: 1 },
        { kind: 'target', roleId: 'KILLER', actor: 0, target: 1 },
      ],
    )
    const { outcomes } = resolveNight(state)

    // Every string in an outcome must be a known enum tag, never prose.
    const allowed = new Set([
      'death', 'attackBlocked', 'inspected', 'protected', 'lovers', 'father',
      'converted', 'silenced', 'extraVote', 'sectSplit', 'growl', 'roleChanged',
      'killers', 'rogue', 'poison', 'lynch', 'heartbreak', 'revenge',
      'GUARD', 'SURVIVE', 'MEDIC', 'INSPECT', 'CONVERT', 'KILLER',
    ])
    for (const outcome of outcomes) {
      for (const value of Object.values(outcome)) {
        if (typeof value === 'string') expect(allowed.has(value)).toBe(true)
      }
    }
  })
})

describe("the Apothecary's vials work once each", () => {
  // Nothing tracked the vials before, so she could cure or poison every night.
  const hit: NightAction = { kind: 'target', roleId: 'KILLER', actor: 0, target: 1 }

  it('spends the cure when it saves someone', () => {
    const state = stateWith(
      ['KILLER', 'PLAIN', 'MEDIC'],
      [hit, { kind: 'potion', roleId: 'MEDIC', target: 1, potion: 'heal' }],
    )
    const { players, healUsed, poisonUsed } = resolveNight(state)
    expect(players[1]!.alive).toBe(true)
    expect(healUsed).toBe(true)
    expect(poisonUsed).toBe(false)
  })

  it('does not honour a second cure', () => {
    const state = stateWith(
      ['KILLER', 'PLAIN', 'MEDIC'],
      [hit, { kind: 'potion', roleId: 'MEDIC', target: 1, potion: 'heal' }],
      { healUsed: true },
    )
    const { players, outcomes } = resolveNight(state)
    expect(players[1]!.alive).toBe(false)
    expect(outcomes.find((o) => o.type === 'attackBlocked')).toBeUndefined()
  })

  it('does not spend a cure poured on someone who was not dying', () => {
    const state = stateWith(
      ['KILLER', 'PLAIN', 'MEDIC'],
      [{ kind: 'potion', roleId: 'MEDIC', target: 1, potion: 'heal' }],
    )
    expect(resolveNight(state).healUsed).toBe(false)
  })

  it('spends the poison when it kills', () => {
    const state = stateWith(
      ['KILLER', 'PLAIN', 'MEDIC', 'INSPECT'],
      [{ kind: 'potion', roleId: 'MEDIC', target: 3, potion: 'kill' }],
    )
    const { players, poisonUsed } = resolveNight(state)
    expect(players[3]!.alive).toBe(false)
    expect(poisonUsed).toBe(true)
  })

  it('does not honour a second poison', () => {
    const state = stateWith(
      ['KILLER', 'PLAIN', 'MEDIC', 'INSPECT'],
      [{ kind: 'potion', roleId: 'MEDIC', target: 3, potion: 'kill' }],
      { poisonUsed: true },
    )
    expect(resolveNight(state).players[3]!.alive).toBe(true)
  })
})

describe('who is set to die tonight', () => {
  // What the narrator whispers to the Apothecary, read off the night so far.
  it('lists the direct victims recorded so far', () => {
    const state = stateWith(
      ['KILLER', 'PLAIN', 'PLAIN', 'ROGUE', 'MEDIC'],
      [
        { kind: 'target', roleId: 'KILLER', actor: 0, target: 1 },
        { kind: 'target', roleId: 'ROGUE', actor: 3, target: 2 },
      ],
    )
    expect(doomedTonight(state).sort()).toEqual([1, 2])
  })

  it('leaves out a victim the bodyguard already shielded', () => {
    const state = stateWith(
      ['KILLER', 'PLAIN', 'GUARD', 'MEDIC'],
      [
        { kind: 'target', roleId: 'GUARD', actor: 2, target: 1 },
        { kind: 'target', roleId: 'KILLER', actor: 0, target: 1 },
      ],
    )
    expect(doomedTonight(state)).toEqual([])
  })

  it('is empty before the Family has chosen', () => {
    expect(doomedTonight(stateWith(['KILLER', 'PLAIN', 'MEDIC'], []))).toEqual([])
  })

  it('does not count a lover who would die of heartbreak', () => {
    // A cure cannot be poured on a consequence — only on the one attacked.
    const base = stateWith(
      ['KILLER', 'PLAIN', 'PLAIN', 'MEDIC'],
      [{ kind: 'target', roleId: 'KILLER', actor: 0, target: 1 }],
    )
    const state: GameState = {
      ...base,
      players: base.players.map((p) =>
        p.id === 1 ? { ...p, loverOf: 2 } : p.id === 2 ? { ...p, loverOf: 1 } : p,
      ),
    }
    expect(doomedTonight(state)).toEqual([1])
  })

  it('changes nothing: the dry run is pure', () => {
    const state = stateWith(
      ['KILLER', 'PLAIN', 'MEDIC'],
      [{ kind: 'target', roleId: 'KILLER', actor: 0, target: 1 }],
    )
    const before = JSON.stringify(state)
    doomedTonight(state)
    expect(JSON.stringify(state)).toBe(before)
  })
})

describe('the Chameleon', () => {
  const took = (newRole: RoleId) =>
    resolveNight(
      stateWith(
        ['SWAP', 'KILLER', 'PLAIN', 'INSPECT'],
        [{ kind: 'chooseRole', roleId: 'SWAP', newRole }],
      ),
    )

  it('becomes the card he took', () => {
    const { players, outcomes } = took('GUARD')
    expect(players[0]!.roleId).toBe('GUARD')
    expect(outcomes.find((o) => o.type === 'roleChanged')).toMatchObject({ target: 0, to: 'GUARD' })
  })

  it('tells the table which card left the centre, never who took it', () => {
    const { outcomes } = took('GUARD')
    const taken = outcomes.find((o) => o.type === 'cardTaken')
    expect(taken).toMatchObject({ role: 'GUARD', public: true })
    expect(taken).not.toHaveProperty('target')
  })

  it('gets the Veteran’s free life along with the card', () => {
    expect(took('SURVIVE').players[0]!.wolfAttacksSurvivable).toBe(1)
  })

  it('does not announce the Associate’s side the same way', () => {
    const { outcomes } = resolveNight(
      stateWith(['PICK_SIDE', 'KILLER', 'PLAIN'], [{ kind: 'chooseRole', roleId: 'PICK_SIDE', newRole: 'KILLER' }]),
    )
    expect(outcomes.find((o) => o.type === 'cardTaken')).toBeUndefined()
  })
})
