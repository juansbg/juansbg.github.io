// The TV: the screen the whole room looks at. Opened bare it asks the relay
// for a room of its own and shows the code and the players' QR at once, so
// the narrator's phone, which holds every role, is never the thing a table
// gathers round (docs/BIG-SCREEN.md §11); the narrator claims the room by
// typing the code, and from then on the screen renders whatever their phone
// publishes. Opened with a room in its fragment it joins that one, as a
// second screen does. Same fonts, tokens and table markup as the phone's
// table view, so the two never drift. No handlers, no game.
import '@fontsource/bebas-neue/latin-400.css'
import '@fontsource/ibm-plex-sans/latin-400.css'
import '@fontsource/ibm-plex-sans/latin-500.css'
import '@fontsource/ibm-plex-sans/latin-600.css'
import '@fontsource/ibm-plex-mono/latin-400.css'
import '@fontsource/ibm-plex-mono/latin-500.css'
import './ui/styles.css'

import { detectLocale, strings, type Locale } from './i18n'
import {
  loadRelay,
  parseFragment,
  requestRoom,
  ScreenLink,
  seatUrl,
  type LinkStatus,
  type OpenRoom,
} from './room/client'
import type { TvProjection } from './room/projections'
import { lobbyMarkup, tableMarkup } from './ui/screens/table'
import { esc } from './ui/dom'

const root = document.querySelector<HTMLDivElement>('#app')
if (!root) throw new Error('#app missing')

/** The room this screen opened for itself, kept so a reload lands back on it. */
const SCREEN_KEY = 'omerta:screen'

const loadScreen = (): OpenRoom | null => {
  try {
    const raw = localStorage.getItem(SCREEN_KEY)
    if (raw === null) return null
    const parsed = JSON.parse(raw) as Partial<OpenRoom>
    if (typeof parsed.code !== 'string' || typeof parsed.relay !== 'string') return null
    return { code: parsed.code, relay: parsed.relay }
  } catch {
    return null
  }
}

const saveScreen = (room: OpenRoom | null): void => {
  try {
    if (room === null) localStorage.removeItem(SCREEN_KEY)
    else localStorage.setItem(SCREEN_KEY, JSON.stringify(room))
  } catch {
    // Private mode: the room holds until the page closes.
  }
}

const fragment = parseFragment(location.hash)
/** With a room in the address this is somebody else's room; without, the screen's own. */
const own = fragment.room === null
const relay = own ? loadRelay() : fragment.relay

let room: OpenRoom | null = own ? loadScreen() : { code: fragment.room ?? '', relay }
let projection: TvProjection | null = null
let status: LinkStatus = 'connecting'
/** The relay did not answer a request for a room; the screen keeps asking. */
let relayDown = false
const fallback: Locale = detectLocale(navigator.languages ?? [navigator.language])

const render = (): void => {
  const locale = projection?.locale ?? fallback
  const t = strings(locale).ui.tv
  document.documentElement.lang = locale
  document.documentElement.dataset['phase'] = projection?.phase ?? 'setup'

  let body: string
  if (relay === '' || (!own && status === 'gone')) {
    body = `<section class="screen screen--center"><h1 class="title title--sm">${esc(t.noRoom)}</h1></section>`
  } else if (room === null) {
    // Asking the relay for a room: the wordmark and one line, nothing to read yet.
    body = `
      <section class="screen screen--center">
        <p class="label">${esc(t.title)}</p>
        <p class="subtitle">${esc(relayDown ? t.relayDown : t.reconnecting)}</p>
      </section>`
  } else if (projection === null) {
    // No narrator on the room yet: the same lobby the claim will fill.
    const note = status === 'open' ? undefined : status === 'connecting' ? t.reconnecting : relayDown ? t.relayDown : t.reconnecting
    body = lobbyMarkup(
      { code: room.code, join: seatUrl(room, location.origin), roster: null, ...(note === undefined ? {} : { note }) },
      false,
      locale,
    )
  } else {
    body = tableMarkup(withClock(projection), false)
  }

  root.innerHTML = `
    <main class="stage stage--tv">${body}</main>
    ${projection !== null && status !== 'open' ? `<p class="tv__status">${esc(t.reconnecting)}</p>` : ''}
  `
  keepAwake()
}

/** The clock counts down here: the phone publishes the deadline, not every second. */
const withClock = (p: TvProjection): TvProjection => {
  if (p.timer === null || p.timer.endsAt === null) return p
  const seconds = Math.max(0, Math.ceil((p.timer.endsAt - Date.now()) / 1000))
  return { ...p, timer: { ...p.timer, seconds, phase: seconds === 0 ? 'done' : 'running' } }
}

// ---- The room ---------------------------------------------------------------

const connect = (r: OpenRoom): void => {
  new ScreenLink(
    r.relay,
    r.code,
    (next) => {
      projection = next
      render()
    },
    (next) => {
      status = next
      // The room is gone (never claimed in time, or the relay forgot it):
      // a screen that opened it just opens another; a second screen says so.
      if (next === 'gone' && own) {
        room = null
        projection = null
        saveScreen(null)
        render()
        void open(0)
        return
      }
      render()
    },
  )
}

/** Asks the relay for a room, and keeps asking with backoff while it does not answer. */
const open = async (attempt: number): Promise<void> => {
  try {
    const fresh = await requestRoom(relay)
    relayDown = false
    room = fresh
    saveScreen(fresh)
    status = 'connecting'
    render()
    connect(fresh)
  } catch {
    relayDown = true
    render()
    setTimeout(() => void open(attempt + 1), Math.min(30_000, 1_000 * 2 ** Math.min(attempt, 5)))
  }
}

// ---- The screen stays lit ---------------------------------------------------
// A tablet propped up as the table's screen must not go dark between rounds.

let wakeLock: WakeLockSentinel | null = null

const keepAwake = (): void => {
  if (document.hidden || !('wakeLock' in navigator)) return
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

document.addEventListener('visibilitychange', () => {
  if (!document.hidden) keepAwake()
})

// Repaint the digits while a clock runs; nothing else on the screen moves.
window.setInterval(() => {
  if (projection?.timer?.endsAt == null) return
  const digits = root.querySelector('[data-timer-digits]')
  if (!digits) return
  const seconds = Math.max(0, Math.ceil((projection.timer.endsAt - Date.now()) / 1000))
  const text = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
  if (digits.textContent !== text) digits.textContent = text
}, 250)

render()
if (relay !== '') {
  if (room !== null) connect(room)
  else void open(0)
}
