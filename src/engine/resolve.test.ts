import { describe, expect, it } from 'vitest'
import { resolveNight } from './resolve'
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
  wolfAttacksSurvivable: roleId === 'ANC' ? 1 : 0,
  loverOf: null,
  silencedOnDay: null,
  extraVotesOnDay: null,
  sect: null,
  fatherOf: null,
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
  log: [],
  infectionUsed: false,
  awaitingHunterShot: null,
  ...overrides,
})

const deadIds = (outcomes: Outcome[]): number[] =>
  outcomes.filter((o) => o.type === 'death').map((o) => o.target)

describe('wolf attacks', () => {
  it('kills an unprotected victim', () => {
    const state = stateWith(
      ['LOB', 'ALD'],
      [{ kind: 'target', roleId: 'LOB', actor: 0, target: 1 }],
    )
    const { players, outcomes } = resolveNight(state)

    expect(deadIds(outcomes)).toEqual([1])
    expect(players[1]!.alive).toBe(false)
  })

  it('is stopped by the Protector, and the block stays secret', () => {
    const state = stateWith(
      ['LOB', 'ALD', 'PRO'],
      [
        { kind: 'target', roleId: 'PRO', actor: 2, target: 1 },
        { kind: 'target', roleId: 'LOB', actor: 0, target: 1 },
      ],
    )
    const { players, outcomes } = resolveNight(state)

    expect(deadIds(outcomes)).toEqual([])
    expect(players[1]!.alive).toBe(true)

    const blocked = outcomes.find((o) => o.type === 'attackBlocked')
    expect(blocked).toMatchObject({ by: 'PRO', public: false })
  })

  it('lets the Anciano survive his first attack but not his second', () => {
    const first = stateWith(
      ['LOB', 'ANC'],
      [{ kind: 'target', roleId: 'LOB', actor: 0, target: 1 }],
    )
    const afterFirst = resolveNight(first)

    expect(afterFirst.players[1]!.alive).toBe(true)
    expect(afterFirst.players[1]!.wolfAttacksSurvivable).toBe(0)
    expect(afterFirst.outcomes.find((o) => o.type === 'attackBlocked')).toMatchObject({ by: 'ANC' })

    const second = stateWith(
      ['LOB', 'ANC'],
      [{ kind: 'target', roleId: 'LOB', actor: 0, target: 1 }],
      { night: 2, players: afterFirst.players },
    )
    expect(resolveNight(second).players[1]!.alive).toBe(false)
  })

  it('lets the albino wolf kill another wolf', () => {
    const state = stateWith(
      ['LOB', 'ALB', 'ALD'],
      [{ kind: 'target', roleId: 'ALB', actor: 1, target: 0 }],
      { night: 2 },
    )
    expect(resolveNight(state).players[0]!.alive).toBe(false)
  })
})

describe("the Bruja's potions", () => {
  // v1 populated the Curar/Matar dropdown and discarded the answer entirely:
  // configureLastStep() had no BRU case.
  it('heals the wolves’ victim', () => {
    const state = stateWith(
      ['LOB', 'ALD', 'BRU'],
      [
        { kind: 'target', roleId: 'LOB', actor: 0, target: 1 },
        { kind: 'potion', roleId: 'BRU', target: 1, potion: 'heal' },
      ],
    )
    const { players, outcomes } = resolveNight(state)

    expect(deadIds(outcomes)).toEqual([])
    expect(players[1]!.alive).toBe(true)
    expect(outcomes.find((o) => o.type === 'attackBlocked')).toMatchObject({ by: 'BRU' })
  })

  it('poisons a second victim on the same night', () => {
    const state = stateWith(
      ['LOB', 'ALD', 'BRU', 'VID'],
      [
        { kind: 'target', roleId: 'LOB', actor: 0, target: 1 },
        { kind: 'potion', roleId: 'BRU', target: 3, potion: 'kill' },
      ],
    )
    expect(deadIds(resolveNight(state).outcomes).sort()).toEqual([1, 3])
  })

  it('poisons through the Protector’s shield', () => {
    const state = stateWith(
      ['LOB', 'ALD', 'BRU', 'PRO'],
      [
        { kind: 'target', roleId: 'PRO', actor: 3, target: 1 },
        { kind: 'potion', roleId: 'BRU', target: 1, potion: 'kill' },
      ],
    )
    expect(resolveNight(state).players[1]!.alive).toBe(false)
  })
})

describe('Cupido', () => {
  it('pairs two lovers', () => {
    const state = stateWith(
      ['CUP', 'ALD', 'VID'],
      [{ kind: 'pair', roleId: 'CUP', first: 1, second: 2 }],
    )
    const { players } = resolveNight(state)

    expect(players[1]!.loverOf).toBe(2)
    expect(players[2]!.loverOf).toBe(1)
  })

  it('kills the surviving lover of heartbreak', () => {
    const paired = resolveNight(
      stateWith(['CUP', 'ALD', 'VID', 'LOB'], [{ kind: 'pair', roleId: 'CUP', first: 1, second: 2 }]),
    )

    const state = stateWith(
      [],
      [{ kind: 'target', roleId: 'LOB', actor: 3, target: 1 }],
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
      ['INF', 'ALD', 'LOB'],
      [
        { kind: 'target', roleId: 'LOB', actor: 2, target: 1 },
        { kind: 'skip', roleId: 'PRO' },
        { kind: 'confirm', roleId: 'INF' },
      ],
    )
    const { players, outcomes, infectionUsed } = resolveNight(state)

    expect(players[1]!.alive).toBe(true)
    expect(players[1]!.roleId).toBe('LOB')
    expect(infectionUsed).toBe(true)
    expect(outcomes.find((o) => o.type === 'converted')).toBeDefined()
  })

  it('only converts once per game — the second attack kills', () => {
    const state = stateWith(
      ['INF', 'ALD', 'LOB'],
      [
        { kind: 'target', roleId: 'LOB', actor: 2, target: 1 },
        { kind: 'confirm', roleId: 'INF' },
      ],
      { infectionUsed: true },
    )
    const { players } = resolveNight(state)

    expect(players[1]!.alive).toBe(false)
    expect(players[1]!.roleId).toBe('ALD')
  })
})

describe('day-scoped effects', () => {
  it('silences the Píromano’s target for the coming day', () => {
    const state = stateWith(
      ['PIR', 'ALD'],
      [{ kind: 'target', roleId: 'PIR', actor: 0, target: 1 }],
      { night: 1, day: 0 },
    )
    const { players, outcomes } = resolveNight(state)

    expect(players[1]!.silencedOnDay).toBe(1)
    expect(outcomes.find((o) => o.type === 'silenced')).toMatchObject({ public: true })
  })

  it('records the Cuervo’s extra vote publicly and the Vidente’s look secretly', () => {
    const state = stateWith(
      ['CUE', 'VID', 'ALD'],
      [
        { kind: 'target', roleId: 'CUE', actor: 0, target: 2 },
        { kind: 'target', roleId: 'VID', actor: 1, target: 2 },
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
      ['LOB', 'CAZ'],
      [{ kind: 'target', roleId: 'LOB', actor: 0, target: 1 }],
    )
    expect(resolveNight(state).awaitingHunterShot).toBe(1)
  })
})

describe('duplicate names', () => {
  // The v1 corruption this engine exists to prevent.
  it('kills only the targeted player when two share a name', () => {
    const state = stateWith(
      ['LOB', 'VID', 'ALD'],
      [{ kind: 'target', roleId: 'LOB', actor: 0, target: 2 }],
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
      ['LOB', 'ALD'],
      [{ kind: 'target', roleId: 'LOB', actor: 0, target: 1 }],
    )
    const before = structuredClone(state)
    resolveNight(state)

    expect(state).toEqual(before)
  })

  it('emits no user-visible strings', () => {
    const state = stateWith(
      ['LOB', 'ALD', 'PRO', 'BRU'],
      [
        { kind: 'target', roleId: 'PRO', actor: 2, target: 1 },
        { kind: 'target', roleId: 'LOB', actor: 0, target: 1 },
      ],
    )
    const { outcomes } = resolveNight(state)

    // Every string in an outcome must be a known enum tag, never prose.
    const allowed = new Set([
      'death', 'attackBlocked', 'inspected', 'protected', 'lovers', 'father',
      'converted', 'silenced', 'extraVote', 'sectSplit', 'growl', 'roleChanged',
      'wolves', 'albino', 'witch', 'lynch', 'heartbreak', 'hunter',
      'PRO', 'ANC', 'BRU', 'VID', 'INF', 'LOB',
    ])
    for (const outcome of outcomes) {
      for (const value of Object.values(outcome)) {
        if (typeof value === 'string') expect(allowed.has(value)).toBe(true)
      }
    }
  })
})
