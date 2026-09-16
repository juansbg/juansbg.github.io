import { isLocale, type Locale } from '../i18n'
import type { TvProjection } from './projections'
import type { SeatAction } from './actions'

/**
 * The narrator's side of the relay (docs/BIG-SCREEN.md §5, §7).
 *
 * A room is a code the screens join with and a secret only the narrator's
 * phone holds; the relay stores the secret's hash and nothing else. A screen
 * asks for the room and shows the code; the narrator claims it by that code
 * with the room key (docs/BIG-SCREEN.md §11). This module opens, requests
 * and claims rooms, keeps one WebSocket up with reconnects, and publishes
 * projections. What goes out is decided in `projections.ts`; this file only
 * carries it. Nothing here touches `GameState`.
 */

/** Where the relay lives, unless the narrator has set another in ⋯. */
export const DEFAULT_RELAY: string = (import.meta.env.VITE_RELAY_URL as string | undefined) ?? ''

const RELAY_KEY = 'omerta:relay'
const ROOM_KEY = 'omerta:room'
const ROOM_PASS_KEY = 'omerta:roomKey'

/** The key the relay asks for before it makes a phone a room's narrator. Kept on the phone. */
export const loadRoomKey = (): string => {
  try {
    return localStorage.getItem(ROOM_PASS_KEY) ?? ''
  } catch {
    return ''
  }
}

export const saveRoomKey = (key: string): void => {
  try {
    if (key.trim() === '') localStorage.removeItem(ROOM_PASS_KEY)
    else localStorage.setItem(ROOM_PASS_KEY, key.trim())
  } catch {
    // Private mode: the key holds until the page closes.
  }
}

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

export class RelayRefused extends Error {
  constructor(readonly status: number) {
    super(`relay ${status}`)
  }
}

const post = async (url: string, body: unknown, key = ''): Promise<string> => {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (key !== '') headers['X-Room-Key'] = key
  const response = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body) })
  if (!response.ok) throw new RelayRefused(response.status)
  const answer = (await response.json()) as { code?: unknown }
  if (typeof answer.code !== 'string') throw new Error('relay: no code')
  return answer.code
}

/**
 * Opens a room from this phone, claimed at once: the no-TV evening. Throws
 * RelayRefused on a refusal (403: the key), Error when unreachable.
 */
export const openRoom = async (relay: string, key = ''): Promise<Room> => {
  const base = normalizeRelay(relay)
  const secret = randomSecret()
  const code = await post(`${base}/rooms`, { secretHash: await sha256(secret) }, key)
  return { code, secret, relay: base }
}

/** A room and where it is, as a screen knows it: no secret, since a screen is nobody's. */
export interface OpenRoom {
  code: string
  relay: string
}

/** A screen asks for a room to show. No key: anyone may, and the room waits fifteen minutes for a narrator. */
export const requestRoom = async (relay: string): Promise<OpenRoom> => {
  const base = normalizeRelay(relay)
  return { code: await post(`${base}/rooms`, {}), relay: base }
}

/**
 * The narrator claims the room a screen shows, by its code, with the key.
 * Throws RelayRefused: 404 is no such room, 403 the key.
 */
export const claimRoom = async (relay: string, code: string, key: string): Promise<Room> => {
  const base = normalizeRelay(relay)
  const secret = randomSecret()
  await post(`${base}/rooms/${code}/claim`, { secretHash: await sha256(secret) }, key)
  return { code, secret, relay: base }
}

/**
 * Asks the relay what is on a room before taking it over: whether it exists,
 * and whether a game is already being played on it. A claim always wins, and
 * ends that game for everyone in the room, so the phone asks first.
 */
export const lookAtRoom = async (relay: string, code: string, key: string): Promise<{ playing: boolean }> => {
  const base = normalizeRelay(relay)
  const response = await fetch(`${base}/rooms/${code}/claim`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Room-Key': key },
    body: JSON.stringify({ secretHash: await sha256(randomSecret()), look: true }),
  })
  if (!response.ok) throw new RelayRefused(response.status)
  const answer = (await response.json()) as { playing?: unknown }
  return { playing: answer.playing === true }
}

/** The address a TV opens to start a room: the site's `/tv`, no code. */
export const screenUrl = (site: string): string => `${site.replace(/\/+$/, '')}/tv`

/**
 * Somebody walked from the app to the big screen on this device.
 *
 * `tv.html` is a dead end on purpose: a television has no use for a link back
 * into a phone app, and a room looking at one cannot act on it. But the app
 * offers that road ("This device is the big screen"), and an installed PWA
 * has no Back — so whoever came through needs a way home, and nobody else
 * should see one. `sessionStorage` is exactly that lifetime: it survives the
 * same-tab navigation and dies with the tab.
 *
 * It carries the language rather than a flag, because the device that came
 * through is a phone whose owner has already chosen one, and the page it
 * lands on has no projection yet to learn it from — so an evening being run
 * in Spanish walked into an English screen, its way home included.
 */
const FROM_APP = 'omerta:fromApp'
export const markFromApp = (locale: Locale): void => {
  try {
    sessionStorage.setItem(FROM_APP, locale)
  } catch {
    // Storage refused (a locked-down browser): the door is one-way, as before.
  }
}
export const cameFromApp = (): Locale | null => {
  try {
    const mark = sessionStorage.getItem(FROM_APP)
    return mark !== null && isLocale(mark) ? mark : null
  } catch {
    return null
  }
}

/**
 * The address a second screen opens to join a room that exists. The code
 * travels in the fragment, which never reaches a server; the relay is named
 * only when it is not the built-in one.
 */
export const tvUrl = (room: OpenRoom, site: string): string => {
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

/** `gone` is final: the relay closed the socket with 4004, no such room, and the link stops trying. */
export type LinkStatus = 'connecting' | 'open' | 'closed' | 'gone' | 'ended' | 'replaced'

/** The relay's close code for a room that does not exist or has expired (docs/BIG-SCREEN.md §11). */
export const NO_SUCH_ROOM = 4004
/** The narrator closed the room on purpose (docs/BIG-SCREEN.md §12.2). */
export const ROOM_ENDED = 4001
/** A second phone claimed the room with the key; this socket is not coming back. */
export const REPLACED = 4000

/** What the relay sends the narrator. `cid` is a player's connection, chosen by their page. */
export type FromRelay =
  /** Who is on the room as the socket opens: every phone's last join, so none is lost. */
  | { kind: 'present'; players: { cid: string; name: string; pub: string }[]; tvs: number }
  | { kind: 'tvs'; count: number }
  /** A player asked for a seat by name, with the public half of their key. */
  | { kind: 'join'; cid: string; name: string; pub: string }
  | { kind: 'left'; cid: string }
  | { kind: 'vote'; cid: string; target: number | null }
  /** The Family's mark moved from a phone; a proposal, not a record. */
  | { kind: 'mark'; cid: string; target: number | null }
  /** A night step taken from a phone, shape-checked by the relay, judged by the narrator. */
  | { kind: 'act'; cid: string; action: SeatAction }

/** What the narrator sends besides the TV projection. */
export type ToRelay =
  | { kind: 'hello'; pub: string }
  | { kind: 'player'; cid: string; payload: string }

/** The address a player opens: one for the whole table, the code in the fragment. */
export const seatUrl = (room: OpenRoom, site: string): string => {
  const params = new URLSearchParams({ room: room.code })
  if (room.relay !== normalizeRelay(DEFAULT_RELAY)) params.set('relay', room.relay)
  return `${site.replace(/\/+$/, '')}/seat.html#${params.toString()}`
}

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
/** How long paints are collected before one message goes out. */
const FRAME_MS = 16

/**
 * Give up on a socket the watchdog has stopped believing in.
 *
 * `close()` is not a disconnection: it opens a close handshake and waits for
 * the peer's own close frame. A peer that has gone silent -- which is the
 * only case a watchdog exists for -- never sends one, and the kernel holds
 * the TCP connection open, so the socket sits in CLOSING and `onclose` never
 * fires. Measured against a frozen relay: every watchdog tripped to the
 * second (the phone's at 15s, the screen's and the narrator's at 40s), every
 * socket was still CLOSING a minute later, and because the reconnect and
 * "Reconnecting..." both hang off `onclose`, all three screens stayed
 * byte-identical to before the cut. The watchdog was closing a door nobody
 * heard shut.
 *
 * So the trip has to BE the disconnection: take the handlers off first, then
 * run whatever `onclose` would have run. The `close()` here is only tidying
 * up a socket nobody is listening to any more, and may take as long as it
 * likes about it.
 */
/**
 * How long an attempt may sit in CONNECTING before it is given up on.
 *
 * The same silence, one readyState earlier. A peer whose kernel is still up
 * completes the TCP handshake and then never answers the upgrade, so the new
 * socket neither opens nor errors -- and since every retry hangs off the
 * close event, the first reconnect after a drop was also the last. The room
 * said "Reconnecting..." honestly and then stayed that way for the rest of
 * the evening, even once the relay came back. Long enough not to punish a
 * slow handshake on a bad connection; short enough that a television left on
 * a shelf recovers by itself.
 */
const OPENING_MS = 20_000

function abandon(ws: WebSocket): void {
  ws.onopen = null
  ws.onmessage = null
  ws.onclose = null
  ws.onerror = null
  try {
    ws.close()
  } catch {
    // Going already. The handlers are off either way, which is the point.
  }
}

export class NarratorLink {
  /** The last time anything arrived on this socket, pings included. */
  private lastSeen = 0
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

  /**
   * One message per frame at most: paints within the same beat collapse
   * into the last. A timer rather than requestAnimationFrame, which a
   * hidden page never fires: the narrator's phone must keep the room
   * current from a pocket, a switched app or a second screen's tab.
   */
  publish(projection: TvProjection): void {
    this.pending = projection
    if (this.frame !== null) return
    this.frame = window.setTimeout(() => {
      this.frame = null
      this.flush()
    }, FRAME_MS)
  }

  /** A message straight through: the hello, a player's sealed card. Dropped while the socket is down. */
  send(message: ToRelay): boolean {
    if (this.ws === null || this.ws.readyState !== WebSocket.OPEN) return false
    this.ws.send(JSON.stringify(message))
    return true
  }

  /**
   * Close the room itself, not just this socket: the relay drops it and tells
   * every screen and phone why (docs/BIG-SCREEN.md §12.2). "Close the room" is
   * a decision and must not look like a flat battery.
   */
  end(): void {
    this.ws?.send(JSON.stringify({ kind: 'end' }))
    this.close()
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
    const opening = window.setTimeout(() => {
      if (ws.readyState !== WebSocket.CONNECTING) return
      if (this.ws === ws) this.ws = null
      abandon(ws)
      this.retry()
    }, OPENING_MS)
    ws.onopen = () => {
      window.clearTimeout(opening)
      this.attempt = 0
      this.handlers.onStatus?.('open')
      // A fresh socket has no idea what the room last saw: send the latest.
      this.lastSent = null
      this.lastSeen = Date.now()
      this.flush()
      this.startPing()
    }
    ws.onmessage = (event) => {
      this.lastSeen = Date.now()
      if (typeof event.data !== 'string' || event.data === 'pong') return
      try {
        this.handlers.onMessage?.(JSON.parse(event.data) as FromRelay)
      } catch {
        // Not ours.
      }
    }
    ws.onclose = (event) => {
      window.clearTimeout(opening)
      this.stopPing()
      if (this.ws === ws) this.ws = null
      // Another phone claimed the room with the key. This one is not coming
      // back, and has to say so rather than showing a reconnection that will
      // never happen.
      if (event.code === REPLACED) {
        this.closed = true
        this.handlers.onStatus?.('replaced')
        return
      }
      // The room is gone (4001 closed, 4004 no such room): stop.
      if (event.code === ROOM_ENDED || event.code === NO_SUCH_ROOM || this.closed) {
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
    // The narrator's own socket gets the same watchdog as a player's: a wifi
    // drop does not always close one, and a narrator publishing into a dead
    // connection is the worst version of this — the room sits on the last
    // thing it heard while the game goes on in the narrator's hand.
    this.ping = window.setInterval(() => {
      if (Date.now() - this.lastSeen > 40_000) {
        const dead = this.ws
        this.stopPing()
        if (dead !== null) {
          this.ws = null
          abandon(dead)
        }
        this.retry()
        return
      }
      try {
        this.ws?.send('ping')
      } catch {
        // The close this provokes is answer enough.
      }
    }, 12_000)
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
  /** The last time anything arrived, pings included; see PlayerLink. */
  private lastSeen = 0

  constructor(
    private readonly relay: string,
    private readonly code: string,
    private readonly onProjection: (projection: TvProjection) => void,
    private readonly onStatus: (status: LinkStatus) => void = () => {},
    /** Whether a narrator is running the game right now; the relay says so. */
    private readonly onNarrator: (here: boolean) => void = () => {},
    /**
     * Who has taken a seat, by name, whether or not a narrator is on the room.
     * Before a claim there is no projection, so this is the only way a screen
     * knows anybody has arrived — and somebody who scans first and waits was
     * invisible on the one screen the whole room is watching.
     */
    private readonly onGuests: (names: string[]) => void = () => {},
  ) {
    this.connect()
  }

  /**
   * How long since anything at all arrived on this socket, pings included.
   *
   * The relay auto-responds `pong` to a ping, and it does so even while the
   * Durable Object is hibernating, so this is a real liveness signal and not
   * a measure of how busy the narrator is. A screen needs it because the
   * watchdog deliberately waits forty seconds before giving up on a socket —
   * right for deciding to reconnect, far too long for a room to sit looking
   * at a table that stopped being true. Zero before the first message.
   */
  silentFor(): number {
    return this.lastSeen === 0 ? 0 : Date.now() - this.lastSeen
  }

  private connect(): void {
    this.onStatus('connecting')
    const ws = new WebSocket(`${wsUrl(this.relay)}/rooms/${this.code}/ws?as=tv`)
    const opening = window.setTimeout(() => {
      if (ws.readyState !== WebSocket.CONNECTING) return
      abandon(ws)
      this.dropped()
    }, OPENING_MS)
    ws.onopen = () => {
      window.clearTimeout(opening)
      this.attempt = 0
      this.lastSeen = Date.now()
      this.onStatus('open')
      // A wifi drop does not always close a socket: the screen would sit on a
      // dead connection looking merely quiet, which on a TV is indistinguishable
      // from a narrator who has not tapped anything for a minute. A socket that
      // has heard nothing back closes itself, and the reconnect takes over.
      this.ping = window.setInterval(() => {
        if (Date.now() - this.lastSeen > 40_000) {
          abandon(ws)
          this.dropped()
          return
        }
        try {
          ws.send('ping')
        } catch {
          // The close this provokes is answer enough.
        }
      }, 12_000)
    }
    ws.onmessage = (event) => {
      this.lastSeen = Date.now()
      if (typeof event.data !== 'string' || event.data === 'pong') return
      try {
        const parsed = JSON.parse(event.data) as { kind?: unknown; here?: unknown; names?: unknown }
        if (parsed.kind === 'tv') this.onProjection(parsed as TvProjection)
        // The relay says the evening is over before it closes the sockets. A
        // close takes ten seconds to finalise here, and a screen that learns
        // this only from its close code shows a live-looking table for all ten
        // of them. The close still arrives and still carries ENDED; this just
        // means the room does not have to wait for it.
        else if (parsed.kind === 'ended') this.onStatus('ended')
        else if (parsed.kind === 'guests' && Array.isArray(parsed.names)) {
          this.onGuests(parsed.names.filter((n): n is string => typeof n === 'string'))
        } else if (parsed.kind === 'narrator' && typeof parsed.here === 'boolean') this.onNarrator(parsed.here)
      } catch {
        // Not ours.
      }
    }
    ws.onclose = (event) => {
      window.clearTimeout(opening)
      if (this.ping !== null) window.clearInterval(this.ping)
      this.ping = null
      // The room is gone: a screen that opened it asks for a fresh one, a screen that joined it says so.
      if (event.code === NO_SUCH_ROOM) {
        this.onStatus('gone')
        return
      }
      // The narrator closed it: the evening is over, not a room to hunt for.
      if (event.code === ROOM_ENDED) {
        this.onStatus('ended')
        return
      }
      this.dropped()
    }
    ws.onerror = () => ws.close()
  }

  /** A plain disconnection: say so, then try again on the backoff. */
  private dropped(): void {
    if (this.ping !== null) window.clearInterval(this.ping)
    this.ping = null
    this.onStatus('closed')
    this.attempt += 1
    setTimeout(() => this.connect(), Math.min(30_000, 500 * 2 ** Math.min(this.attempt, 6)))
  }
}

export interface PlayerHandlers {
  onStatus: (status: LinkStatus) => void
  /** Whether a narrator is running the game right now; the relay says so. */
  onNarrator?: (here: boolean) => void
  /** The narrator's public key: derive the shared one, then say who we are. */
  onHello: (pub: string) => void
  /** This seat's projection, still sealed. */
  onSealed: (payload: string) => void
}

/** What a phone says: who it is, its vote, and at night its mark and its move. */
export type ToNarrator =
  | { kind: 'join'; name: string; pub: string }
  | { kind: 'vote'; target: number | null }
  | { kind: 'mark'; target: number | null }
  | { kind: 'act'; action: SeatAction }

/**
 * A player's side: one socket as `cid`, kept up like the screen's, and four
 * things to say — a join, a vote, a mark and a night action.
 */
export class PlayerLink {
  private ws: WebSocket | null = null
  private attempt = 0
  private ping: number | null = null
  /** The last time anything at all arrived on this socket, pings included. */
  private lastSeen = 0

  constructor(
    private readonly relay: string,
    private readonly code: string,
    private readonly cid: string,
    private readonly handlers: PlayerHandlers,
  ) {
    this.connect()
  }

  /**
   * A message straight through. A send on a socket the network has already
   * broken can throw synchronously -- `readyState` still reads OPEN a tick
   * behind reality -- so this is caught: a tap's handler must finish and
   * repaint the phone's own optimistic state regardless, or a network blip
   * mid-tap aborts the handler before it ever redraws (night-01).
   */
  send(message: ToNarrator): boolean {
    if (this.ws === null || this.ws.readyState !== WebSocket.OPEN) return false
    try {
      this.ws.send(JSON.stringify(message))
      return true
    } catch {
      return false
    }
  }

  private connect(): void {
    this.handlers.onStatus('connecting')
    const ws = new WebSocket(`${wsUrl(this.relay)}/rooms/${this.code}/ws?as=player&cid=${this.cid}`)
    this.ws = ws
    const opening = window.setTimeout(() => {
      if (ws.readyState !== WebSocket.CONNECTING) return
      if (this.ws === ws) this.ws = null
      abandon(ws)
      this.dropped()
    }, OPENING_MS)
    ws.onopen = () => {
      window.clearTimeout(opening)
      this.attempt = 0
      this.lastSeen = Date.now()
      // A ping every few seconds, and -- since a real WiFi drop does not
      // always fire a close event of its own, unlike the harness's offline
      // emulation -- a socket that has heard nothing back in a while (no
      // pong, no projection) is closed itself, so the normal reconnect path
      // and "Reconnecting..." take over instead of the phone sitting on a
      // dead connection looking merely frozen (night-01).
      this.ping = window.setInterval(() => {
        if (Date.now() - this.lastSeen > 15_000) {
          if (this.ws === ws) this.ws = null
          abandon(ws)
          this.dropped()
          return
        }
        try {
          ws.send('ping')
        } catch {
          // The close this provokes, if any, is answer enough.
        }
      }, 5_000)
      this.handlers.onStatus('open')
    }
    ws.onmessage = (event) => {
      this.lastSeen = Date.now()
      if (typeof event.data !== 'string' || event.data === 'pong') return
      try {
        const parsed = JSON.parse(event.data) as { kind?: unknown; pub?: unknown; payload?: unknown; here?: unknown }
        if (parsed.kind === 'hello' && typeof parsed.pub === 'string') this.handlers.onHello(parsed.pub)
        else if (parsed.kind === 'player' && typeof parsed.payload === 'string') this.handlers.onSealed(parsed.payload)
        // As above: the phone is told rather than left to infer it from a
        // close that takes ten seconds to land.
        else if (parsed.kind === 'ended') this.handlers.onStatus('ended')
        else if (parsed.kind === 'narrator' && typeof parsed.here === 'boolean') this.handlers.onNarrator?.(parsed.here)
      } catch {
        // Not ours.
      }
    }
    ws.onclose = (event) => {
      window.clearTimeout(opening)
      if (this.ping !== null) window.clearInterval(this.ping)
      this.ping = null
      if (this.ws === ws) this.ws = null
      // The room is gone: the phone goes back to asking for a code.
      if (event.code === NO_SUCH_ROOM) {
        this.handlers.onStatus('gone')
        return
      }
      // The narrator closed it: the evening is over, and the phone says so.
      if (event.code === ROOM_ENDED) {
        this.handlers.onStatus('ended')
        return
      }
      this.handlers.onStatus('closed')
      // Replaced by this phone's own newer socket: that one carries on.
      if (event.code === 4000) return
      this.again()
    }
    ws.onerror = () => ws.close()
  }

  /** A plain disconnection: say so, then try again on the backoff. */
  private dropped(): void {
    if (this.ping !== null) window.clearInterval(this.ping)
    this.ping = null
    this.handlers.onStatus('closed')
    this.again()
  }

  private again(): void {
    this.attempt += 1
    setTimeout(() => this.connect(), Math.min(30_000, 500 * 2 ** Math.min(this.attempt, 6)))
  }
}
