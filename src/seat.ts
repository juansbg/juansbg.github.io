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

import { detectLocale, strings, type Locale } from './i18n'
import { exportKeys, importKeys, makeKeys, sharedKey, unseal, type KeyPair } from './room/crypto'
import { PlayerLink, parseFragment, type LinkStatus } from './room/client'
import type { SeatProjection } from './room/projections'
import type { PlayerId } from './engine/types'
import { ROLES } from './engine/roles'
import { fitTables } from './ui/screens/circle'
import { bindHold, roleCardMarkup } from './ui/screens/reveal'
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
  type SeatGate,
  type SeatPicks,
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
/** When this phone last lost the room, so a long wait can say more than a short one. */
let waitingSince: number | null = null
const LONG_WAIT_MS = 9_000
let waitTimer: number | null = null
let joined = false
let refused = false
let projection: SeatProjection | null = null
let link: PlayerLink | null = null
let releaseHold: (() => void) | null = null
/** The seats picked at this step and whether an action is on its way; see SeatPicks. */
let picks: SeatPicks = { picked: [], sent: false }
/** Which night and step the picks belong to: a new step starts clean. */
let stepKey = ''
/** The gate around the chooser: "your turn", the chooser, "close your eyes"; see SeatGate. */
let gate: SeatGate | null = null

// ---- Rendering ---------------------------------------------------------------

const render = (): void => {
  const locale = projection?.locale ?? fallback
  const t = strings(locale)
  const s = t.ui.seat
  document.documentElement.lang = locale
  document.documentElement.dataset['phase'] = projection?.phase ?? 'night'
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
  } else if (refused) {
    body = center(`<h1 class="title title--sm">${esc(s.refused)}</h1><p class="subtitle">${esc(s.refusedBody)}</p>`)
  } else if (!joined) {
    body = `
      <section class="screen screen--center mine">
        <p class="label">${esc(s.title)}</p>
        <h1 class="title tv__code">${esc(room)}</h1>
        <form class="mine__join" data-join-form>
          <label class="field">
            <span class="field__label">${esc(s.yourName)}</span>
            <input class="field__input" type="text" data-seat-name value="${esc(name)}" maxlength="40"
                   autocomplete="name" autocapitalize="words" required>
          </label>
          <button class="btn btn--primary" type="submit"${status !== 'open' ? ' disabled' : ''}>${esc(status === 'open' ? s.join : t.ui.tv.reconnecting)}</button>
        </form>
      </section>`
  } else if (projection === null) {
    body = center(`<p class="label">${esc(s.title)}</p><h1 class="title title--sm">${esc(s.joined(name))}</h1><p class="subtitle">${esc(s.waiting)}</p>`)
  } else {
    body = seatMarkup(projection, locale, picks, gate)
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
        ? s.narratorGone
        : ''

  root.innerHTML = `
    <main class="stage stage--seat">${body}</main>
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
  const parsed = JSON.parse(text) as SeatProjection | { kind: 'refused' }
  if (parsed.kind === 'refused') {
    refused = true
    joined = true
  } else if (parsed.kind === 'seat') {
    projection = parsed
    joined = true
    refused = false
    remember(nameKey, parsed.name)
    picks = settlePicks(parsed, picks, stepKey)
    stepKey = stepKeyOf(parsed)
    gate = nextGate(gate, parsed)
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

  // ---- The night: through the gate, a seat tapped, then an action sent ----
  on(root, '[data-enter]', 'click', () => {
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
    link.send({ kind: 'act', action })
    picks = { picked: picks.picked, sent: true }
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
