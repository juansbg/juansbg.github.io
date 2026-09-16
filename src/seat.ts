// A player's phone. Joins the room with a name, keeps a key pair the relay
// never sees, and renders the one projection sealed for this seat: the card
// under a hold, the night step by step with the chooser on the acting seat's
// phone alone (docs/BIG-SCREEN.md §10), the vote by day, "you are out" after.
// Same fonts, tokens and card as the narrator's phone; none of the narrator's
// handlers. The narrator validates every action and answers with the seat's
// projection, so nothing here assumes a tap landed.
import '@fontsource/bebas-neue/latin-400.css'
import '@fontsource/ibm-plex-sans/latin-400.css'
import '@fontsource/ibm-plex-sans/latin-500.css'
import '@fontsource/ibm-plex-sans/latin-600.css'
import '@fontsource/ibm-plex-mono/latin-400.css'
import '@fontsource/ibm-plex-mono/latin-500.css'
import './ui/styles.css'

import { LOCALES, detectLocale, strings, type Locale } from './i18n'
import { exportKeys, importKeys, makeKeys, sharedKey, unseal, type KeyPair } from './room/crypto'
import { PlayerLink, parseFragment, type LinkStatus } from './room/client'
import type { SeatProjection } from './room/projections'
import type { PlayerId } from './engine/types'
import { ROLES } from './engine/roles'
import { fitTables } from './ui/screens/circle'
import { bindHold, roleCardMarkup } from './ui/screens/reveal'
import { dailyMarkup, editionOf } from './ui/screens/paper'
import {
  CODE_SHAPE,
  codeMarkup,
  nextGate,
  seatAction,
  seatCenter as center,
  seatMarkup,
  seatPlayer,
  settlePicks,
  stepKeyOf,
  nextGone,
  type SeatGate,
  type SeatGone,
  type SeatPicks,
  type SeatWas,
} from './ui/screens/seat'
import { buzz, esc, on } from './ui/dom'

const root = document.querySelector<HTMLDivElement>('#app')
if (!root) throw new Error('#app missing')

const { room, relay } = parseFragment(location.hash)
const fallback: Locale = detectLocale(navigator.languages ?? [navigator.language])

// ---- What this phone remembers across a reload: who it is in the room -----

const remember = (key: string, value: string | null): void => {
  try {
    if (value === null) sessionStorage.removeItem(key)
    else sessionStorage.setItem(key, value)
  } catch {
    // Private mode: the seat holds until the page closes.
  }
}
const recall = (key: string): string | null => {
  try {
    return sessionStorage.getItem(key)
  } catch {
    return null
  }
}

const cidKey = `omerta:seat:${room ?? ''}:cid`
const localeKey = `omerta:seat:${room ?? ''}:locale`

/** The room's language as this phone last heard it, or null if it never has. */
function readLocale(): Locale | null {
  const saved = recall(localeKey)
  return LOCALES.some((l) => l === saved) ? (saved as Locale) : null
}

/** Learned from anything the room says, and kept for the next reload. */
function learnLocale(locale: Locale): void {
  if (locale === roomLocale) return
  roomLocale = locale
  remember(localeKey, locale)
}
const nameKey = `omerta:seat:${room ?? ''}:name`
const keysKey = `omerta:seat:${room ?? ''}:keys`

const randomHex = (bytes: number): string =>
  Array.from(crypto.getRandomValues(new Uint8Array(bytes)), (b) => b.toString(16).padStart(2, '0')).join('')

let cid = recall(cidKey) ?? randomHex(16)
remember(cidKey, cid)
let name = recall(nameKey) ?? ''

let keys: KeyPair | null = null
let shared: CryptoKey | null = null
let narratorPub: string | null = null
/** Sealed payloads that arrived before the key was ready. */
let pendingSealed: string[] = []

let status: LinkStatus = 'connecting'
/** Whether a narrator's phone is on the room right now; the relay says so. */
let narratorHere = true
/**
 * Whether one has ever been on it. A room nobody has claimed yet and a room
 * whose narrator has just walked off look identical on the wire, and a first
 * timer's first screen read "waiting for the narrator to come back" about
 * somebody who had never been there.
 */
let narratorEver = false
/** When this phone last lost the room, so a long wait can say more than a short one. */
let waitingSince: number | null = null
const LONG_WAIT_MS = 9_000
let waitTimer: number | null = null
let joined = false
/**
 * The door said no, and why, or null while it has not.
 *
 * The reason comes from the narrator's device, because it is the only one
 * that can know it: this phone knows the name it typed and nothing else about
 * the table. The three cases are the ones the narrator's own timeline names,
 * so the two screens describe one event in the same words.
 */
type Refusal = 'notOnList' | 'nameTaken' | 'tableFull'
let refused: Refusal | null = null
/**
 * The room's own language.
 *
 * A refused phone has no seat and so no projection to read a locale from, and
 * it was falling back to the handset's own languages — so a Spanish table
 * turned somebody away in English. The narrator's language is the room's, and
 * the relay sends it with the refusal.
 *
 * It is kept beside the seat this phone remembers, because module state does
 * not survive a reload: everything the page shows before the next projection
 * arrives — waiting, the code, a refusal — came back in the handset's language
 * instead of the room's. At a Spanish table that is precisely the one guest
 * whose phone is set to English. A phone that has never been in this room
 * still reads its own browser, which is the only thing it can know.
 */
let roomLocale: Locale | null = readLocale()
let projection: SeatProjection | null = null
let link: PlayerLink | null = null
let releaseHold: (() => void) | null = null
/** The seats picked at this step and whether an action is on its way; see SeatPicks. */
let picks: SeatPicks = { picked: [], sent: false }
/**
 * The morning's paper, open on this phone.
 *
 * Only a seat that is out is ever sent the day's public outcomes, so this can
 * only ever be true on a phone that has nothing else to do. It closes itself
 * if the projection stops carrying one — a new game, or a rewind that puts
 * this player back in the game — rather than stranding the phone on a page
 * with nothing behind it.
 */
let paperOpen = false
/**
 * An action went out and the step has not moved.
 *
 * A socket that is OPEN is not proof the narrator saw the tap — the frame can
 * still be lost after it — so the claim has a deadline rather than a state.
 *
 * What clears the deadline is the STEP MOVING ON, never the arrival of a
 * projection: the narrator republishes on every paint, so "a projection came
 * back" only says something happened in the room, and clearing on that made
 * the warning rarest at a busy table, which is exactly where a frame goes
 * missing. It also left a REFUSED action stranded — the refusal comes back as
 * the unchanged step, so it cleared the deadline while leaving the buttons
 * dimmed with nothing left to rescue them. Both now time out, which is right:
 * a lost frame and a refused tap ask the player for the same thing.
 */
const ACK_MS = 3_000
let ackTimer: number | null = null

const awaitAck = (): void => {
  if (ackTimer !== null) clearTimeout(ackTimer)
  ackTimer = window.setTimeout(() => {
    ackTimer = null
    picks = { picked: picks.picked, sent: false, unsent: true }
    render()
  }, ACK_MS)
}

const gotAck = (): void => {
  if (ackTimer !== null) clearTimeout(ackTimer)
  ackTimer = null
}
/** Which night and step the picks belong to: a new step starts clean. */
let stepKey = ''
/** The gate around the chooser: "your turn", the chooser, "close your eyes"; see SeatGate. */
let gate: SeatGate | null = null
/** The death screen, until this phone taps past it; see SeatGone. */
let gone: SeatGone | null = null
/** What this phone last saw of itself, so a reload is not told the news again. */
let was: SeatWas | null = null
/**
 * The scene this phone last painted. Entrances play when a scene arrives and
 * never on a republish, the same rule the narrator's `render(true)` follows:
 * the stage had no `data-enter` at all, so the stylesheet's
 * `.stage:not([data-enter])` list suppressed every entrance on this page for
 * good (phone-04).
 */
let scene = ''

// ---- Rendering ---------------------------------------------------------------

const render = (): void => {
  // The room's language wins over the handset's: a seat's own projection
  // first, then whatever the door said, and only then the browser's guess —
  // which is right only before any room has answered.
  const locale = projection?.locale ?? roomLocale ?? fallback
  const t = strings(locale)
  const s = t.ui.seat
  document.documentElement.lang = locale
  // The engine turns the page to day the moment the night resolves, but the
  // room has not heard the morning yet. A phone that lightens in nine pairs of
  // hands gives the reading away before a word of it is read, so the ground
  // stays night until the narrator has finished (docs/BIG-SCREEN.md §12.3).
  document.documentElement.dataset['phase'] = projection?.reading != null ? 'night' : (projection?.phase ?? 'night')
  releaseHold?.()
  releaseHold = null

  let body: string
  if (relay === '') {
    body = center(`<h1 class="title title--sm">${esc(t.ui.tv.noRoom)}</h1>`)
  } else if (status === 'ended') {
    // The narrator closed the room on purpose (§12.2): the evening is over,
    // and this phone says so rather than offering to hunt for the code again.
    body = center(`<h1 class="title title--sm">${esc(s.roomEnded)}</h1>`)
  } else if (room === null || status === 'gone') {
    // No room in the address, or the one in it has closed: the code is on the screen, typed here (§11).
    body = codeMarkup(locale, status === 'gone')
  } else if (refused !== null || !joined) {
    // The door's answer sits above the field that answers it: a player told to
    // join under a name only they answer to has nothing to do it with if the
    // form goes away with the news.
    const said: Record<Refusal, { head: string; body: string }> = {
      notOnList: { head: s.refused, body: s.refusedBody },
      nameTaken: { head: s.refusedTaken, body: s.refusedTakenBody },
      tableFull: { head: s.refusedFull, body: s.refusedFullBody },
    }
    const no = refused === null ? null : said[refused]
    body = `
      <section class="screen screen--center mine">
        ${
          no === null
            ? // A phone scanned cold, by somebody who has not been told what
              // this is: the wordmark before anything else, because this is the
              // screen where a stranger types their real name into a strange
              // link and the only one where nothing else identifies the game.
              `<h1 class="title mine__wordmark">${esc(t.appName)}</h1>
               <p class="label">${esc(s.title)}</p>
               <p class="title tv__code">${esc(room)}</p>`
            : // The code stays on the screen the door said no on: somebody who
              // mistyped their name has no way otherwise to check they are
              // even in the right room (phone-14).
              `<h1 class="title title--sm">${esc(no.head)}</h1>
               <p class="subtitle">${esc(no.body)}</p>
               <p class="label mine__at">${esc(s.roomCode)} ${esc(room)}</p>`
        }
        <form class="mine__join" data-join-form>
          <label class="field">
            <span class="field__label">${esc(s.yourName)}</span>
            <input class="field__input" type="text" data-seat-name value="${esc(name)}" maxlength="40"
                   autocomplete="name" autocapitalize="words" required>
          </label>
          <button class="btn btn--primary" type="submit"${status !== 'open' ? ' disabled' : ''}>${esc(status === 'open' ? (no === null ? s.join : s.joinAgain) : t.ui.tv.reconnecting)}</button>
        </form>
      </section>`
  } else if (projection === null) {
    body = center(`<p class="label">${esc(s.title)}</p><h1 class="title title--sm">${esc(s.joined(name))}</h1><p class="subtitle">${esc(s.waiting)}</p>`)
  } else if (paperOpen && projection.log.length > 0) {
    // The same edition the room is reading, from the same facts and the same
    // function: `editionOf` is what the big screen and the narrator's phone
    // both build theirs with, so there is one morning and not three.
    body = dailyMarkup(
      editionOf({ day: projection.day, players: projection.players, log: projection.log, revealed: projection.revealed }, locale),
      locale,
    )
  } else {
    if (paperOpen) paperOpen = false
    body = seatMarkup(projection, locale, picks, gate, gone)
  }

  // The foot says what the phone cannot do anything about: its own socket is
  // down, or the narrator's phone has gone quiet. Never both, never an alarm.
  const waiting = status !== 'open' && status !== 'ended'
  if (waiting && waitingSince === null) waitingSince = Date.now()
  if (!waiting) waitingSince = null
  const longWait = waitingSince !== null && Date.now() - waitingSince > LONG_WAIT_MS
  if (waitTimer !== null) window.clearTimeout(waitTimer)
  waitTimer = waiting && !longWait ? window.setTimeout(render, LONG_WAIT_MS + 200) : null

  const foot =
    joined && waiting
      ? longWait
        ? `${t.ui.tv.reconnecting} ${t.ui.tv.stillTrying}`
        : t.ui.tv.reconnecting
      : joined && !narratorHere
        ? narratorEver
          ? s.narratorGone
          : s.narratorYet
        : ''

  // A scene, for the entrances: the screen this phone is on, and nothing that
  // changes on a republish. A step, the phase, a gate page, the news of a
  // death or the door's answer are scenes; a mark moving, a ballot filling up
  // or a socket reconnecting are the same scene repainted.
  const next = [
    relay === '' ? 'norelay' : '',
    status === 'ended' ? 'ended' : '',
    room === null || status === 'gone' ? 'code' : '',
    joined ? '' : 'door',
    refused ?? '',
    projection === null ? 'waiting' : '',
    projection?.over === true ? 'over' : '',
    projection?.phase ?? '',
    projection?.reading ?? '',
    projection?.alive === false ? 'out' : '',
    gone === null ? '' : 'gone',
    gate?.kind ?? '',
    stepKey,
    // A name arriving in the lobby is a scene: it is the one thing that
    // happens on that screen, and the list is what a new player watches.
    projection?.phase === 'setup' ? projection.roster.map((r) => `${r.name}:${r.joined}`).join(',') : '',
  ].join('|')
  const entering = next !== scene
  scene = next

  root.innerHTML = `
    <main class="stage stage--seat"${entering ? ' data-enter' : ''}>${body}</main>
    ${foot === '' ? '' : `<p class="tv__status">${esc(foot)}</p>`}
  `

  fitTables(root)
  bind()
  keepAwake()
  if (projection?.roleId) {
    const p = projection
    releaseHold = bindHold(root, {
      onReveal: () => {
        const slot = root.querySelector('[data-card]')
        if (slot) slot.innerHTML = roleCardMarkup(seatPlayer(p), p.locale)
        document.body.classList.add('is-revealing')
      },
      onHide: () => {
        const slot = root.querySelector('[data-card]')
        if (slot) slot.innerHTML = ''
        document.body.classList.remove('is-revealing')
      },
    })
  }
}


// ---- The room ---------------------------------------------------------------

const applySealed = async (payload: string): Promise<void> => {
  if (shared === null) {
    pendingSealed.push(payload)
    return
  }
  const text = await unseal(shared, payload)
  if (text === null) return
  const parsed = JSON.parse(text) as SeatProjection | { kind: 'refused'; reason?: Refusal; locale?: Locale }
  if (parsed.kind === 'refused') {
    refused = parsed.reason ?? 'notOnList'
    if (parsed.locale !== undefined) learnLocale(parsed.locale)
    joined = true
  } else if (parsed.kind === 'seat') {
    projection = parsed
    joined = true
    refused = null
    // Every projection, not only a refusal: a seated phone never sees one, and
    // it was the seated phones that came back from a reload in the wrong
    // language.
    learnLocale(parsed.locale)
    remember(nameKey, parsed.name)
    picks = settlePicks(parsed, picks, stepKey)
    // `settlePicks` keeps `sent` while the step stands: an answer is the step
    // moving on, and that is the only thing that calls the deadline off.
    if (!picks.sent) gotAck()
    stepKey = stepKeyOf(parsed)
    gate = nextGate(gate, parsed)
    gone = nextGone(gone, was, parsed)
    was = { alive: parsed.alive, phase: parsed.phase }
  }
  render()
}

// ---- The screen stays lit through the night ---------------------------------
// Every phone shows the same night at every step, and a phone that went dark
// would say its owner is not awake. The lock is asked for once a projection is
// up and again whenever the page comes back to the front; a browser without
// it just falls back to its own timeout.

let wakeLock: WakeLockSentinel | null = null

const keepAwake = (): void => {
  if (projection === null || document.hidden || !('wakeLock' in navigator)) return
  if (wakeLock !== null && !wakeLock.released) return
  navigator.wakeLock.request('screen').then(
    (lock) => {
      wakeLock = lock
    },
    () => {
      wakeLock = null
    },
  )
}

const sendJoin = (): void => {
  if (link === null || keys === null || name.trim() === '') return
  link.send({ kind: 'join', name: name.trim(), pub: keys.pub })
}

const start = async (): Promise<void> => {
  keys = (await importKeys(recall(keysKey) ?? '')) ?? (await makeKeys())
  remember(keysKey, await exportKeys(keys))
  if (room === null || relay === '') {
    render()
    return
  }
  link = new PlayerLink(relay, room, cid, {
    onStatus: (next) => {
      status = next
      // A fresh socket: say who we are again, in case the narrator forgot.
      if (next === 'open' && name.trim() !== '') sendJoin()
      render()
    },
    onHello: async (pub) => {
      if (pub === narratorPub || keys === null) return
      narratorPub = pub
      shared = await sharedKey(keys.privateKey, pub)
      // A new narrator key means a reloaded phone: it has forgotten us.
      if (name.trim() !== '') sendJoin()
      const queued = pendingSealed
      pendingSealed = []
      for (const payload of queued) await applySealed(payload)
    },
    onSealed: (payload) => {
      void applySealed(payload)
    },
    onNarrator: (here) => {
      narratorHere = here
      if (here) narratorEver = true
      render()
    },
  })
  render()
}

// `on` binds to the elements that exist now, so it runs after every paint.
const bind = (): void => {
  // The code typed off the screen becomes the address, and the page starts over from it.
  on(root, '[data-room-code]', 'input', (_event, el) => {
    const input = el as HTMLInputElement
    const clean = input.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 5)
    if (input.value !== clean) input.value = clean
  })

  on(root, '[data-code-form]', 'submit', (event) => {
    event.preventDefault()
    const code = root.querySelector<HTMLInputElement>('[data-room-code]')?.value.trim().toUpperCase() ?? ''
    if (!CODE_SHAPE.test(code)) return
    buzz()
    location.hash = new URLSearchParams({ room: code }).toString()
    location.reload()
  })

  on(root, '[data-join-form]', 'submit', (event) => {
    event.preventDefault()
    // Whatever the door said last time was about the last name.
    refused = null
    const input = root.querySelector<HTMLInputElement>('[data-seat-name]')
    name = input?.value.trim() ?? ''
    if (name === '') return
    remember(nameKey, name)
    sendJoin()
    joined = true
    render()
  })

  on(root, '[data-vote]', 'click', (_event, el) => {
    if (projection === null || link === null) return
    const target = Number(el.dataset['vote'])
    link.send({ kind: 'vote', target: projection.vote === target ? null : target })
  })

  // The news of one's own death, taken in and tapped past.
  on(root, '[data-paper-open]', 'click', () => {
    paperOpen = true
    render()
  })

  on(root, '[data-paper-close]', 'click', () => {
    paperOpen = false
    render()
  })

  on(root, '[data-mourn]', 'click', () => {
    buzz()
    gone = null
    render()
  })

  // A ring that is not a ballot still gets an answer. The seats are disabled,
  // so the tap arrives at the table around them; nothing moves, and the
  // phone's own state says so rather than swallowing the finger (phone-07).
  on(root, '[data-tap="off"] .table', 'pointerdown', () => {
    // The dead have `.mine__state`; a living seat with nothing to do at this
    // step has `.mine__note` instead, and used to get no answer at all — no
    // nudge and not even a buzz, because the handler gave up before it.
    const line = root.querySelector('.mine__state') ?? root.querySelector('.mine__note')
    if (line === null || line.hasAttribute('data-nudge')) return
    buzz()
    line.setAttribute('data-nudge', '')
    window.setTimeout(() => line.removeAttribute('data-nudge'), 700)
  })

  // ---- The night: through the gate, a seat tapped, then an action sent ----
  on(root, '[data-gate-go]', 'click', () => {
    if (gate === null || gate.kind !== 'turn') return
    buzz()
    gate = { kind: 'chooser', key: gate.key }
    render()
  })

  on(root, '[data-close]', 'click', () => {
    if (gate === null) return
    buzz()
    // The Detective reads his card, then is told to close his eyes like everyone else.
    gate = gate.kind === 'looked' ? { kind: 'close', key: gate.key } : null
    render()
  })

  on(root, '[data-pick]', 'click', (_event, el) => {
    if (projection === null || link === null || picks.sent) return
    const n = projection.tonight
    if (n === null || n.step === null || !n.acting) return
    const id = Number(el.dataset['pick']) as PlayerId
    const kind = ROLES[n.step].target.kind
    buzz()
    if (kind === 'player' || kind === 'potion') {
      // One seat at a time; the same seat again takes the pick back. On a
      // player step the pick is also the mark every Family phone sees.
      const marked = picks.picked.length > 0 ? picks.picked : kind === 'player' ? n.view.marked : []
      const off = marked.includes(id)
      picks = { picked: off ? [] : [id], sent: false }
      if (kind === 'player') link.send({ kind: 'mark', target: off ? null : id })
    } else {
      // The pair and the split collect seats; tapping one again drops it.
      picks = {
        picked: picks.picked.includes(id) ? picks.picked.filter((x) => x !== id) : [...picks.picked, id],
        sent: false,
      }
    }
    render()
  })

  on(root, '[data-act]', 'click', (_event, el) => {
    if (projection === null || link === null || picks.sent) return
    const action = seatAction(
      el.dataset['act'] ?? '',
      { potion: el.dataset['potion'], role: el.dataset['role'] },
      projection,
      picks,
    )
    if (action === null) return
    buzz()
    // The socket's own answer, rather than hope: a frame it would not take is
    // a frame the narrator never sees.
    if (!link.send({ kind: 'act', action })) {
      picks = { picked: picks.picked, sent: false, unsent: true }
      render()
      return
    }
    picks = { picked: picks.picked, sent: true }
    awaitAck()
    render()
  })
}

window.addEventListener('resize', () => fitTables(root))

// A background tab or a dropped finger must never leave a card on screen.
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    const slot = root.querySelector('[data-card]')
    if (slot) slot.innerHTML = ''
    document.body.classList.remove('is-revealing')
  } else {
    keepAwake()
  }
})

void start()
