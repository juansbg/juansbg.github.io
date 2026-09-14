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
/** Whether a narrator's phone is on the room right now; the relay says so. */
let narratorHere = false
/**
 * When a projection last arrived, and whether this screen has ever been
 * connected at all.
 *
 * The relay's `narrator` message is the truth about presence, but it does not
 * always arrive in order: a Durable Object that has gone to sleep delivers a
 * dead socket's `here: false` whenever the room next wakes for some other
 * reason, which can be long after the current narrator's `here: true`.
 * Measured twice during entirely ordinary play -- over the dawn reading and
 * over a half-counted ballot -- both on frames whose projection had just
 * arrived from the very narrator the room was being told had gone.
 *
 * A projection can only have been published by a narrator's phone, so its
 * arrival is first-hand proof of presence and outranks a `here: false` that
 * is older than it.
 */
let lastProjection = 0
/** A first connection is not a re-connection, and must not say it is. */
let everOpen = false
/** How recent a projection has to be to contradict a `here: false`. */
const PRESENCE_MS = 6_000
/** Whether one ever has been: a room waiting to be started reads differently. */
let narratorEver = false
/**
 * When the screen stopped being able to reach anybody. A two-second hiccup
 * and a two-minute outage used to read identically, so a room had no way to
 * tell "still trying" from "stuck" (docs/BIG-SCREEN.md §12.6).
 */
let waitingSince: number | null = null
/** How long a wait has to run before the screen mentions it. */
const LONG_WAIT_MS = 9_000
let waitTimer: number | null = null
const fallback: Locale = detectLocale(navigator.languages ?? [navigator.language])

/**
 * The scene on screen right now, coarse enough to ignore a tally tick or a
 * reconnect flicker but not a name joining, a slide turning, an edition
 * opening or the game ending — the things a person on the couch reads as
 * "something happened", not "the same thing redrawn". Compared against the
 * last render to decide whether this one enters (`data-enter`, the same
 * convention `app.ts` uses on the narrator's own screen): the TV gets no
 * entrances at all otherwise, since nothing here ever sets that attribute
 * on its own the way a tap does there.
 */
const sceneKey = (): string => {
  if (relay === '' || (!own && status === 'gone')) return 'error'
  if (room === null) return 'connecting'
  if (projection === null) return 'unclaimed'
  const p = projection
  if (p.phase === 'setup') return `lobby:${p.roster.map((r) => `${r.name}:${r.joined}`).join(',')}`
  if (p.paper !== null) return `paper:${p.paper}`
  if (p.reading !== null) return `reading:${p.reading.kind}:${p.reading.index}`
  // The night step: plain numbers, so a step taken changes the scene even
  // though nothing else on the room's screen is allowed to (tv-01) — the
  // ring itself, and the step's own count in its centre, enter afresh.
  const step = p.nightStep ? `${p.nightStep.index}/${p.nightStep.of}` : '-'
  return `table:${p.phase}:${p.night}:${p.day}:${p.over}:${step}`
}
let lastScene: string | null = null

/**
 * A hand going up used to replace itself with no motion at all — the room
 * had no way to notice a vote landed. This is separate from `sceneKey`
 * (which also gates the whole ring's own entrance) on purpose: re-entering
 * every seat each time one hand goes up would be busy, not quiet, so only
 * the cast mark itself gets the cue, via its own attribute.
 */
const voteKey = (): string | null => {
  const p = projection
  if (p === null || p.phase !== 'day') return null
  return p.players
    .filter((s) => s.voted)
    .map((s) => s.id)
    .join(',')
}
let lastVoteKey: string | null = null

const render = (): void => {
  const locale = projection?.locale ?? fallback
  const t = strings(locale).ui.tv
  document.documentElement.lang = locale
  document.documentElement.dataset['phase'] = projection?.phase ?? 'setup'
  // A television switched on cold has never been connected to anything, so
  // "Reconnecting..." is the first word it shows and reads as a fault.
  const trying = everOpen ? t.reconnecting : t.connecting

  let body: string
  if (relay === '' || (!own && status === 'gone')) {
    body = `<section class="screen screen--center"><h1 class="title title--sm">${esc(t.noRoom)}</h1></section>`
  } else if (room === null) {
    // Asking the relay for a room: the wordmark and one line, nothing to read yet.
    body = `
      <section class="screen screen--center">
        <p class="label">${esc(t.title)}</p>
        <p class="subtitle">${esc(relayDown ? t.relayDown : trying)}</p>
      </section>`
  } else if (projection === null) {
    // No narrator on the room yet: the same lobby the claim will fill.
    const note = status === 'open' ? undefined : status === 'connecting' ? trying : relayDown ? t.relayDown : trying
    body = lobbyMarkup(
      { code: room.code, join: seatUrl(room, location.origin), roster: null, ...(note === undefined ? {} : { note }) },
      false,
      locale,
    )
  } else {
    body = tableMarkup(withClock(projection), false)
  }

  // One line along the bottom for anything the room should know that the game
  // itself does not say: the relay dropped, or the narrator's phone has gone
  // quiet. The table stays up behind it — nothing here is an error.
  // Is anything wrong at all? A room that is waiting starts a clock, so the
  // line can grow a second sentence once the wait stops being ordinary.
  const waiting = status !== 'open' && status !== 'ended'
  if (waiting && waitingSince === null) waitingSince = Date.now()
  if (!waiting) waitingSince = null
  const longWait = waitingSince !== null && Date.now() - waitingSince > LONG_WAIT_MS
  if (waitTimer !== null) window.clearTimeout(waitTimer)
  waitTimer = waiting && !longWait ? window.setTimeout(render, LONG_WAIT_MS + 200) : null

  const note =
    status === 'ended'
      ? t.ended
      : waiting && longWait
        ? `${relayDown ? t.relayDown : trying} ${t.stillTrying}`
        : projection !== null && status !== 'open'
          ? trying
          : projection !== null && !narratorHere
            ? narratorEver
              ? t.narratorGone
              : t.narratorYet
            : ''

  const scene = sceneKey()
  const entering = scene !== lastScene
  lastScene = scene

  const vote = voteKey()
  const voteEntering = vote !== null && vote !== lastVoteKey
  lastVoteKey = vote

  root.innerHTML = `
    <main class="stage stage--tv"${entering ? ' data-enter' : ''}${voteEntering ? ' data-vote-enter' : ''}>${body}</main>
    ${note === '' ? '' : `<p class="tv__status">${esc(note)}</p>`}
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
      // First-hand: only a narrator's phone publishes one.
      lastProjection = Date.now()
      narratorHere = true
      narratorEver = true
      render()
    },
    (next) => {
      status = next
      if (next === 'open') everOpen = true
      // The narrator closed the room: a screen that opened its own asks for
      // another so the next game can start; one that joined says the evening
      // is over rather than hunting for a room that has gone.
      if (next === 'ended') {
        narratorHere = false
        if (own) {
          room = null
          projection = null
          saveScreen(null)
          render()
          void open(0)
          return
        }
      }
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
    (here) => {
      // A `here: false` the room has just disproved by publishing is a late
      // message about a socket that is already gone, not news about this one.
      if (!here && Date.now() - lastProjection < PRESENCE_MS) return
      narratorHere = here
      if (here) narratorEver = true
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
