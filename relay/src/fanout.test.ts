import { describe, expect, it } from 'vitest'
import { say, tell, type Sendable } from './fanout'

/** A socket that is already gone: `send` throws, the way the runtime's does. */
const dead = (log: string[] = []): Sendable & { closed: boolean } => ({
  closed: false,
  send() {
    throw new TypeError("Can't call WebSocket send() after close().")
  },
  close() {
    this.closed = true
    log.push('closed')
  },
})

const live = (heard: string[]): Sendable => ({
  send: (text) => void heard.push(text),
  close: () => {},
})

describe('saying something to a socket that may be gone', () => {
  it('does not throw when the socket is already closed', () => {
    expect(() => say(dead(), 'hello')).not.toThrow()
    expect(say(dead(), 'hello')).toBe(false)
  })

  it('closes a socket that refuses, so it is not handed back next time', () => {
    const ws = dead()
    say(ws, 'hello')
    expect(ws.closed).toBe(true)
  })

  it('survives a socket whose close throws too', () => {
    const awkward: Sendable = {
      send() {
        throw new Error('gone')
      },
      close() {
        throw new Error('also gone')
      },
    }
    expect(() => say(awkward, 'hello')).not.toThrow()
  })
})

describe('telling the whole room', () => {
  it('reaches the last socket when the FIRST one is already closed', () => {
    // This is the failure the bare `for` loop actually produced: the throw
    // stopped the loop where it stood, so everyone *after* the dead socket
    // heard nothing. A test that closes the LAST socket passes on the broken
    // code, which is why this one closes the first.
    const heard: string[] = []
    const count = tell([dead(), live(heard), live(heard)], 'the narrator is here')
    expect(heard).toEqual(['the narrator is here', 'the narrator is here'])
    expect(count).toBe(2)
  })

  it('reaches both sides of a dead socket in the middle', () => {
    const heard: string[] = []
    expect(tell([live(heard), dead(), live(heard)], 'x')).toBe(2)
    expect(heard).toHaveLength(2)
  })

  it('says nobody heard it when every socket is gone', () => {
    // What `tellNarrator` reads to decide whether to hold the message for the
    // next narrator: a list of sockets is not the same as a listener.
    expect(tell([dead(), dead()], 'a vote')).toBe(0)
  })

  it('counts an empty room as nobody, not as an error', () => {
    expect(tell([], 'x')).toBe(0)
  })
})
