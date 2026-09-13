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
 *
 * A room is opened by a screen (docs/BIG-SCREEN.md §11): anyone may ask for
 * a code, and the room lives fifteen minutes unclaimed. Only a phone that
 * knows the room key may claim it as narrator, with the hash of a secret
 * the phone made; the secret itself is what its socket presents.
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
  /** Needed to claim a room's narrator. A secret, set with wrangler; unset means nobody may. */
  ROOM_KEY?: string
}

/**
 * The site is public and the relay is metered, so three doors are kept shut
 * until release: only pages from our origin are answered, only a phone that
 * knows the room key may be a room's narrator, and one address gets thirty
 * handshakes a minute. None of this costs a request beyond the one being
 * refused, and an unclaimed room is a code and an alarm.
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

const validHash = (value: unknown): value is string => typeof value === 'string' && /^[0-9a-f]{64}$/.test(value)

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

    // A screen opens a room with an empty body and gets a code to show; a
    // phone that sends the hash of its secret with the key opens one claimed.
    if (request.method === 'POST' && url.pathname === '/rooms') {
      const body = (await request.json().catch(() => null)) as { secretHash?: unknown } | null
      let secretHash: string | null = null
      if (body?.secretHash !== undefined) {
        if (!hasRoomKey(request, env)) return json({ error: 'key' }, 403)
        if (!validHash(body.secretHash)) return json({ error: 'secretHash' }, 400)
        secretHash = body.secretHash
      }
      // A code is free while no object claims it; collisions are rare and retried.
      for (let attempt = 0; attempt < 5; attempt++) {
        const code = randomCode()
        const room = env.ROOM.get(env.ROOM.idFromName(code))
        const opened = await room.create(secretHash)
        if (opened) return json({ code })
      }
      return json({ error: 'busy' }, 503)
    }

    // The narrator claims a room a screen opened: the key, and the hash of
    // the secret the phone will present. A claim with the key always wins.
    const claim = url.pathname.match(/^\/rooms\/([A-Z0-9]{5})\/claim$/)
    if (claim && request.method === 'POST') {
      const code = claim[1] as string
      if (!CODE.test(code)) return json({ error: 'room' }, 404)
      if (!hasRoomKey(request, env)) return json({ error: 'key' }, 403)
      const body = (await request.json().catch(() => null)) as { secretHash?: unknown } | null
      if (!validHash(body?.secretHash)) return json({ error: 'secretHash' }, 400)
      const room = env.ROOM.get(env.ROOM.idFromName(code))
      const claimed = await room.claim(body.secretHash)
      return claimed ? json({ code }) : json({ error: 'room' }, 404)
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
/** The close code for a room that does not exist or has expired: 4000 is "replaced". */
const GONE = 4004
/** The narrator closed the room on purpose. A screen says so rather than waiting. */
const ENDED = 4001
/** Messages allowed per socket per second before it is dropped. */
const RATE = 20
const IDLE_MS = 6 * 60 * 60 * 1000
/** A room nobody has claimed is a code on a screen; it waits this long for a narrator. */
const UNCLAIMED_MS = 15 * 60 * 1000
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
  /**
   * The narrator closed the room (docs/BIG-SCREEN.md §12.2). A decision, not
   * a dropped connection: the room goes, and every screen is told why.
   */
  | { kind: 'end' }

/** What a player sends. Forwarded to the narrator with the socket's own cid. */
type FromPlayer =
  | { kind: 'join'; name: string; pub: string }
  | { kind: 'vote'; target: number | null }
  /** The seat the Family is looking at tonight: a proposal, not a record. */
  | { kind: 'mark'; target: number | null }
  /** A night step taken from the phone; the narrator checks it against the game. */
  | { kind: 'act'; action: unknown }

/** A phone's join, kept so the narrator's socket learns it whenever it connects. */
interface Join {
  cid: string
  name: string
  pub: string
}

const seatOf = (value: unknown): number | null =>
  typeof value === 'number' && Number.isInteger(value) && value >= 0 && value < 64 ? value : null

/**
 * A night action's shape, and only its shape: seat numbers where seats go, a
 * vial that is a vial, a card name that looks like one. Whether it is allowed
 * is the narrator's to decide; the relay only refuses junk.
 */
const seatAction = (value: unknown): Record<string, unknown> | null => {
  if (typeof value !== 'object' || value === null) return null
  const a = value as Record<string, unknown>
  switch (a.kind) {
    case 'target':
      return seatOf(a.target) === null ? null : { kind: 'target', target: a.target }
    case 'pair':
      return seatOf(a.first) === null || seatOf(a.second) === null ? null : { kind: 'pair', first: a.first, second: a.second }
    case 'potion':
      return seatOf(a.target) === null || (a.potion !== 'heal' && a.potion !== 'kill')
        ? null
        : { kind: 'potion', target: a.target, potion: a.potion }
    case 'split':
      return Array.isArray(a.sectOne) && a.sectOne.length <= 64 && a.sectOne.every((s) => seatOf(s) !== null)
        ? { kind: 'split', sectOne: a.sectOne }
        : null
    case 'chooseRole':
      return typeof a.newRole === 'string' && /^[A-Z_]{1,32}$/.test(a.newRole) ? { kind: 'chooseRole', newRole: a.newRole } : null
    case 'confirm':
    case 'skip':
      return { kind: a.kind }
    default:
      return null
  }
}

export class Room extends DurableObject<Env> {
  /** Message counts for the current second, per socket. In memory only. */
  private counts = new WeakMap<WebSocket, { second: number; n: number }>()

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env)
    // Screens are idle most of the time; the platform keeps their sockets
    // open while this object sleeps, so a room costs nothing between moves.
    this.ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('ping', 'pong'))
  }

  /** Takes the code for this room, claimed or not. False if the code is already a room. */
  async create(secretHash: string | null): Promise<boolean> {
    if ((await this.ctx.storage.get<boolean>('open')) === true) return false
    await this.ctx.storage.put('open', true)
    if (secretHash !== null) await this.ctx.storage.put('secretHash', secretHash)
    await this.touch()
    return true
  }

  /** Makes the phone presenting this secret the narrator. False if there is no such room. */
  async claim(secretHash: string): Promise<boolean> {
    if ((await this.ctx.storage.get<boolean>('open')) !== true) return false
    await this.ctx.storage.put('secretHash', secretHash)
    for (const old of this.ctx.getWebSockets('narrator')) old.close(4000, 'replaced')
    await this.touch()
    return true
  }

  override async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url)
    // A room that is not there is told so over the socket: a refused upgrade
    // reaches a browser as any other failure, and a screen must know the
    // difference between the relay being down and its room being gone.
    if ((await this.ctx.storage.get<boolean>('open')) !== true) return gone()
    if (this.ctx.getWebSockets().length >= MAX_SOCKETS) return new Response('room full', { status: 429 })

    const as = url.searchParams.get('as')
    let tags: string[]
    if (as === 'narrator') {
      const secretHash = await this.ctx.storage.get<string>('secretHash')
      const secret = url.searchParams.get('secret') ?? ''
      if (secretHash === undefined || (await sha256(secret)) !== secretHash) {
        return new Response('wrong secret', { status: 403 })
      }
      // One narrator. A newer phone (a reload, a second device) replaces the old.
      for (const old of this.ctx.getWebSockets('narrator')) old.close(4000, 'replaced')
      tags = ['narrator']
      // A screen waiting on an empty room learns at once that somebody is running it.
      this.tellRoom({ kind: 'narrator', here: true })
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

    // Whether anyone is running the game. A screen that joins a room nobody
    // has claimed, or whose narrator has gone, says so instead of waiting
    // silently on a table that will not move.
    if (as !== 'narrator') {
      const here = this.ctx.getWebSockets('narrator').length > 0
      server.send(JSON.stringify({ kind: 'narrator', here }))
    }

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
      // The narrator learns who is in the room already, joins included, so a
      // phone that scanned before the narrator arrived is not lost.
      server.send(JSON.stringify({ kind: 'present', players: await this.joins(), tvs: this.ctx.getWebSockets('tv').length }))
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
      } else if (msg.kind === 'end') {
        await this.end()
        return
      }
      await this.touch()
    } else if (role === 'player') {
      const msg = parsed as FromPlayer
      // The cid is the socket's, not the message's: a phone cannot speak as another.
      const cid = tags.find((t) => t.startsWith('cid:'))?.slice(4) ?? ''
      if (msg.kind === 'join') {
        if (typeof msg.name !== 'string' || typeof msg.pub !== 'string') return
        if (msg.name.trim() === '' || msg.name.length > MAX_NAME || msg.pub.length > MAX_KEY) return
        const join: Join = { cid, name: msg.name.trim(), pub: msg.pub }
        await this.ctx.storage.put(`join:${cid}`, join)
        this.tellNarrator({ kind: 'join', ...join })
      } else if (msg.kind === 'vote') {
        if (msg.target !== null && seatOf(msg.target) === null) return
        this.tellNarrator({ kind: 'vote', cid, target: msg.target })
      } else if (msg.kind === 'mark') {
        if (msg.target !== null && seatOf(msg.target) === null) return
        this.tellNarrator({ kind: 'mark', cid, target: msg.target })
      } else if (msg.kind === 'act') {
        const action = seatAction(msg.action)
        if (action === null) return
        this.tellNarrator({ kind: 'act', cid, action })
      } else {
        return
      }
      await this.touch()
    }
    // A TV never sends anything worth reading.
  }

  override async webSocketClose(ws: WebSocket, code: number, reason: string): Promise<void> {
    // Who has to know comes first: closing our own end can throw on a socket
    // the client has already dropped, and the room would never hear about it.
    this.farewell(ws)
    try {
      ws.close(code, reason)
    } catch {
      // Already gone.
    }
  }

  // A socket that dies without a goodbye reaches us as an error, not a close;
  // the room must hear about that one the same way.
  override async webSocketError(ws: WebSocket): Promise<void> {
    this.farewell(ws)
    try {
      ws.close(1011, 'error')
    } catch {
      // Already gone.
    }
  }

  /** One socket has gone, however it went: who has to know. */
  private farewell(ws: WebSocket): void {
    const tags = this.ctx.getTags(ws)
    // The narrator's phone went: a reload, a locked screen, a flat battery.
    // The room is told so it can wait out loud; a replacement says `here` again.
    if (tags.includes('narrator') && this.ctx.getWebSockets('narrator').length <= 1) {
      this.tellRoom({ kind: 'narrator', here: false })
    }
    if (tags.includes('tv')) this.tellTvs(0)
    const cid = tags.find((t) => t.startsWith('cid:'))?.slice(4)
    if (cid !== undefined && this.ctx.getWebSockets(`cid:${cid}`).length <= 1) {
      this.tellNarrator({ kind: 'left', cid })
    }
  }

  /** The alarm: the room is gone, sockets and all. */
  override async alarm(): Promise<void> {
    for (const ws of this.ctx.getWebSockets()) ws.close(GONE, 'no such room')
    await this.ctx.storage.deleteAll()
  }

  /**
   * The narrator closed the room. Everything goes, and every screen is closed
   * with ENDED rather than GONE, so it can say the evening is over instead of
   * hunting for a room that never existed.
   */
  private async end(): Promise<void> {
    for (const ws of this.ctx.getWebSockets()) ws.close(ENDED, 'closed')
    await this.ctx.storage.deleteAll()
    await this.ctx.storage.deleteAlarm()
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

  /** The joins of the phones on the room now: what each last said its name was. */
  private async joins(): Promise<Join[]> {
    const cids = this.cids()
    if (cids.length === 0) return []
    const stored = await this.ctx.storage.get<Join>(cids.map((cid) => `join:${cid}`))
    return cids.flatMap((cid) => {
      const join = stored.get(`join:${cid}`)
      return join === undefined ? [] : [join]
    })
  }

  private tellNarrator(message: unknown): void {
    const text = JSON.stringify(message)
    for (const n of this.ctx.getWebSockets('narrator')) n.send(text)
  }

  /** Everyone watching: the screens and the phones, never the narrator. */
  private tellRoom(message: unknown): void {
    const text = JSON.stringify(message)
    for (const ws of [...this.ctx.getWebSockets('tv'), ...this.ctx.getWebSockets('player')]) ws.send(text)
  }

  /** The narrator sees how many screens are on the room; `delta` counts the one joining or leaving. */
  private tellTvs(delta: number): void {
    const count = this.ctx.getWebSockets('tv').length + (delta > 0 ? 1 : 0)
    this.tellNarrator({ kind: 'tvs', count })
  }

  /** Six idle hours for a claimed room; fifteen minutes for a code nobody has claimed. */
  private async touch(): Promise<void> {
    const claimed = (await this.ctx.storage.get<string>('secretHash')) !== undefined
    await this.ctx.storage.setAlarm(Date.now() + (claimed ? IDLE_MS : UNCLAIMED_MS))
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

/** Closes a fresh socket at once with the "no such room" code, so the page can tell. */
const gone = (): Response => {
  const pair = new WebSocketPair()
  const [client, server] = [pair[0], pair[1]]
  server.accept()
  server.close(GONE, 'no such room')
  return new Response(null, { status: 101, webSocket: client })
}

const sha256 = async (text: string): Promise<string> => {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('')
}
