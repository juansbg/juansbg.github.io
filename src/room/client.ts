import type { TvProjection } from './projections'

/**
 * The narrator's side of the relay (docs/BIG-SCREEN.md §5, §7).
 *
 * A room is a code the screens join with and a secret only the narrator's
 * phone holds; the relay stores the secret's hash and nothing else. This
 * module opens rooms, keeps one WebSocket up with reconnects, and publishes
 * projections. What goes out is decided in `projections.ts`; this file only
 * carries it. Nothing here touches `GameState`.
 */

/** Where the relay lives, unless the narrator has set another in ⋯. */
export const DEFAULT_RELAY: string = (import.meta.env.VITE_RELAY_URL as string | undefined) ?? ''

const RELAY_KEY = 'omerta:relay'
const ROOM_KEY = 'omerta:room'

export const loadRelay = (): string => {
  try {
    return localStorage.getItem(RELAY_KEY) ?? DEFAULT_RELAY
  } catch {
    return DEFAULT_RELAY
  }
}

export const saveRelay = (url: string): void => {
  try {
    if (url.trim() === '' || url.trim() === DEFAULT_RELAY) localStorage.removeItem(RELAY_KEY)
    else localStorage.setItem(RELAY_KEY, url.trim())
  } catch {
    // Private mode: the address holds until the page closes.
  }
}

export interface Room {
  code: string
  secret: string
  /** The relay this room was opened on, http(s) origin, no trailing slash. */
  relay: string
}

/** A room survives a reload: the phone reconnects as the same narrator. */
export const loadRoom = (): Room | null => {
  try {
    const raw = localStorage.getItem(ROOM_KEY)
    if (raw === null) return null
    const parsed = JSON.parse(raw) as Partial<Room>
    if (typeof parsed.code !== 'string' || typeof parsed.secret !== 'string' || typeof parsed.relay !== 'string') {
      return null
    }
    return { code: parsed.code, secret: parsed.secret, relay: parsed.relay }
  } catch {
    return null
  }
}

export const saveRoom = (room: Room | null): void => {
  try {
    if (room === null) localStorage.removeItem(ROOM_KEY)
    else localStorage.setItem(ROOM_KEY, JSON.stringify(room))
  } catch {
    // See saveRelay.
  }
}

export const sha256 = async (text: string): Promise<string> => {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('')
}

const randomSecret = (): string => {
  const bytes = crypto.getRandomValues(new Uint8Array(24))
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
}

export const normalizeRelay = (url: string): string => url.trim().replace(/\/+$/, '')

/** Opens a room on the relay. Throws if the relay is unreachable or refuses. */
export const openRoom = async (relay: string): Promise<Room> => {
  const base = normalizeRelay(relay)
  const secret = randomSecret()
  const response = await fetch(`${base}/rooms`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ secretHash: await sha256(secret) }),
  })
  if (!response.ok) throw new Error(`relay ${response.status}`)
  const body = (await response.json()) as { code?: unknown }
  if (typeof body.code !== 'string') throw new Error('relay: no code')
  return { code: body.code, secret, relay: base }
}

/**
 * The address a TV opens. The room code travels in the fragment, which never
 * reaches a server; the relay is named only when it is not the built-in one.
 */
export const tvUrl = (room: Room, site: string): string => {
  const params = new URLSearchParams({ room: room.code })
  if (room.relay !== normalizeRelay(DEFAULT_RELAY)) params.set('relay', room.relay)
  return `${site.replace(/\/+$/, '')}/tv.html#${params.toString()}`
}

/** What a screen finds in its fragment. */
export const parseFragment = (hash: string): { room: string | null; relay: string } => {
  const params = new URLSearchParams(hash.replace(/^#/, ''))
  const room = params.get('room')
  return {
    room: room !== null && /^[A-Z0-9]{5}$/.test(room) ? room : null,
    relay: normalizeRelay(params.get('relay') ?? DEFAULT_RELAY),
  }
}

export type LinkStatus = 'connecting' | 'open' | 'closed'

/** What the relay sends the narrator. */
export type FromRelay =
  | { kind: 'present'; seats: number[]; tvs: number }
  | { kind: 'tvs'; count: number }
  | { kind: 'joined'; seat: number }
  | { kind: 'left'; seat: number }
  | { kind: 'vote'; seat: number; target: number | null }

export interface LinkHandlers {
  onStatus?: (status: LinkStatus) => void
  onMessage?: (message: FromRelay) => void
}

const wsUrl = (relay: string): string => relay.replace(/^http/, 'ws')

/**
 * One socket, kept up. Reconnects with backoff, pings so the relay's idle
 * timers stay quiet, and coalesces publishes to one per frame: the app
 * repaints on every tap and the TV only needs the last state.
 */
export class NarratorLink {
  private ws: WebSocket | null = null
  private closed = false
  private attempt = 0
  private pending: TvProjection | null = null
  private frame: number | null = null
  private lastSent: string | null = null
  private ping: number | null = null

  constructor(
    private readonly room: Room,
    private readonly handlers: LinkHandlers = {},
  ) {
    this.connect()
  }

  publish(projection: TvProjection): void {
    this.pending = projection
    if (this.frame !== null) return
    this.frame = requestAnimationFrame(() => {
      this.frame = null
      this.flush()
    })
  }

  close(): void {
    this.closed = true
    this.stopPing()
    this.ws?.close(1000, 'room closed')
    this.ws = null
    this.handlers.onStatus?.('closed')
  }

  private flush(): void {
    if (this.pending === null || this.ws === null || this.ws.readyState !== WebSocket.OPEN) return
    const text = JSON.stringify(this.pending)
    this.pending = null
    if (text === this.lastSent) return
    this.lastSent = text
    this.ws.send(text)
  }

  private connect(): void {
    if (this.closed) return
    this.handlers.onStatus?.('connecting')
    const { code, secret, relay } = this.room
    const ws = new WebSocket(
      `${wsUrl(relay)}/rooms/${code}/ws?as=narrator&secret=${encodeURIComponent(secret)}`,
    )
    this.ws = ws
    ws.onopen = () => {
      this.attempt = 0
      this.handlers.onStatus?.('open')
      // A fresh socket has no idea what the room last saw: send the latest.
      this.lastSent = null
      this.flush()
      this.startPing()
    }
    ws.onmessage = (event) => {
      if (typeof event.data !== 'string' || event.data === 'pong') return
      try {
        this.handlers.onMessage?.(JSON.parse(event.data) as FromRelay)
      } catch {
        // Not ours.
      }
    }
    ws.onclose = (event) => {
      this.stopPing()
      if (this.ws === ws) this.ws = null
      // Replaced by a newer narrator socket, or the room is gone: stop.
      if (event.code === 4000 || event.code === 4001 || this.closed) {
        this.closed = true
        this.handlers.onStatus?.('closed')
        return
      }
      this.retry()
    }
    ws.onerror = () => ws.close()
  }

  private retry(): void {
    this.attempt += 1
    const delay = Math.min(30_000, 500 * 2 ** Math.min(this.attempt, 6))
    setTimeout(() => this.connect(), delay)
  }

  private startPing(): void {
    this.stopPing()
    this.ping = window.setInterval(() => this.ws?.send('ping'), 25_000)
  }

  private stopPing(): void {
    if (this.ping !== null) window.clearInterval(this.ping)
    this.ping = null
  }
}

/**
 * A screen's side: connects as the TV, hands every projection to `onProjection`,
 * and keeps trying while the page is open.
 */
export class ScreenLink {
  private attempt = 0
  private ping: number | null = null

  constructor(
    private readonly relay: string,
    private readonly code: string,
    private readonly onProjection: (projection: TvProjection) => void,
    private readonly onStatus: (status: LinkStatus) => void = () => {},
  ) {
    this.connect()
  }

  private connect(): void {
    this.onStatus('connecting')
    const ws = new WebSocket(`${wsUrl(this.relay)}/rooms/${this.code}/ws?as=tv`)
    ws.onopen = () => {
      this.attempt = 0
      this.onStatus('open')
      this.ping = window.setInterval(() => ws.send('ping'), 25_000)
    }
    ws.onmessage = (event) => {
      if (typeof event.data !== 'string' || event.data === 'pong') return
      try {
        const parsed = JSON.parse(event.data) as { kind?: unknown }
        if (parsed.kind === 'tv') this.onProjection(parsed as TvProjection)
      } catch {
        // Not ours.
      }
    }
    ws.onclose = () => {
      if (this.ping !== null) window.clearInterval(this.ping)
      this.ping = null
      this.onStatus('closed')
      this.attempt += 1
      setTimeout(() => this.connect(), Math.min(30_000, 500 * 2 ** Math.min(this.attempt, 6)))
    }
    ws.onerror = () => ws.close()
  }
}
