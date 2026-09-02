// @vitest-environment jsdom
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'

// Neither Node 26's experimental `localStorage` global (undefined without
// --localstorage-file) nor this jsdom environment provides a usable Storage,
// so the store — which reads the bare global exactly as it does in a browser —
// gets a small in-memory one. Behaviourally identical for what the store
// needs, and it cannot vary between machines.
beforeAll(() => {
  const data = new Map<string, string>()
  const shim: Storage = {
    get length() {
      return data.size
    },
    clear: () => data.clear(),
    getItem: (key) => data.get(key) ?? null,
    key: (index) => [...data.keys()][index] ?? null,
    removeItem: (key) => {
      data.delete(key)
    },
    setItem: (key, value) => {
      data.set(key, String(value))
    },
  }
  Object.defineProperty(globalThis, 'localStorage', {
    value: shim,
    configurable: true,
    writable: true,
  })
})
import {
  HISTORY_LIMIT,
  clear,
  clearRoster,
  load,
  loadRoster,
  save,
  saveRoster,
  type AppState,
} from './store'
import {
  advance,
  createGame,
  newSession,
  recordAction,
  startNight,
  type PlayerSetup,
} from '../engine/state'
import { STATE_VERSION } from '../engine/types'
import type { RoleId } from '../engine/roles'

const cast = (roles: RoleId[]): PlayerSetup[] => roles.map((roleId, i) => ({ name: `P${i}`, roleId }))

const appState = (session: AppState['session']): AppState => ({
  session,
  locale: 'en',
  screen: 'night',
  revealIndex: 0,
  revealMode: 'onboarding',
  revealReturnTo: 'night',
  layout: 'circle',
})

/** A session with `moves` recorded steps, each with a timeline entry. */
const played = (moves: number) => {
  let session = newSession(createGame(cast(['KILLER', 'GUARD', 'INSPECT', 'PLAIN', 'PLAIN'])))
  session = advance(session, startNight, { night: 1, kind: 'nightStart' })
  for (let i = 0; i < moves; i++) {
    const action = { kind: 'skip' as const, roleId: 'GUARD' as const }
    session = advance(session, (s) => recordAction(s, action), {
      night: 1, kind: 'action', roleId: 'GUARD', action,
    })
  }
  return session
}

beforeEach(() => {
  localStorage.clear()
})

describe('autosave keeps the history', () => {
  it('round-trips the timeline and the snapshots', () => {
    // The log and every "rewind to here" button read from these. Without
    // them a reload left the log empty, which defeats having one.
    const session = played(3)
    save(appState(session))

    const loaded = load()
    expect(loaded).not.toBeNull()
    expect(loaded!.session.timeline).toEqual(session.timeline)
    expect(loaded!.session.past).toEqual(session.past)
    expect(loaded!.session.current).toEqual(session.current)
  })

  it('keeps only the most recent moves past the cap', () => {
    const session = played(HISTORY_LIMIT + 10)
    save(appState(session))

    const loaded = load()!
    expect(loaded.session.past).toHaveLength(HISTORY_LIMIT)
    expect(loaded.session.timeline).toHaveLength(HISTORY_LIMIT)
    // The newest move is the one kept, not the oldest.
    expect(loaded.session.timeline.at(-1)).toEqual(session.timeline.at(-1))
  })

  it('still loads a save written before history was persisted', () => {
    const game = createGame(cast(['KILLER', 'PLAIN']))
    localStorage.setItem(
      'omerta:v1',
      JSON.stringify({ version: STATE_VERSION, game, locale: 'es', screen: 'day', revealIndex: 0 }),
    )

    const loaded = load()!
    expect(loaded.session.current).toEqual(game)
    expect(loaded.session.past).toEqual([])
    expect(loaded.session.timeline).toEqual([])
  })

  it('treats a mismatched history as none, never as a half one', () => {
    // past and timeline are parallel arrays; if they disagree the save is
    // corrupt, and rewinding through it would be worse than not rewinding.
    const session = played(2)
    localStorage.setItem(
      'omerta:v1',
      JSON.stringify({
        version: STATE_VERSION,
        game: session.current,
        locale: 'en',
        screen: 'night',
        revealIndex: 0,
        past: session.past,
        timeline: session.timeline.slice(1),
      }),
    )

    const loaded = load()!
    expect(loaded.session.past).toEqual([])
    expect(loaded.session.timeline).toEqual([])
  })

  it('is gone after clear()', () => {
    save(appState(played(1)))
    clear()
    expect(load()).toBeNull()
  })
})

describe('the remembered roster', () => {
  it('survives clearing the game', () => {
    // Forget the game, keep the people.
    saveRoster(['Ana', 'Beto', 'Caro', 'Dani'])
    save(appState(played(1)))
    clear()
    expect(loadRoster()).toEqual(['Ana', 'Beto', 'Caro', 'Dani'])
  })

  it('is empty until someone types names', () => {
    expect(loadRoster()).toEqual([])
  })

  it('can be wiped on purpose', () => {
    saveRoster(['Ana'])
    clearRoster()
    expect(loadRoster()).toEqual([])
  })

  it('ignores junk in storage rather than crashing', () => {
    localStorage.setItem('omerta:roster', '{"not":"a list"}')
    expect(loadRoster()).toEqual([])
    localStorage.setItem('omerta:roster', JSON.stringify(['Ana', 42, null, 'Beto']))
    expect(loadRoster()).toEqual(['Ana', 'Beto'])
  })
})

describe('older saves', () => {
  it('migrates a version-1 game, giving the Santera both vials', () => {
    // Version 1 did not track the vials; both unspent is the only reading.
    const game = createGame(cast(['KILLER', 'PLAIN', 'MEDIC']))
    const v1 = JSON.parse(JSON.stringify(game)) as Record<string, unknown>
    delete v1['healUsed']
    delete v1['poisonUsed']
    localStorage.setItem(
      'omerta:v1',
      JSON.stringify({
        version: 1, game: v1, locale: 'en', screen: 'night', revealIndex: 0,
        past: [v1], timeline: [{ night: 0, kind: 'setup' }],
      }),
    )

    const loaded = load()!
    expect(loaded.session.current.healUsed).toBe(false)
    expect(loaded.session.current.poisonUsed).toBe(false)
    expect(loaded.session.past[0]!.healUsed).toBe(false)
  })

  it('drops anything older than that', () => {
    const game = createGame(cast(['KILLER', 'PLAIN']))
    localStorage.setItem(
      'omerta:v1',
      JSON.stringify({ version: 0, game, locale: 'en', screen: 'night', revealIndex: 0 }),
    )
    expect(load()).toBeNull()
  })
})
