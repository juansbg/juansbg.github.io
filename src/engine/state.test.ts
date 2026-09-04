import { describe, expect, it } from 'vitest'
import {
  advance,
  canUndo,
  createGame,
  currentStep,
  endNight,
  hunterShot,
  isNightComplete,
  lynch,
  newSession,
  recordAction,
  startNight,
  undo,
  revertTo,
  swapSeats,
  moveSeat,
  winner,
  canVote,
  castVote,
  withdrawVote,
  tally,
  leader,
  type PlayerSetup,
} from './state'
import { TRADE_COUNT, assignTrades, revealedDead } from './state'
import { quietGame } from './testing'
import { STATE_VERSION, type GameState, type NightAction } from './types'
import type { RoleId } from './roles'

const cast = (roles: RoleId[], names?: string[]): PlayerSetup[] =>
  roles.map((roleId, i) => ({ name: names?.[i] ?? `P${i}`, roleId }))

describe('createGame', () => {
  it('gives every player a distinct id even when names collide', () => {
    const state = createGame(cast(['KILLER', 'INSPECT'], ['Ana', 'Ana']))
    expect(state.players.map((p) => p.id)).toEqual([0, 1])
    expect(state.players[0]!.name).toBe(state.players[1]!.name)
  })

  it('grants the Anciano one survivable wolf attack', () => {
    const state = createGame(cast(['SURVIVE', 'KILLER']))
    expect(state.players[0]!.wolfAttacksSurvivable).toBe(1)
    expect(state.players[1]!.wolfAttacksSurvivable).toBe(0)
  })

  it('stamps a version so saved games can be migrated later', () => {
    expect(createGame(cast(['PLAIN'])).version).toBe(STATE_VERSION)
  })
})

describe('stepping through a night', () => {
  it('walks the schedule in order and reports completion', () => {
    let state = startNight(createGame(cast(['GUARD', 'INSPECT', 'KILLER', 'PLAIN'])))
    expect(state.schedule).toEqual(['GUARD', 'INSPECT', 'KILLER'])

    expect(currentStep(state)).toBe('GUARD')
    state = recordAction(state, { kind: 'target', roleId: 'GUARD', actor: 0, target: 3 })
    expect(currentStep(state)).toBe('INSPECT')

    state = recordAction(state, { kind: 'target', roleId: 'INSPECT', actor: 1, target: 2 })
    state = recordAction(state, { kind: 'target', roleId: 'KILLER', actor: 2, target: 3 })

    expect(isNightComplete(state)).toBe(true)
    expect(currentStep(state)).toBeNull()
  })

  it('stops prompting for the Protector once he is dead', () => {
    let state = startNight(createGame(cast(['GUARD', 'KILLER', 'PLAIN'])))
    state = recordAction(state, { kind: 'skip', roleId: 'GUARD' })
    state = recordAction(state, { kind: 'target', roleId: 'KILLER', actor: 1, target: 0 })
    state = endNight(state)

    expect(state.players[0]!.alive).toBe(false)
    expect(startNight(state).schedule).toEqual(['KILLER'])
  })

  it('forbids the Protector repeating a target, per the script', () => {
    let state = startNight(createGame(cast(['GUARD', 'KILLER', 'PLAIN'])))
    state = recordAction(state, { kind: 'target', roleId: 'GUARD', actor: 0, target: 2 })
    state = recordAction(state, { kind: 'skip', roleId: 'KILLER' })
    state = startNight(endNight(state))

    // The engine records who was shielded last night; the UI uses this to grey
    // that player out of the Protector's list.
    expect(state.players[2]!.protectedLastNight).toBe(true)
    expect(state.players[1]!.protectedLastNight).toBe(false)
  })
})

describe('undo', () => {
  it('restores the previous state exactly', () => {
    let session = newSession(startNight(createGame(cast(['GUARD', 'INSPECT', 'KILLER']))))
    const before = structuredClone(session.current)

    session = advance(session, (s) =>
      recordAction(s, { kind: 'target', roleId: 'GUARD', actor: 0, target: 2 }),
    )
    expect(session.current.pending).toHaveLength(1)

    session = undo(session)
    expect(session.current).toEqual(before)
  })

  it('does not delete an unrelated action when stepping back past a skip', () => {
    // v1's prevStep() popped the events array unconditionally, so stepping
    // back past a role that recorded nothing destroyed someone else's action.
    let session = newSession(startNight(createGame(cast(['GUARD', 'INSPECT', 'KILLER']))))

    session = advance(session, (s) =>
      recordAction(s, { kind: 'target', roleId: 'GUARD', actor: 0, target: 2 }),
    )
    session = advance(session, (s) => recordAction(s, { kind: 'skip', roleId: 'INSPECT' }))
    session = undo(session)

    expect(session.current.pending).toEqual([
      { kind: 'target', roleId: 'GUARD', actor: 0, target: 2 },
    ])
  })

  it('is a no-op at the start of history', () => {
    const session = newSession(createGame(cast(['PLAIN'])))
    expect(canUndo(session)).toBe(false)
    expect(undo(session)).toEqual(session)
  })
})

describe('win conditions', () => {
  it('village wins when the last wolf dies', () => {
    let state = createGame(cast(['KILLER', 'PLAIN', 'INSPECT']))
    state = lynch(state, 0)
    expect(winner(state)).toBe('town')
  })

  it('wolves win once they equal the villagers', () => {
    let state = createGame(cast(['KILLER', 'PLAIN', 'INSPECT']))
    state = lynch(state, 1)
    expect(winner(state)).toBe('crew')
  })

  it('lovers win together as the last two alive', () => {
    let state = startNight(createGame(cast(['PAIR', 'KILLER', 'PLAIN', 'INSPECT'])))
    state = recordAction(state, { kind: 'pair', roleId: 'PAIR', first: 1, second: 2 })
    state = recordAction(state, { kind: 'skip', roleId: 'KILLER' })
    state = endNight(state)

    state = lynch(state, 0)
    state = lynch(state, 3)

    expect(state.players.filter((p) => p.alive).map((p) => p.id)).toEqual([1, 2])
    expect(winner(state)).toBe('lovers')
  })

  it('the town wins a wipe-out: the Gunman hanged with two left takes the last crew member with him', () => {
    let state = createGame(cast(['AVENGE', 'KILLER']))
    state = lynch(state, 0)
    expect(state.awaitingHunterShot).toBe(0)
    state = hunterShot(state, 1)
    expect(state.players.every((p) => !p.alive)).toBe(true)
    expect(winner(state)).toBe('town')
  })

  it('reports no winner while the game is live', () => {
    expect(winner(createGame(cast(['KILLER', 'PLAIN', 'INSPECT', 'GUARD'])))).toBeNull()
  })

  it('reports no winner before the first night, however the roster looks', () => {
    // Names only, or dealt nothing yet: no Family is not a town win, it is setup.
    expect(winner(createGame([]))).toBeNull()
    expect(winner(createGame(cast(['PLAIN', 'PLAIN', 'PLAIN', 'PLAIN'])))).toBeNull()
    expect(winner(createGame(cast(['KILLER', 'KILLER', 'PLAIN'])))).toBeNull()
  })
})

describe('the Cazador', () => {
  it('takes someone with him when lynched', () => {
    let state = createGame(cast(['AVENGE', 'KILLER', 'PLAIN', 'INSPECT']))
    state = lynch(state, 0)
    expect(state.awaitingHunterShot).toBe(0)

    state = hunterShot(state, 1)
    expect(state.players[1]!.alive).toBe(false)
    expect(state.awaitingHunterShot).toBeNull()
  })
})

describe('a full multi-night game', () => {
  it('runs start to finish with no SENSE and no strings', () => {
    // Deliberately gives two players the same name — the exact configuration
    // that silently corrupts v1.
    let state = createGame(
      cast(
        ['KILLER', 'ROGUE', 'INSPECT', 'GUARD', 'MEDIC', 'SILENCE', 'SURVIVE', 'PLAIN'],
        ['Ana', 'Beto', 'Ana', 'Dani', 'Eva', 'Fer', 'Gil', 'Hugo'],
      ),
    )

    // ---- Night 1: Pirómano acts (odd), albino does not ----
    state = startNight(state)
    expect(state.schedule).toEqual(['GUARD', 'INSPECT', 'SILENCE', 'KILLER', 'MEDIC'])

    state = recordAction(state, { kind: 'target', roleId: 'GUARD', actor: 3, target: 7 })
    state = recordAction(state, { kind: 'target', roleId: 'INSPECT', actor: 2, target: 0 })
    state = recordAction(state, { kind: 'target', roleId: 'SILENCE', actor: 5, target: 7 })
    state = recordAction(state, { kind: 'target', roleId: 'KILLER', actor: 0, target: 7 })
    state = recordAction(state, { kind: 'skip', roleId: 'MEDIC' })
    state = endNight(state)

    // Protected, so Hugo lives and the village is not told the wolves tried.
    expect(state.players[7]!.alive).toBe(true)
    expect(state.log.some((o) => o.type === 'attackBlocked' && !o.public)).toBe(true)
    expect(state.players[7]!.silencedOnDay).toBe(1)

    // ---- Day 1 ----
    state = lynch(state, 5)
    expect(state.players[5]!.alive).toBe(false)

    // ---- Night 2: albino acts (even), Pirómano is dead anyway ----
    state = startNight(state)
    expect(state.schedule).toEqual(['GUARD', 'INSPECT', 'KILLER', 'ROGUE', 'MEDIC'])

    state = recordAction(state, { kind: 'target', roleId: 'GUARD', actor: 3, target: 2 })
    state = recordAction(state, { kind: 'target', roleId: 'INSPECT', actor: 2, target: 1 })
    state = recordAction(state, { kind: 'target', roleId: 'KILLER', actor: 0, target: 6 })
    state = recordAction(state, { kind: 'target', roleId: 'ROGUE', actor: 1, target: 7 })
    state = recordAction(state, { kind: 'potion', roleId: 'MEDIC', target: 7, potion: 'heal' })
    state = endNight(state)

    // The Anciano survived his first attack; Hugo was healed by the witch.
    expect(state.players[6]!.alive).toBe(true)
    expect(state.players[6]!.wolfAttacksSurvivable).toBe(0)
    expect(state.players[7]!.alive).toBe(true)

    // The two players called "Ana" are still independent.
    const anas = state.players.filter((p) => p.name === 'Ana')
    expect(anas).toHaveLength(2)
    expect(anas.every((p) => p.alive)).toBe(true)

    // ---- Night 3: Pirómano gone, so no SILENCE step even though it is odd ----
    state = startNight(state)
    expect(state.schedule).toEqual(['GUARD', 'INSPECT', 'KILLER', 'MEDIC'])

    expect(winner(state)).toBeNull()
    expect(state.log.length).toBeGreaterThan(0)
  })
})

describe('the Orphan', () => {
  it('joins the crew when his mentor is killed', () => {
    let state = startNight(createGame(cast(['PROTEGE', 'KILLER', 'PLAIN', 'INSPECT', 'GUARD'])))
    state = recordAction(state, { kind: 'target', roleId: 'PROTEGE', actor: 0, target: 2 })
    state = recordAction(state, { kind: 'skip', roleId: 'GUARD' })
    state = recordAction(state, { kind: 'skip', roleId: 'INSPECT' })
    state = recordAction(state, { kind: 'target', roleId: 'KILLER', actor: 1, target: 2 })
    state = endNight(state)

    expect(state.players[2]!.alive).toBe(false)
    expect(state.players[0]!.roleId).toBe('KILLER')
  })

  it('stays with the town while his mentor lives', () => {
    let state = startNight(createGame(cast(['PROTEGE', 'KILLER', 'PLAIN', 'INSPECT'])))
    state = recordAction(state, { kind: 'target', roleId: 'PROTEGE', actor: 0, target: 2 })
    state = recordAction(state, { kind: 'skip', roleId: 'INSPECT' })
    state = recordAction(state, { kind: 'target', roleId: 'KILLER', actor: 1, target: 3 })
    state = endNight(state)

    expect(state.players[0]!.roleId).toBe('PROTEGE')
  })

  it('turns when his mentor is executed by the town', () => {
    let state = startNight(createGame(cast(['PROTEGE', 'KILLER', 'PLAIN', 'INSPECT'])))
    state = recordAction(state, { kind: 'target', roleId: 'PROTEGE', actor: 0, target: 2 })
    state = recordAction(state, { kind: 'skip', roleId: 'INSPECT' })
    state = recordAction(state, { kind: 'skip', roleId: 'KILLER' })
    state = endNight(state)
    state = lynch(state, 2)

    expect(state.players[0]!.roleId).toBe('KILLER')
  })
})

describe('the Martyr', () => {
  it('wins the moment the town executes him', () => {
    let state = createGame(cast(['MARTYR', 'KILLER', 'PLAIN', 'INSPECT', 'GUARD']))
    expect(winner(state)).toBeNull()

    state = lynch(state, 0)
    expect(winner(state)).toBe('martyr')
  })

  it('does not win if the crew kills him instead', () => {
    let state = startNight(createGame(cast(['MARTYR', 'KILLER', 'PLAIN', 'INSPECT', 'GUARD'])))
    state = recordAction(state, { kind: 'skip', roleId: 'GUARD' })
    state = recordAction(state, { kind: 'skip', roleId: 'INSPECT' })
    state = recordAction(state, { kind: 'target', roleId: 'KILLER', actor: 1, target: 0 })
    state = endNight(state)

    expect(state.players[0]!.alive).toBe(false)
    expect(winner(state)).not.toBe('martyr')
  })
})

describe('the Godfather', () => {
  it('converts on a confirm, which the night Confirm button records', () => {
    // That button used to share a selector with the reveal screen's "Are you
    // Ana?", whose handler ignores the night screen — so it did nothing and
    // the Godfather could never convert.
    let state = startNight(createGame(cast(['CONVERT', 'PLAIN', 'INSPECT', 'GUARD'])))
    state = recordAction(state, { kind: 'skip', roleId: 'GUARD' })
    state = recordAction(state, { kind: 'skip', roleId: 'INSPECT' })
    state = recordAction(state, { kind: 'target', roleId: 'KILLER', actor: 0, target: 1 })
    state = recordAction(state, { kind: 'confirm', roleId: 'CONVERT' })
    state = endNight(state)

    expect(state.players[1]!.alive).toBe(true)
    expect(state.players[1]!.roleId).toBe('KILLER')
    expect(state.infectionUsed).toBe(true)
  })
})

describe('the timeline', () => {
  const played = () => {
    let session = newSession(createGame(cast(['KILLER', 'INSPECT', 'GUARD', 'PLAIN'])))
    session = advance(session, startNight, { night: 1, kind: 'nightStart' })
    const guard: NightAction = { kind: 'target', roleId: 'GUARD', actor: 2, target: 3 }
    session = advance(session, (s) => recordAction(s, guard), {
      night: 1, kind: 'action', roleId: 'GUARD', action: guard,
    })
    const look: NightAction = { kind: 'skip', roleId: 'INSPECT' }
    session = advance(session, (s) => recordAction(s, look), {
      night: 1, kind: 'action', roleId: 'INSPECT', action: look,
    })
    const kill: NightAction = { kind: 'target', roleId: 'KILLER', actor: 0, target: 1 }
    session = advance(session, (s) => recordAction(s, kill), {
      night: 1, kind: 'action', roleId: 'KILLER', action: kill,
    })
    return advance(session, endNight, { night: 1, kind: 'nightEnd' })
  }

  it('records every step, including ones that announced nothing', () => {
    const session = played()
    // The skipped detective is in the timeline even though the town never
    // heard about it — that is exactly what a narrator checks back on.
    expect(session.timeline.map((e) => e.kind)).toEqual([
      'nightStart', 'action', 'action', 'action', 'nightEnd',
    ])
    expect(session.timeline.filter((e) => e.action?.kind === 'skip')).toHaveLength(1)
  })

  it('stays the same length as the snapshot history', () => {
    const session = played()
    expect(session.timeline.length).toBe(session.past.length)
  })

  it('rewinds the game to the chosen point', () => {
    const session = played()
    expect(session.current.players[1]!.alive).toBe(false)

    // Index 3 is the killers' choice; rewinding to it undoes the death.
    const rewound = revertTo(session, 3)
    expect(rewound.current.players[1]!.alive).toBe(true)
    expect(rewound.timeline).toHaveLength(3)
    expect(rewound.past).toHaveLength(3)
  })

  it('leaves the session alone for an index it does not have', () => {
    const session = played()
    expect(revertTo(session, 99)).toEqual(session)
  })

  it('undo and revert agree on the last step', () => {
    const session = played()
    expect(revertTo(session, session.past.length - 1)).toEqual(undo(session))
  })

  it('marks unlabelled changes as setup, so they stay out of the log', () => {
    let session = newSession(createGame(cast(['KILLER', 'PLAIN'])))
    session = advance(session, (s) => ({ ...s }))
    expect(session.timeline[0]!.kind).toBe('setup')
  })
})

describe('rearranging the table', () => {
  it('swaps two seats and renumbers so ids stay seating positions', () => {
    const state = createGame(cast(['KILLER', 'INSPECT', 'GUARD', 'PLAIN'], ['Ana', 'Beto', 'Caro', 'Dani']))
    const next = swapSeats(state, 0, 3)
    expect(next.players.map((p) => p.name)).toEqual(['Dani', 'Beto', 'Caro', 'Ana'])
    expect(next.players.map((p) => p.id)).toEqual([0, 1, 2, 3])
    // The role travels with the person, not the seat.
    expect(next.players[0]!.roleId).toBe('PLAIN')
  })

  it('nudges a seat round the circle, wrapping at the ends', () => {
    const state = createGame(cast(['KILLER', 'INSPECT', 'GUARD'], ['Ana', 'Beto', 'Caro']))
    expect(moveSeat(state, 0, 1).players.map((p) => p.name)).toEqual(['Beto', 'Ana', 'Caro'])
    expect(moveSeat(state, 0, -1).players.map((p) => p.name)).toEqual(['Beto', 'Caro', 'Ana'])
    expect(moveSeat(state, 2, 1).players.map((p) => p.name)).toEqual(['Caro', 'Ana', 'Beto'])
  })

  it('refuses once the game has started', () => {
    // Ids are referenced from the log and lovers by then; renumbering would
    // corrupt them. The Bloodhound's adjacency also depends on a fixed table.
    const state = startNight(createGame(cast(['KILLER', 'INSPECT', 'GUARD'])))
    expect(swapSeats(state, 0, 1)).toBe(state)
    expect(moveSeat(state, 0, 1)).toBe(state)
  })

  it('ignores a swap with itself or an unknown seat', () => {
    const state = createGame(cast(['KILLER', 'INSPECT']))
    expect(swapSeats(state, 0, 0)).toBe(state)
    expect(swapSeats(state, 0, 9)).toBe(state)
  })
})

describe('the Godfather can decline', () => {
  const played = (decision: NightAction) => {
    let state = startNight(createGame(cast(['CONVERT', 'PLAIN', 'INSPECT', 'GUARD'])))
    state = recordAction(state, { kind: 'skip', roleId: 'GUARD' })
    state = recordAction(state, { kind: 'skip', roleId: 'INSPECT' })
    state = recordAction(state, { kind: 'target', roleId: 'KILLER', actor: 0, target: 1 })
    state = recordAction(state, decision)
    return endNight(state)
  }

  it('lets the hit go ahead on a skip', () => {
    // The step used to offer only Confirm, so the narrator had no way to
    // record this — and every prompted night converted the victim.
    const state = played({ kind: 'skip', roleId: 'CONVERT' })
    expect(state.players[1]!.alive).toBe(false)
    expect(state.infectionUsed).toBe(false)
  })

  it('is not prompted again once the conversion is spent', () => {
    let state = played({ kind: 'confirm', roleId: 'CONVERT' })
    expect(state.infectionUsed).toBe(true)
    state = startNight(state)
    expect(state.schedule).not.toContain('CONVERT')
    expect(state.schedule).toContain('KILLER')
  })
})

describe('the Associate picks a side', () => {
  const firstNight = (newRole: RoleId) => {
    let state = startNight(quietGame(cast(['PICK_SIDE', 'KILLER', 'PLAIN', 'INSPECT'])))
    expect(state.schedule[0]).toBe('PICK_SIDE')
    state = recordAction(state, { kind: 'chooseRole', roleId: 'PICK_SIDE', newRole })
    state = recordAction(state, { kind: 'skip', roleId: 'INSPECT' })
    state = recordAction(state, { kind: 'skip', roleId: 'KILLER' })
    return endNight(state)
  }

  it('joins the Family and wakes with them from then on', () => {
    // A bare confirm was recorded before, which the resolver ignores — so the
    // Associate never actually chose anything.
    const state = firstNight('KILLER')
    expect(state.players[0]!.roleId).toBe('KILLER')
    expect(winner(state)).toBe('crew')
  })

  it('or stays with the town as a plain citizen', () => {
    const state = firstNight('PLAIN')
    expect(state.players[0]!.roleId).toBe('PLAIN')
    expect(winner(state)).toBeNull()
  })

  it('keeps the choice out of the morning report', () => {
    const state = firstNight('KILLER')
    expect(state.log.filter((o) => o.public)).toEqual([])
  })
})

describe('the day’s vote', () => {
  /** Four alive after a quiet first night, on day one. */
  const day = (): GameState => {
    let state = startNight(createGame(cast(['KILLER', 'PLAIN', 'INSPECT', 'GUARD'])))
    state = recordAction(state, { kind: 'target', roleId: 'GUARD', actor: 3, target: 3 })
    state = recordAction(state, { kind: 'skip', roleId: 'INSPECT' })
    state = recordAction(state, { kind: 'skip', roleId: 'KILLER' })
    return endNight(state)
  }

  it('records one vote per voter, the latest one', () => {
    let state = castVote(day(), 1, 0)
    state = castVote(state, 1, 2)
    expect(state.votes).toEqual([{ voter: 1, target: 2 }])
  })

  it('ignores votes that cannot be cast', () => {
    let state = day()
    state = castVote(state, 1, 1) // for oneself
    expect(state.votes).toEqual([])
    state = { ...state, players: state.players.map((p) => (p.id === 2 ? { ...p, alive: false } : p)) }
    expect(castVote(state, 2, 0).votes).toEqual([]) // from the dead
    expect(castVote(state, 1, 2).votes).toEqual([]) // for the dead
    state = { ...state, players: state.players.map((p) => (p.id === 3 ? { ...p, silencedOnDay: 1 } : p)) }
    expect(canVote(state, 3)).toBe(false)
    expect(castVote(state, 3, 0).votes).toEqual([]) // silenced today
  })

  it('counts, most votes first, with the Raven’s extra', () => {
    let state = day()
    state = castVote(state, 1, 0)
    state = castVote(state, 2, 0)
    state = castVote(state, 3, 1)
    state = { ...state, players: state.players.map((p) => (p.id === 2 ? { ...p, extraVotesOnDay: 1 } : p)) }
    expect(tally(state)).toEqual([
      { target: 0, votes: 2, voters: [1, 2] },
      { target: 1, votes: 1, voters: [3] },
      { target: 2, votes: 1, voters: [] },
    ])
    expect(leader(state)).toBe(0)
  })

  it('has no leader before a vote or on a tie', () => {
    let state = day()
    expect(leader(state)).toBeNull()
    state = castVote(state, 1, 0)
    state = castVote(state, 0, 1)
    expect(leader(state)).toBeNull()
    expect(withdrawVote(state, 0).votes).toEqual([{ voter: 1, target: 0 }])
    expect(withdrawVote(state, 3)).toBe(state)
  })

  it('goes into the log ahead of the execution, then clears', () => {
    let state = castVote(day(), 1, 0)
    state = castVote(state, 2, 0)
    state = lynch(state, 0)
    const tail = state.log.slice(-2)
    expect(tail[0]).toEqual({
      type: 'tally', night: 1, day: 1, public: true,
      votes: [{ voter: 1, target: 0 }, { voter: 2, target: 0 }],
    })
    expect(tail[1]).toMatchObject({ type: 'death', target: 0, cause: 'lynch' })
    expect(state.votes).toEqual([])
  })

  it('records nothing when the narrator just tapped the name', () => {
    const state = lynch(day(), 0)
    expect(state.log.filter((o) => o.type === 'tally')).toHaveLength(0)
  })

  it('is forgotten at nightfall', () => {
    const state = startNight(castVote(day(), 1, 0))
    expect(state.votes).toEqual([])
  })
})

describe('the citizens’ trades', () => {
  const seeded = (seed: number) => {
    let s = seed >>> 0
    return () => {
      s = (s * 1664525 + 1013904223) >>> 0
      return s / 2 ** 32
    }
  }

  it('gives every citizen a distinct trade and nobody else one', () => {
    const state = createGame(cast(['PLAIN', 'KILLER', 'PLAIN', 'INSPECT', 'PLAIN', 'PLAIN']), seeded(3))
    const trades = state.players.filter((p) => p.roleId === 'PLAIN').map((p) => p.trade)
    expect(trades.every((t) => t !== null && t >= 0 && t < TRADE_COUNT)).toBe(true)
    expect(new Set(trades).size).toBe(trades.length)
    expect(state.players.filter((p) => p.roleId !== 'PLAIN').every((p) => p.trade === null)).toBe(true)
  })

  it('deals the same trades and seed for the same randomness', () => {
    const a = createGame(cast(['PLAIN', 'PLAIN', 'KILLER']), seeded(9))
    const b = createGame(cast(['PLAIN', 'PLAIN', 'KILLER']), seeded(9))
    expect(a.players.map((p) => p.trade)).toEqual(b.players.map((p) => p.trade))
    expect(a.seed).toBe(b.seed)
    expect(createGame(cast(['PLAIN', 'PLAIN', 'KILLER']), seeded(10)).seed).not.toBe(a.seed)
  })

  it('keeps the trade when a citizen is converted', () => {
    let state = createGame(cast(['CONVERT', 'KILLER', 'PLAIN', 'INSPECT', 'PLAIN']), seeded(4))
    const trade = state.players[2]!.trade
    state = startNight(state)
    state = recordAction(state, { kind: 'target', roleId: 'INSPECT', actor: 3, target: 0 })
    state = recordAction(state, { kind: 'target', roleId: 'KILLER', actor: null, target: 2 })
    state = recordAction(state, { kind: 'confirm', roleId: 'CONVERT' })
    state = endNight(state)
    expect(state.players[2]!.roleId).toBe('KILLER')
    expect(state.players[2]!.trade).toBe(trade)
  })
})

describe('the dead the paper may name', () => {
  it('names a player the morning after the day they died, never sooner', () => {
    let state = quietGame(cast(['KILLER', 'PLAIN', 'INSPECT', 'GUARD', 'PLAIN', 'PLAIN']))
    state = startNight(state)
    state = recordAction(state, { kind: 'target', roleId: 'GUARD', actor: 3, target: 3 })
    state = recordAction(state, { kind: 'skip', roleId: 'INSPECT' })
    state = recordAction(state, { kind: 'target', roleId: 'KILLER', actor: 0, target: 1 })
    state = endNight(state)
    // Day 1: Beto died last night; the paper has not had its day yet.
    expect(revealedDead(state)).toEqual([])
    state = lynch(state, 2)
    expect(revealedDead(state)).toEqual([])
    // Night 2, then day 2: both are a day old.
    state = startNight(state)
    state = recordAction(state, { kind: 'target', roleId: 'GUARD', actor: 3, target: 4 })
    state = recordAction(state, { kind: 'skip', roleId: 'KILLER' })
    state = endNight(state)
    expect(revealedDead(state).map((p) => p.id).sort()).toEqual([1, 2])
    expect(revealedDead(state).every((p) => !p.alive)).toBe(true)
  })
})

describe('trades follow the roles', () => {
  it('strips a trade from anyone dealt a role and gives every citizen one', () => {
    const seeded = (seed: number) => {
      let s = seed >>> 0
      return () => {
        s = (s * 1664525 + 1013904223) >>> 0
        return s / 2 ** 32
      }
    }
    // A table starts as citizens, so everyone has a trade; then the roles land.
    let state = createGame(cast(['PLAIN', 'PLAIN', 'PLAIN', 'PLAIN', 'PLAIN']), seeded(2))
    expect(state.players.every((p) => p.trade !== null)).toBe(true)
    const kept = state.players[1]!.trade
    state = {
      ...state,
      players: state.players.map((p, i) => ({ ...p, roleId: i === 0 ? 'KILLER' : i === 2 ? 'INSPECT' : 'PLAIN' })),
    }
    state = assignTrades(state, seeded(3))
    expect(state.players[0]!.trade).toBeNull()
    expect(state.players[2]!.trade).toBeNull()
    expect(state.players[1]!.trade).toBe(kept)
    const trades = state.players.filter((p) => p.roleId === 'PLAIN').map((p) => p.trade)
    expect(trades.every((t) => t !== null)).toBe(true)
    expect(new Set(trades).size).toBe(trades.length)
  })
})
