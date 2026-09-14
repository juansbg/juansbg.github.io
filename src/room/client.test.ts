// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { normalizeRelay, parseFragment, PlayerLink, screenUrl, seatUrl, tvUrl, type Room } from './client'

const room: Room = { code: 'AB2CD', secret: 's', relay: 'https://relay.example' }

describe('the room address', () => {
  it('puts the code in the fragment, where no server sees it', () => {
    const url = tvUrl(room, 'https://juansbg.github.io/')
    expect(url).toBe('https://juansbg.github.io/tv.html#room=AB2CD&relay=https%3A%2F%2Frelay.example')
    expect(url).not.toContain('secret')
  })

  it('gives the players one address of their own, with the code and no secret', () => {
    const url = seatUrl(room, 'https://juansbg.github.io')
    expect(url).toBe('https://juansbg.github.io/seat.html#room=AB2CD&relay=https%3A%2F%2Frelay.example')
    expect(url).not.toContain('secret')
  })

  it('gives a TV a plain address to start a room from, no code, no page name', () => {
    expect(screenUrl('https://juansbg.github.io/')).toBe('https://juansbg.github.io/tv')
  })

  it('reads the fragment back, and rejects a code that is not one', () => {
    expect(parseFragment('#room=AB2CD&relay=https://relay.example/')).toEqual({
      room: 'AB2CD',
      relay: 'https://relay.example',
    })
    expect(parseFragment('#room=ab').room).toBeNull()
    expect(parseFragment('').room).toBeNull()
  })

  it('normalises a relay address', () => {
    expect(normalizeRelay(' https://relay.example// ')).toBe('https://relay.example')
  })
})

/**
 * A socket that opens and then goes silent, the way a peer that has stopped
 * answering does: nothing arrives, and a `close()` gets no close frame back,
 * so `onclose` is never fired. This is not a contrived case -- it is what a
 * frozen relay does, measured, and it is the one case the watchdog exists for.
 */
class SilentSocket {
  static readonly CONNECTING = 0
  static readonly OPEN = 1
  static readonly CLOSING = 2
  static readonly CLOSED = 3
  static made: SilentSocket[] = []

  readyState = SilentSocket.OPEN
  closed = false
  onopen: (() => void) | null = null
  onmessage: ((e: MessageEvent) => void) | null = null
  onclose: ((e: CloseEvent) => void) | null = null
  onerror: (() => void) | null = null

  constructor(readonly url: string) {
    SilentSocket.made.push(this)
    // The open lands on the next tick, as a real one does.
    queueMicrotask(() => this.onopen?.())
  }

  send(): void {
    // Into the void. A frozen peer's kernel still accepts bytes.
  }

  /** The close handshake waits for a reply that never comes. */
  close(): void {
    this.closed = true
    this.readyState = SilentSocket.CLOSING
  }
}

describe('a socket that goes silent', () => {
  const real = globalThis.WebSocket

  beforeEach(() => {
    SilentSocket.made = []
    vi.useFakeTimers()
    ;(globalThis as { WebSocket: unknown }).WebSocket = SilentSocket
  })
  afterEach(() => {
    vi.useRealTimers()
    ;(globalThis as { WebSocket: unknown }).WebSocket = real
  })

  it('reconnects without waiting for a close event that never comes', async () => {
    const seen: string[] = []
    new PlayerLink('https://relay.example', 'AB2CD', 'cid-1', {
      onStatus: (s) => seen.push(s),
      onHello: () => {},
      onSealed: () => {},
    })
    await vi.advanceTimersByTimeAsync(0)
    expect(seen).toEqual(['connecting', 'open'])
    expect(SilentSocket.made).toHaveLength(1)

    // Nothing ever arrives. Past the watchdog's threshold, the phone must
    // stop believing in this socket by itself: `close()` alone would leave it
    // in CLOSING for ever, and every reconnect hangs off `onclose`.
    await vi.advanceTimersByTimeAsync(20_000)
    expect(SilentSocket.made[0]?.closed).toBe(true)
    expect(seen).toContain('closed')

    // And it actually tries again, rather than sitting on a dead connection.
    await vi.advanceTimersByTimeAsync(2_000)
    expect(SilentSocket.made.length).toBeGreaterThan(1)
    expect(seen.filter((s) => s === 'connecting')).toHaveLength(2)
  })

  it('never hears from the abandoned socket again, whatever it does later', async () => {
    const seen: string[] = []
    new PlayerLink('https://relay.example', 'AB2CD', 'cid-1', {
      onStatus: (s) => seen.push(s),
      onHello: () => {},
      onSealed: () => {},
    })
    await vi.advanceTimersByTimeAsync(20_000)
    const dead = SilentSocket.made[0]
    const after = seen.length
    // A close frame arriving minutes late must not reopen a question the
    // phone has already answered, nor cancel the reconnect under way.
    dead?.onclose?.(new CloseEvent('close', { code: 1006 }))
    expect(seen).toHaveLength(after)
  })
})
