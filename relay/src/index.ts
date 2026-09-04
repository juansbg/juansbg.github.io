/**
 * The relay.
 *
 * A dumb hub keyed by room code (docs/BIG-SCREEN.md §5). The narrator's phone
 * publishes projections; the room fans them out to the screens that should
 * see them, remembers the last one per target so a screen that reconnects is
 * current at once, and forwards joins and votes back to the narrator. It
 * holds no game: a TV projection is public by construction, and a player's
 * projection arrives already encrypted with a key the server never sees
 * (the phone and the player agree it over ECDH; the relay carries only
 * public keys).
 *
 * One Worker routes; one Durable Object per room keeps the sockets. Rooms
 * evict themselves after six idle hours. Nothing here survives a room.
 */

import { DurableObject } from 'cloudflare:workers'

/** The rate-limiting binding; the types package has no name for it yet. */
interface RateLimiter {
  limit(options: { key: string }): Promise<{ success: boolean }>
}

export interface Env {
  ROOM: DurableObjectNamespace<Room>
  RATE: RateLimiter
  /** Comma-separated origins allowed to use the relay, or "*" locally. */
  ALLOWED_ORIGINS: string
  /** Needed to open a room. A secret, set with wrangler; unset means nobody may. */
  ROOM_KEY?: string
}

/**
 * The site is public and the relay is metered, so three doors are kept shut
 * until release: only pages from our origin are answered, only a phone that
 * knows the room key may open a room, and one address gets thirty handshakes
 * a minute. None of this costs a request beyond the one being refused.
 */
const allowedOrigin = (request: Request, env: Env): boolean => {
  if (env.ALLOWED_ORIGINS === '*') return true
  const origin = request.headers.get('Origin')
  if (origin === null) return false
  return env.ALLOWED_ORIGINS.split(',').map((o) => o.trim()).includes(origin)
}

const withinRate = async (request: Request, env: Env): Promise<boolean> => {
  const key = request.headers.get('CF-Connecting-IP') ?? 'unknown'
  const { success } = await env.RATE.limit({ key })
  return success
}

const hasRoomKey = (request: Request, env: Env): boolean => {
  const expected = env.ROOM_KEY ?? ''
  // Fail closed: a relay deployed before its secret is set opens no rooms.
  if (expected === '') return false
  const given = request.headers.get('X-Room-Key') ?? ''
  if (given.length !== expected.length) return false
  let diff = 0
  for (let i = 0; i < expected.length; i++) diff |= given.charCodeAt(i) ^ expected.charCodeAt(i)
  return diff === 0
}

/** Readable across a room: no 0/O, no 1/I. */
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
const CODE_LENGTH = 5
const CODE = new RegExp(`^[${ALPHABET}]{${CODE_LENGTH}}$`)

const randomCode = (): string => {
  const bytes = crypto.getRandomValues(new Uint8Array(CODE_LENGTH))
  return Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join('')
}

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-Room-Key',
}

const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS },
  })

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url)

    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS })
    if (url.pathname === '/') return json({ service: 'omerta-relay' })

    if (!allowedOrigin(request, env)) return new Response('origin', { status: 403, headers: CORS })
    if (!(await withinRate(request, env))) return new Response('slow down', { status: 429, headers: CORS })

    // The phone opens a room with the hash of its secret; the code comes back.
    if (request.method === 'POST' && url.pathname === '/rooms') {
      if (!hasRoomKey(request, env)) return json({ error: 'key' }, 403)
      const body = (await request.json().catch(() => null)) as { secretHash?: unknown } | null
      const secretHash = body?.secretHash
      if (typeof secretHash !== 'string' || !/^[0-9a-f]{64}$/.test(secretHash)) {
        return json({ error: 'secretHash' }, 400)
      }
      // A code is free while no object claims it; collisions are rare and retried.
      for (let attempt = 0; attempt < 5; attempt++) {
        const code = randomCode()
        const room = env.ROOM.get(env.ROOM.idFromName(code))
        const claimed = await room.create(secretHash)
        if (claimed) return json({ code })
      }
      return json({ error: 'busy' }, 503)
    }

    const match = url.pathname.match(/^\/rooms\/([A-Z0-9]{5})\/ws$/)
    if (match && request.method === 'GET') {
      const code = match[1] as string
      if (!CODE.test(code)) return new Response('no such room', { status: 404, headers: CORS })
      if (request.headers.get('Upgrade') !== 'websocket') {
        return new Response('expected websocket', { status: 426, headers: CORS })
      }
      const room = env.ROOM.get(env.ROOM.idFromName(code))
      return room.fetch(request)
    }

    return new Response('not found', { status: 404, headers: CORS })
  },
} satisfies ExportedHandler<Env>

/** How a socket joined, kept as its tags so it survives hibernation. */
type Role = 'narrator' | 'tv' | 'player'

const MAX_MESSAGE = 16 * 1024
/** Sockets one room will hold: a table, a few screens, some reconnect slack. */
const MAX_SOCKETS = 40
/** Messages allowed per socket per second before it is dropped. */
const RATE = 20
const IDLE_MS = 6 * 60 * 60 * 1000
/** A player's connection id: chosen by the page, random hex, kept for reconnects. */
const CID = /^[0-9a-f]{16,64}$/
const MAX_NAME = 40
const MAX_KEY = 400

/** What the narrator sends. Anything else from the narrator is ignored. */
type Published =
  | { kind: 'tv' }
  /** The narrator's public key, for every player present and every one to come. */
  | { kind: 'hello'; pub: string }
  /** One player's projection, sealed for that player. */
  | { kind: 'player'; cid: string; payload: string }

/** What a player sends. Forwarded to the narrator with the socket's own cid. */
type FromPlayer =
  | { kind: 'join'; name: string; pub: string }
  | { kind: 'vote'; target: number | null }

const seatOf = (value: unknown): number | null =>
  typeof value === 'number' && Number.isInteger(value) && value >= 0 && value < 64 ? value : null

export class Room extends DurableObject<Env> {
  /** Message counts for the current second, per socket. In memory only. */
  private counts = new WeakMap<WebSocket, { second: number; n: number }>()

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env)
    // Screens are idle most of the time; the platform keeps their sockets
    // open while this object sleeps, so a room costs nothing between moves.
    this.ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('ping', 'pong'))
  }

  /** Claims the code for this room. False if the room is already someone's. */
  async create(secretHash: string): Promise<boolean> {
    const existing = await this.ctx.storage.get<string>('secretHash')
    if (existing !== undefined) return false
    await this.ctx.storage.put('secretHash', secretHash)
    await this.touch()
    return true
  }

  override async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url)
    const secretHash = await this.ctx.storage.get<string>('secretHash')
    if (secretHash === undefined) return new Response('no such room', { status: 404 })
    if (this.ctx.getWebSockets().length >= MAX_SOCKETS) return new Response('room full', { status: 429 })

    const as = url.searchParams.get('as')
    let tags: string[]
    if (as === 'narrator') {
      const secret = url.searchParams.get('secret') ?? ''
      if ((await sha256(secret)) !== secretHash) return new Response('wrong secret', { status: 403 })
      // One narrator. A newer phone (a reload, a second device) replaces the old.
      for (const old of this.ctx.getWebSockets('narrator')) old.close(4000, 'replaced')
      tags = ['narrator']
    } else if (as === 'tv') {
      tags = ['tv']
      this.tellTvs(1)
    } else if (as === 'player') {
      const cid = url.searchParams.get('cid') ?? ''
      if (!CID.test(cid)) return new Response('cid', { status: 400 })
      // The same phone again (a reload) replaces its older socket.
      for (const old of this.ctx.getWebSockets(`cid:${cid}`)) old.close(4000, 'replaced')
      tags = ['player', `cid:${cid}`]
    } else {
      return new Response('as', { status: 400 })
    }

    const pair = new WebSocketPair()
    const [client, server] = [pair[0], pair[1]]
    this.ctx.acceptWebSocket(server, tags)

    // Whatever was last published for this screen, so it is current at once.
    if (as === 'tv') {
      const last = await this.ctx.storage.get<string>('last:tv')
      if (last !== undefined) server.send(last)
    } else if (as === 'player') {
      const hello = await this.ctx.storage.get<string>('last:hello')
      if (hello !== undefined) server.send(hello)
      const last = await this.ctx.storage.get<string>(`last:player:${url.searchParams.get('cid')}`)
      if (last !== undefined) server.send(last)
    } else {
      // The narrator learns who is in the room already.
      server.send(JSON.stringify({ kind: 'present', players: this.cids(), tvs: this.ctx.getWebSockets('tv').length }))
    }

    await this.touch()
    return new Response(null, { status: 101, webSocket: client })
  }

  override async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    if (typeof message !== 'string' || message.length > MAX_MESSAGE) {
      ws.close(1009, 'too big')
      return
    }
    if (!this.allow(ws)) {
      ws.close(1008, 'too fast')
      return
    }

    const tags = this.ctx.getTags(ws)
    const role = tags[0] as Role | undefined
    let parsed: unknown
    try {
      parsed = JSON.parse(message)
    } catch {
      return
    }
    if (typeof parsed !== 'object' || parsed === null) return

    if (role === 'narrator') {
      const msg = parsed as Published
      if (msg.kind === 'tv') {
        await this.ctx.storage.put('last:tv', message)
        for (const tv of this.ctx.getWebSockets('tv')) tv.send(message)
      } else if (msg.kind === 'hello') {
        if (typeof msg.pub !== 'string' || msg.pub.length > MAX_KEY) return
        await this.ctx.storage.put('last:hello', message)
        for (const p of this.ctx.getWebSockets('player')) p.send(message)
      } else if (msg.kind === 'player') {
        if (typeof msg.cid !== 'string' || !CID.test(msg.cid) || typeof msg.payload !== 'string') return
        await this.ctx.storage.put(`last:player:${msg.cid}`, message)
        for (const p of this.ctx.getWebSockets(`cid:${msg.cid}`)) p.send(message)
      }
      await this.touch()
    } else if (role === 'player') {
      const msg = parsed as FromPlayer
      // The cid is the socket's, not the message's: a phone cannot speak as another.
      const cid = tags.find((t) => t.startsWith('cid:'))?.slice(4) ?? ''
      if (msg.kind === 'join') {
        if (typeof msg.name !== 'string' || typeof msg.pub !== 'string') return
        if (msg.name.trim() === '' || msg.name.length > MAX_NAME || msg.pub.length > MAX_KEY) return
        this.tellNarrator({ kind: 'join', cid, name: msg.name.trim(), pub: msg.pub })
      } else if (msg.kind === 'vote') {
        if (msg.target !== null && seatOf(msg.target) === null) return
        this.tellNarrator({ kind: 'vote', cid, target: msg.target })
      } else {
        return
      }
      await this.touch()
    }
    // A TV never sends anything worth reading.
  }

  override async webSocketClose(ws: WebSocket, code: number, reason: string): Promise<void> {
    ws.close(code, reason)
    const tags = this.ctx.getTags(ws)
    if (tags.includes('tv')) this.tellTvs(0)
    const cid = tags.find((t) => t.startsWith('cid:'))?.slice(4)
    if (cid !== undefined && this.ctx.getWebSockets(`cid:${cid}`).length <= 1) {
      this.tellNarrator({ kind: 'left', cid })
    }
  }

  override async webSocketError(ws: WebSocket): Promise<void> {
    ws.close(1011, 'error')
  }

  /** Six idle hours and the room is gone, sockets and all. */
  override async alarm(): Promise<void> {
    for (const ws of this.ctx.getWebSockets()) ws.close(4001, 'room closed')
    await this.ctx.storage.deleteAll()
  }

  private cids(): string[] {
    return [
      ...new Set(
        this.ctx
          .getWebSockets('player')
          .flatMap((ws) => this.ctx.getTags(ws))
          .filter((t) => t.startsWith('cid:'))
          .map((t) => t.slice(4)),
      ),
    ]
  }

  private tellNarrator(message: unknown): void {
    const text = JSON.stringify(message)
    for (const n of this.ctx.getWebSockets('narrator')) n.send(text)
  }

  /** The narrator sees how many screens are on the room; `delta` counts the one joining or leaving. */
  private tellTvs(delta: number): void {
    const count = this.ctx.getWebSockets('tv').length + (delta > 0 ? 1 : 0)
    this.tellNarrator({ kind: 'tvs', count })
  }

  private async touch(): Promise<void> {
    await this.ctx.storage.setAlarm(Date.now() + IDLE_MS)
  }

  private allow(ws: WebSocket): boolean {
    const second = Math.floor(Date.now() / 1000)
    const count = this.counts.get(ws)
    if (count === undefined || count.second !== second) {
      this.counts.set(ws, { second, n: 1 })
      return true
    }
    count.n += 1
    return count.n <= RATE
  }
}

const sha256 = async (text: string): Promise<string> => {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('')
}
