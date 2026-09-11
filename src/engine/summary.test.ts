import { describe, expect, it } from 'vitest'
import type { RoleId } from './roles'
import { endNight, lynch, recordAction, startNight, type PlayerSetup } from './state'
import { aggregate, summarise, type GameSummary } from './summary'
import { quietGame } from './testing'

const setup = (roles: RoleId[], names: string[]): PlayerSetup[] =>
  roles.map((roleId, i) => ({ name: names[i] ?? `P${i}`, roleId }))

/** One night and one day: the Family takes Beto, the Detective looks at Ana, the town hangs Ana. */
const townWins = () => {
  let state = quietGame(setup(['KILLER', 'PLAIN', 'GUARD', 'INSPECT', 'PLAIN'], ['Ana', 'Beto', 'Caro', 'Dani', 'Eva']))
  state = startNight(state)
  state = recordAction(state, { kind: 'target', roleId: 'GUARD', actor: 2, target: 2 })
  state = recordAction(state, { kind: 'target', roleId: 'INSPECT', actor: 3, target: 0 })
  state = recordAction(state, { kind: 'target', roleId: 'KILLER', actor: 0, target: 1 })
  state = endNight(state)
  return lynch(state, 0)
}

describe('summarising a finished game', () => {
  it('is null while the game is still on', () => {
    const fresh = quietGame(setup(['KILLER', 'PLAIN', 'GUARD', 'INSPECT'], ['Ana', 'Beto', 'Caro', 'Dani']))
    expect(summarise(fresh, 1)).toBeNull()
    let state = startNight(fresh)
    state = recordAction(state, { kind: 'target', roleId: 'GUARD', actor: 2, target: 2 })
    state = recordAction(state, { kind: 'target', roleId: 'INSPECT', actor: 3, target: 1 })
    state = recordAction(state, { kind: 'target', roleId: 'KILLER', actor: 0, target: 1 })
    state = endNight(state)
    expect(summarise(state, 1)).toBeNull()
  })

  it('records the winner, the nights, every seat, and how each died', () => {
    const state = townWins()
    const s = summarise(state, 1234)!
    expect(s.winner).toBe('town')
    expect(s.nights).toBe(1)
    expect(s.players).toBe(5)
    expect(s.seed).toBe(state.seed)
    expect(s.endedAt).toBe(1234)
    expect(s.seats.map((x) => x.name)).toEqual(['Ana', 'Beto', 'Caro', 'Dani', 'Eva'])
    const [ana, beto, caro] = s.seats
    expect(ana).toMatchObject({ roleId: 'KILLER', team: 'crew', alive: false, won: false, death: { night: 1, cause: 'lynch' } })
    expect(beto).toMatchObject({ roleId: 'PLAIN', team: 'town', alive: false, won: true, death: { night: 1, cause: 'killers' } })
    expect(caro).toMatchObject({ roleId: 'GUARD', alive: true, won: true, death: null })
    // Citizens carry their trade into the record; a dealt role has none.
    expect(beto!.trade).not.toBeNull()
    expect(caro!.trade).toBeNull()
  })

  it('counts the Detective’s looks and hits', () => {
    const s = summarise(townWins(), 1)!
    expect(s.looks).toBe(1)
    expect(s.hits).toBe(1)
  })

  it('gives the win to the Family when they reach parity', () => {
    let state = quietGame(setup(['KILLER', 'PLAIN', 'PLAIN', 'GUARD'], ['Ana', 'Beto', 'Caro', 'Dani']))
    state = startNight(state)
    state = recordAction(state, { kind: 'target', roleId: 'GUARD', actor: 3, target: 3 })
    state = recordAction(state, { kind: 'target', roleId: 'KILLER', actor: 0, target: 1 })
    state = endNight(state)
    state = lynch(state, 2)
    const s = summarise(state, 1)!
    expect(s.winner).toBe('crew')
    expect(s.seats.map((x) => x.won)).toEqual([true, false, false, false])
  })
})

describe('aggregating across games', () => {
  const game = (over: Partial<GameSummary>, seats: Partial<GameSummary['seats'][number]>[]): GameSummary => ({
    version: 1,
    seed: Math.random(),
    endedAt: 0,
    winner: 'town',
    players: seats.length,
    nights: 2,
    looks: 0,
    hits: 0,
    ...over,
    seats: seats.map((s) => ({
      name: 'X', roleId: 'PLAIN', team: 'town', trade: null, alive: true, death: null, won: true, ...s,
    })),
  })

  it('folds one name across games, whatever the spelling, and ranks by games played', () => {
    const stats = aggregate([
      game({ winner: 'town', nights: 3 }, [
        { name: 'Ana', roleId: 'KILLER', team: 'crew', alive: false, death: { night: 2, cause: 'lynch' }, won: false },
        { name: 'Beto', death: { night: 1, cause: 'killers' }, alive: false },
      ]),
      game({ winner: 'crew', nights: 1, looks: 2, hits: 1 }, [
        { name: ' ana ', roleId: 'PLAIN', alive: true, won: false },
        { name: 'Caro', roleId: 'KILLER', team: 'crew', won: true },
      ]),
    ])
    expect(stats.table).toEqual({ games: 2, town: 1, crew: 1, lovers: 0, martyr: 0, nights: 4, looks: 2, hits: 1 })
    expect(stats.names.map((n) => n.name)).toEqual([' ana ', 'Beto', 'Caro'])
    expect(stats.names[0]).toMatchObject({ games: 2, wins: 0, family: 1, hanged: 1, killed: 0, survived: 1 })
    expect(stats.names[1]).toMatchObject({ games: 1, wins: 1, hanged: 0, killed: 1, survived: 0 })
  })

  it('is empty for no games', () => {
    expect(aggregate([])).toEqual({
      table: { games: 0, town: 0, crew: 0, lovers: 0, martyr: 0, nights: 0, looks: 0, hits: 0 },
      names: [],
    })
  })
})
