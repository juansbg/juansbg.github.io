import { ROLES, isRoleId, type RoleId } from '../engine/roles'
import {
  advance,
  assignTrades,
  canUndo,
  canVote,
  castVote,
  createGame,
  currentStep,
  endNight,
  hunterShot,
  isNightComplete,
  lynch,
  newSession,
  recordAction,
  startNight,
  undo,
  revertTo,
  swapSeats,
  moveSeat,
  winner,
  withdrawVote,
  type PlayerSetup,
  type Session,
  type TimelineEntry,
} from '../engine/state'
import type { NightAction, PlayerId } from '../engine/types'
import { detectLocale, strings } from '../i18n'
import { accentOf } from './accent'
import { bindSheetDrag, buzz, esc, markEdges, on, swap } from './dom'
import { sound, unlockOnGesture } from './sound'
import { clear, clearRoster, clearStats, forgetGame, load, loadRoster, loadStats, loadTimer, recordGame, save, saveRoster, saveTimer, type AppState } from './store'
import { statsMarkup } from './screens/stats'
import { summarise } from '../engine/summary'
import { editorMarkup, MAX_PLAYERS, MIN_PLAYERS, namesMarkup, rosterMarkup, type ScreenJoin } from './screens/setup'
import { dealRoles, systemRandom, type Complexity } from '../engine/deal'
import { askCardMarkup, dayMarkup, inspectionMarkup, nightMarkup, playerViewMarkup, questionCardMarkup, questionsIntroMarkup } from './screens/night'
import { countOrder } from './screens/vote'
import { dawnMarkup, dawnSlides, verdictSlides, winnerSlide, type Reading, type Slide } from './screens/dawn'
import { tableMarkup } from './screens/table'
import { tvProjection, type TvProjection } from '../room/projections'
import {
  NarratorLink,
  RelayRefused,
  loadRelay,
  loadRoom,
  loadRoomKey,
  normalizeRelay,
  openRoom,
  claimRoom,
  screenUrl,
  saveRelay,
  saveRoom,
  saveRoomKey,
  seatUrl,
  tvUrl,
  type FromRelay,
  type LinkStatus,
  type Room,
} from '../room/client'
import { makeKeys, seal, sharedKey, type KeyPair } from '../room/crypto'
import { seatProjection, waitingSeat, type SeatProjection } from '../room/projections'
import { acceptAction, acceptMark } from '../room/actions'
import { timelineMarkup, type Notice } from './screens/timeline'
import { fitTables } from './screens/circle'
import { dailyMarkup, edition, paperMarkup, sharePaper, type ShareResult } from './screens/paper'
import {
  TIMER_LENGTHS,
  formatClock,
  freshTimer,
  isRunning,
  pauseTimer,
  remaining,
  resetTimer,
  toggleTimer,
  viewOf,
  withLength,
  type Timer,
} from './screens/timer'
import { bindHold, revealMarkup, roleCardMarkup, type RevealPhase } from './screens/reveal'

const appRoot = document.querySelector<HTMLDivElement>('#app')
if (!appRoot) throw new Error('#app not found')
const root: HTMLDivElement = appRoot

let state: AppState = boot()
/** Local to the reveal screen; never persisted — a held role must not resume. */
let revealPhase: RevealPhase = 'handoff'
/** Which way the phone last moved, so the next name arrives from that side. */
let revealDir: 'next' | 'back' = 'next'
let editing: PlayerId | null = null
let picking = false
/** Players chosen at the current night step, before the action is recorded. */
let picked: PlayerId[] = []
/** Chosen difficulty for auto-dealing. */
let complexity: Complexity = 'standard'
/** Names on the entry screen. Seeded from the last game's roster. */
let names: string[] = loadRoster()
/** Rearrange mode on the roster: the first tapped seat waits for its partner. */
let rearranging = false
let armedSeat: PlayerId | null = null
/** The player whose card is being held up for the detective to read. */
let inspecting: PlayerId | null = null
/**
 * The phone is turned to the player whose step it is. Local and never
 * persisted: a reload comes back on the narrator's side of the screen.
 */
let showingPlayer = false
/** The narrator has asked to see roles and colours on this night step. */
let peeking = false
let showingLog = false
/**
 * The screen is turned to the whole room: the seating plan with the public
 * overlays, from the same projection a TV would get. Local, never persisted,
 * and the bar goes with it because the town can see the screen.
 */
let tableView = false
/**
 * The room on the relay, when one is open: a TV joins it with the code and
 * receives the same projection the table view renders, after every paint.
 * The room survives a reload (`omerta:room`); the socket does not, so the
 * link is rebuilt at boot. Nothing secret is ever published: see projections.ts.
 */
let room: Room | null = loadRoom()
let link: NarratorLink | null = null
/** The room sheet is up. */
let roomOpen = false
let roomStatus: LinkStatus = 'closed'
/** Screens on the room, as the relay reports them. */
let tvs = 0
let roomBusy = false
/** Why the last attempt failed: the relay refused the key, knows no such room, or did not answer. */
let roomError: 'key' | 'relay' | 'room' | null = null
/**
 * What is typed in the code and key fields right now.
 *
 * The screen is rebuilt on every paint, and a refused claim repainted it, so
 * both boxes came back empty — a narrator who had the five letters right and
 * only fumbled the key retyped the lot in front of the table. These carry
 * what was typed; only the field the relay actually rejected is cleared.
 */
let screenCode = ''
let screenKey = ''
/** Whether the narrator has asked for the code and key fields. */
let screenFormOpen = false

/**
 * A player who joined from their own phone: a name they typed, the public
 * half of their key, the seat they were given by name, and what they were
 * last sent so nothing is sealed twice. Lives in memory only: after a reload
 * the phone says hello with a new key and every player joins again.
 */
interface Guest {
  name: string
  pub: string
  key: CryptoKey | null
  seat: PlayerId | null
  /**
   * The relay says this phone's last socket has closed: a dead battery, a
   * closed tab. The seat is held against the name rather than the phone, so
   * the same person coming back on any phone lands in it, and nobody else
   * counts it as taken.
   */
  gone: boolean
  lastSent: string | null
  /** Seals for this guest go out in order. */
  queue: Promise<void>
}
const guests = new Map<string, Guest>()
/** This phone's half of the key exchange, made once per page load. */
let narratorKeys: KeyPair | null = null
/**
 * The ballot: sealed until the narrator taps Reveal, and then the count
 * comes up on the room's screen one ballot at a time (`countUp` in
 * screens/vote.ts), at a beat this phone keeps. `shown` is how many are up,
 * null while sealed; every move that leaves the day seals it again.
 */
let shown: number | null = null
let countBeat: number | null = null
const COUNT_BEAT_MS = 900

const stopCount = (): void => {
  if (countBeat !== null) window.clearInterval(countBeat)
  countBeat = null
  shown = null
}

const sameName = (a: string, b: string): boolean => a.trim().toLowerCase() === b.trim().toLowerCase()

/** Seats given to other guests whose phones are still in the room. */
const takenSeats = (except: string): Set<PlayerId> =>
  new Set(
    [...guests.entries()]
      .filter(([cid, g]) => cid !== except && g.seat !== null && !g.gone)
      .map(([, g]) => g.seat as PlayerId),
  )

/** Seats with a phone on them: the pass-around can skip those. A phone that has gone does not count. */
const seatedFromPhones = (): Set<PlayerId> =>
  new Set(
    [...guests.values()].filter((g) => g.seat !== null && g.key !== null && !g.gone).map((g) => g.seat as PlayerId),
  )

/**
 * Finds a guest a seat by name. While the roster is still names, a matching
 * name takes that seat and a new one is added to the list; once the game has
 * players, only a matching, unclaimed name will do — the narrator seats
 * strangers by hand.
 */
function claimSeat(cid: string, name: string): PlayerId | null {
  const taken = takenSeats(cid)
  const game = state.session.current
  if (state.screen === 'setup' && game.players.length === 0) {
    const match = names.findIndex((n, i) => sameName(n, name) && !taken.has(i))
    if (match !== -1) return match
    // A name somebody else's phone already holds is refused rather than given
    // a seat of its own. It used to be appended, so a QR scanned twice, or a
    // friend retyping a name they thought had not gone through, quietly grew
    // the roster: six names, five people, and a role dealt to nobody. This is
    // what the same claim has always done once the game has players; setup is
    // no different, and the phone is told which door it is (`refusal`).
    if (names.some((n) => sameName(n, name))) return null
    if (names.length >= MAX_PLAYERS) return null
    names = [...names, name.trim()]
    saveRoster(names)
    return names.length - 1
  }
  const player = game.players.find((p) => sameName(p.name, name) && !taken.has(p.id))
  return player ? player.id : null
}

/**
 * The phones turned away at the door, and who has already been logged.
 *
 * A refusal reached every device except the one that could do anything about
 * it: the narrator is reading the night aloud, somebody's phone says there is
 * no seat for that name, and nothing on the narrator's screen ever mentions
 * it. These are the timeline's quiet lines. They are not game moves, so they
 * are not session history and carry no rewind — and a phone that keeps
 * retrying, or a reconnect that replays the room's guests, writes one line,
 * not twenty.
 */
let notices: Notice[] = []
const turnedAway = new Set<string>()

/** Why the door said no, in the words the narrator needs. */
function refusal(name: string): Notice['reason'] {
  const game = state.session.current
  if (state.screen === 'setup' && game.players.length === 0) {
    return names.some((n) => sameName(n, name)) ? 'nameTaken' : 'tableFull'
  }
  const answers = game.players.some((p) => sameName(p.name, name))
  return answers ? 'nameTaken' : 'notOnList'
}

async function admit(cid: string, name: string, pub: string): Promise<void> {
  const existing = guests.get(cid)
  const key = narratorKeys === null ? null : await sharedKey(narratorKeys.privateKey, pub)
  const seat = existing?.seat !== null && existing !== undefined && existing.seat !== null && sameName(existing.name, name)
    ? existing.seat
    : claimSeat(cid, name)
  // Whoever held this seat and has gone hands it over: the same person is
  // back on another phone, and one seat must never answer to two guests.
  if (seat !== null) {
    for (const [other, g] of guests) {
      if (other !== cid && g.seat === seat && g.gone) guests.delete(other)
    }
  }
  if (seat === null) {
    const once = `${cid}|${name.trim().toLowerCase()}`
    if (!turnedAway.has(once)) {
      turnedAway.add(once)
      notices = [
        ...notices,
        { night: state.session.current.night, at: state.session.timeline.length, name: name.trim(), reason: refusal(name) },
      ]
    }
  }
  guests.set(cid, { name: name.trim(), pub, key, seat, gone: false, lastSent: null, queue: existing?.queue ?? Promise.resolve() })
  setState({}, false)
}

function handleRoomMessage(message: FromRelay): void {
  switch (message.kind) {
    case 'tvs':
      tvs = message.count
      break
    case 'present':
      tvs = message.tvs
      // The phones that scanned before this socket was up, joins and all.
      for (const p of message.players) void admit(p.cid, p.name, p.pub)
      break
    case 'join':
      void admit(message.cid, message.name, message.pub)
      return
    case 'left': {
      // The phone has gone, not the player: the seat waits for them under
      // their own name, on this phone or the next one.
      const guest = guests.get(message.cid)
      if (guest === undefined) return
      guests.set(message.cid, { ...guest, gone: true })
      setState({}, false)
      return
    }
    case 'vote': {
      const guest = guests.get(message.cid)
      const game = state.session.current
      if (!guest || guest.seat === null || state.screen !== 'day' || !canVote(game, guest.seat)) return
      const voter = guest.seat
      if (message.target === null) {
        if (!game.votes.some((v) => v.voter === voter)) return
        mutate((s) => withdrawVote(s, voter), { night: game.night, kind: 'vote', voter })
      } else {
        const target = message.target
        const ok = game.players.some((p) => p.id === target && p.alive) && target !== voter
        if (!ok) return
        mutate((s) => castVote(s, voter, target), { night: game.night, kind: 'vote', voter, target })
      }
      return
    }
    // The night from a phone (docs/BIG-SCREEN.md §10): the mark is a
    // proposal the acting seats share, the act is the tap the narrator would
    // have made, checked against the game before it is recorded. A refusal
    // sends the phone its unchanged step again, so it never believes a tap
    // that did not land.
    case 'mark': {
      const guest = guests.get(message.cid)
      if (!guest || guest.seat === null || state.screen !== 'night') return
      const next = acceptMark(state.session.current, guest.seat, message.target)
      if (next === null) {
        guest.lastSent = null
        publishSeats()
        return
      }
      picked = next
      setState({}, false)
      return
    }
    case 'act': {
      const guest = guests.get(message.cid)
      const game = state.session.current
      if (!guest || guest.seat === null || state.screen !== 'night') return
      const action = acceptAction(game, guest.seat, message.action)
      if (action === null) {
        guest.lastSent = null
        publishSeats()
        return
      }
      picked = []
      buzz()
      sound.tick()
      mutate((s) => recordAction(s, action), { night: game.night, kind: 'action', roleId: action.roleId, action })
      return
    }
  }
  // The sheet and the names screen both show who is on the room.
  if (roomOpen || state.screen === 'setup') setState({}, false)
}

function connectRoom(): void {
  if (room === null) return
  link?.close()
  if (narratorKeys === null) {
    void makeKeys().then((keys) => {
      narratorKeys = keys
      link?.send({ kind: 'hello', pub: keys.pub })
    })
  }
  link = new NarratorLink(room, {
    onStatus: (status) => {
      roomStatus = status
      // Every fresh socket says hello, so a player who connected first can key up.
      if (status === 'open' && narratorKeys !== null) link?.send({ kind: 'hello', pub: narratorKeys.pub })
      // A repaint only when the room's sheet was open meant the one status
      // that changes what this phone *is* — replaced, another phone runs the
      // game now — reached no screen at all unless the narrator happened to
      // have the sheet up. The stage carries that one itself.
      if (roomOpen || status === 'replaced') setState({}, false)
    },
    onMessage: handleRoomMessage,
  })
}

/**
 * The big screen's block on the names screen: the room this phone runs, or
 * the field for the code a TV shows. Nothing when no relay is configured.
 */
function screenJoin(): ScreenJoin | null {
  const relay = loadRelay()
  if (relay === '') return null
  return {
    room: room === null ? null : { code: room.code, tvs, phones: seatedFromPhones().size },
    needsKey: loadRoomKey() === '' || roomError === 'key',
    busy: roomBusy,
    error: roomError,
    code: screenCode,
    key: screenKey,
    // Unfolded once the narrator asks for it, and kept unfolded while
    // anything is typed or the relay has said no, so a refusal never folds
    // the fields away from under the person fixing them.
    open: screenFormOpen || roomError !== null || screenCode !== '' || screenKey !== '',
    address: screenUrl(location.origin).replace(/^https?:\/\//, ''),
  }
}

/**
 * What one guest should see now, or a refusal if they have no seat.
 *
 * The refusal carries why. The reason is only knowable here — the phone knows
 * the name it typed and nothing else about the table — so without it the
 * phone could not tell "nobody of that name" from "that name is already on
 * another phone" even in principle, and said the one thing for both. It is
 * the same three cases the narrator's timeline names.
 */
function seatNow(guest: Guest): SeatProjection | { kind: 'refused'; reason: Notice['reason'] } {
  const no = (): { kind: 'refused'; reason: Notice['reason'] } =>
    ({ kind: 'refused', reason: refusal(guest.name) })
  if (guest.seat === null) return no()
  const game = state.session.current
  if (state.screen === 'setup' && game.players.length === 0) {
    return waitingSeat(guest.seat, names[guest.seat] ?? guest.name, state.locale, lobbyRoster())
  }
  return (
    seatProjection(game, guest.seat, state.locale, {
      dealt: state.screen !== 'setup',
      over: state.screen === 'over',
      roster: lobbyRoster(),
      // While the narrator reads, the phones wait with the room.
      reading: dawn !== null,
      picked,
      sealed: shown === null,
      ...(shown === null ? {} : { shown }),
    }) ?? no()
  )
}

function publishSeats(): void {
  if (link === null) return
  for (const [cid, guest] of guests) {
    const text = JSON.stringify(seatNow(guest))
    if (text === guest.lastSent) continue
    guest.lastSent = text
    guest.queue = guest.queue.then(async () => {
      if (guest.key === null) {
        if (narratorKeys === null) return
        guest.key = await sharedKey(narratorKeys.privateKey, guest.pub)
      }
      const payload = await seal(guest.key, text)
      if (!link?.send({ kind: 'player', cid, payload })) guest.lastSent = null
    })
  }
}

/** What the room sees right now: the table view and the TV render the same thing. */
/** The roster as the lobby shows it: names typed here or on a phone, marked once a phone holds the seat. */
function lobbyRoster(): { name: string; joined: boolean }[] {
  const seated = seatedFromPhones()
  const game = state.session.current
  return game.players.length === 0
    ? names.map((name, i) => ({ name, joined: seated.has(i) }))
    : game.players.map((p) => ({ name: p.name, joined: seated.has(p.id) }))
}

function projectionNow(): TvProjection {
  return tvProjection(state.session.current, state.locale, {
    over: state.screen === 'over',
    reading: dawn !== null ? { kind: dawnKind, index: dawn, slides: currentSlides() } : null,
    timer: state.screen === 'day' ? { ...viewOf(timer, Date.now()), endsAt: timer.endsAt } : null,
    sealed: shown === null,
    ...(shown === null ? {} : { shown }),
    join: room === null ? null : seatUrl(room, location.origin),
    roster: lobbyRoster(),
    // The TV shows the paper while the phone does.
    paper: paperOpen && state.screen === 'day' ? state.session.current.day : null,
  })
}

function publish(): void {
  if (link === null) return
  link.publish(projectionNow())
  publishSeats()
}

// A room's table is the people who join it. The names remembered from the
// last game are for an evening without phones; with a room open and no game
// yet, they would sit in the lobby as players nobody can find.
if (room !== null && state.screen === 'setup' && state.session.current.players.length === 0) names = []
if (room !== null) connectRoom()

/**
 * A new game in the same room: this phone forgets who sat where and says
 * hello with a fresh key, so every player's page joins again by name and the
 * lobby fills from the phones that are actually there.
 */
function rekeyRoom(): void {
  if (room === null) return
  guests.clear()
  narratorKeys = null
  void makeKeys().then((keys) => {
    narratorKeys = keys
    link?.send({ kind: 'hello', pub: keys.pub })
  })
}
/** The dawn slideshow: which slide is up, or null when the report is a list. */
let dawn: number | null = null
/**
 * The night ended on the Avenger's death: the slideshow waits for the shot,
 * so the town hears the whole morning at once.
 */
let showAfterShot: Reading | null = null
/** Which reading is up: the morning's, or the town's verdict. */
let dawnKind: Reading = 'dawn'
/**
 * The day's edition of the paper is up, full screen. Like a reading it is a
 * dead end with its own Done and no bar, because the phone may be facing
 * the town while it is read.
 */
let paperOpen = false
/** The ledger is up: the record of finished games, opened from ⋯. */
let statsOpen = false
/**
 * The reading on screen. A game that has just ended closes on one more
 * slide, the winning side's, so the room is told the game is over before the
 * paper arrives (docs/BIG-SCREEN.md; over-02). It rides in `reading` on the
 * projection like any other slide, so the TV and the phones mirror it.
 */
const currentSlides = (): Slide[] => {
  const game = state.session.current
  const slides = (dawnKind === 'verdict' ? verdictSlides : dawnSlides)(game, state.locale)
  const close = winnerSlide(game, state.locale)
  return close === null ? slides : [...slides, close]
}
/** The overflow sheet behind the ⋯ button. */
let menuOpen = false
/**
 * A destructive action waiting for a second tap. Native `window.confirm`
 * flashes a white system dialog, which in a dark room is a torch in the
 * face; this is the same question asked on our own sheet.
 */
type Pending = 'restart' | 'newTable' | 'clearNames' | 'finish' | 'clearStats' | 'nextNight' | 'roomNames'
let confirming: Pending | null = null
/**
 * The road into a room, held while the narrator is asked about the names.
 *
 * A room's table is whoever joins it, so both roads in empty a list typed for
 * an evening without phones — and they did it the moment the button was
 * tapped, with nothing said, while every other wipe in the app (Clear the
 * list, Restart, End the game) stops on the confirm sheet first. The fields
 * are read before the sheet replaces them, and the road runs on Yes.
 */
let roomRoad: { kind: 'open' | 'join'; a: string; b: string } | null = null

/** The browser's deferred install prompt, when it has offered one. */
let installPrompt: InstallPromptEvent | null = null
/**
 * The discussion clock. Its length is the narrator's preference and its
 * deadline is wall-clock time, so both come back after a reload; every new
 * day, verdict and night resets the count, never the length.
 */
let timer: Timer = loadTimer() ?? freshTimer()
/** The interval repainting the digits while the clock runs. */
let ticker: number | null = null
/** The paper is being drawn for the share sheet; the button waits. */
let sharing = false
/**
 * How long the share waits before it gives the button back. Long enough that
 * a real sheet is never cut short — it sits over the page anyway — and short
 * enough that a share which resolves neither way is not a dead end.
 */
const SHARE_TIMEOUT_MS = 10_000
/** No canvas to draw the paper on at all. */
let shareNotice = false
/** The paper as an image, shown where the browser has no share sheet for files. */
let paperShot: string | null = null
/**
 * Recording the town's vote: on or off, and the voter whose pick is awaited.
 * Off, a tap on a seat executes; on, it votes. Every move that leaves the
 * day turns it off.
 */
let voting = false
let voter: PlayerId | null = null

const closeShot = (): void => {
  if (paperShot !== null) URL.revokeObjectURL(paperShot)
  paperShot = null
}

/**
 * Puts away whatever sheet is up, and says whether there was one.
 *
 * The dimmed backdrop, a swipe on the sheet's handle and the Escape key are
 * the same gesture — "not this" — so they are the same function. For the seat
 * editor that is a cancel: nothing is saved until Save.
 */
const dismissSheets = (): boolean => {
  const up = menuOpen || showingLog || picking || editing !== null
    || confirming !== null || roomOpen || paperShot !== null
  if (!up) return false
  menuOpen = false
  showingLog = false
  picking = false
  editing = null
  confirming = null
  roomRoad = null
  roomOpen = false
  closeShot()
  return true
}

// A keyboard is not the narrator's phone, but a narrator running the game off
// a laptop at the end of the table has one, and Escape closing nothing is the
// sort of thing that reads as a page that has not been finished.
window.addEventListener('keydown', (event) => {
  if (event.key !== 'Escape') return
  if (dismissSheets()) setState({}, false)
})

const leaveDay = (): void => {
  voting = false
  voter = null
  stopCount()
  setTimer(resetTimer(timer))
}

const setTimer = (next: Timer): void => {
  timer = next
  saveTimer(timer)
}

interface InstallPromptEvent extends Event {
  prompt(): Promise<void>
}

// Audio cannot start outside a gesture; the first tap opens it and later
// ones wake it after iOS has put it to sleep.
unlockOnGesture()

// The room a table has changes with the viewport (a rotation, the keyboard
// bar, a split view), not only with a paint: watch the root's box and let
// the circle fall back to rows, or come back, as it does.
const refit = (): void => {
  fitTables(root)
  markEdges(root)
}
window.addEventListener('resize', refit)
if (typeof ResizeObserver !== 'undefined') new ResizeObserver(refit).observe(root)

window.addEventListener('beforeinstallprompt', (event) => {
  event.preventDefault()
  installPrompt = event as InstallPromptEvent
})
window.addEventListener('appinstalled', () => {
  installPrompt = null
  menuOpen = false
  setState({}, false)
})
/**
 * The questions round: players who flagged a question during the reveal get
 * their role explained privately, one at a time, before night one — and any
 * time from the day screen. `asking` is the card on screen; the queue is who
 * is still waiting; `askReturnTo` is where Done goes when the queue empties.
 */
let asking: PlayerId | null = null
let askQueue: PlayerId[] = []
let askReturnTo: 'firstNight' | 'day' = 'day'
let askIntro = false
/** How many were in the round when it started, so "2 of 2" stays "of 2". */
let askTotal = 0
let releaseHandler: (() => void) | null = null

function boot(): AppState {
  const saved = load()
  const locale = saved?.locale ?? detectLocale(navigator.languages ?? [navigator.language])

  if (saved) {
    return {
      session: saved.session,
      locale,
      // A reveal is never resumed mid-hold; fall back to its handoff state.
      screen: saved.screen,
      revealIndex: saved.revealIndex,
      revealMode: 'onboarding',
      revealReturnTo: 'night',
      layout: saved.layout,
    }
  }

  return {
    session: newSession(createGame([])),
    locale,
    screen: 'setup',
    revealIndex: 0,
    revealMode: 'onboarding',
    revealReturnTo: 'night',
    layout: 'circle',
  }
}

/**
 * How a change reaches the screen.
 *
 * 'transition' cross-fades the whole page through a View Transition, which is
 * right for arriving somewhere new — the deal, the night, the morning.
 *
 * 'enter' paints at once and lets the entrance animations play. The page is
 * rebuilt inside the tap that asked for it, so the controls that replace the
 * ones just tapped are live before the finger is off the glass. That matters
 * for the night: the transition's snapshots sit over the document for 150ms,
 * and a narrator tapping through a run of quiet steps ("no one, no one, no
 * one") lost the second tap of any pair inside that window — it landed on a
 * page that was on its way out, bound to the step that had already been
 * answered. A cross-fade between two step cards that differ by a name was
 * never worth a dead window on the app's fastest control.
 *
 * 'still' repaints the same scene with nothing moving: a pick, a toggle, a
 * sheet.
 */
type Paint = 'transition' | 'enter' | 'still'

const setState = (patch: Partial<AppState>, paint: Paint | boolean = 'transition'): void => {
  const how: Paint = paint === true ? 'transition' : paint === false ? 'still' : paint
  state = { ...state, ...patch }
  save(state)
  if (how === 'transition') swap(() => render(true))
  else render(how === 'enter')
}

const mutate = (
  change: Parameters<typeof advance>[1],
  entry?: TimelineEntry,
): void => {
  // Any move belongs to the narrator, so the phone comes back to them — and
  // the next step starts safe to turn around again.
  showingPlayer = false
  peeking = false
  // Painted inside the tap, not across a transition: see `Paint`.
  setState({ session: advance(state.session, change, entry) }, 'enter')
}

// ---------------------------------------------------------------------------
// Render
// ---------------------------------------------------------------------------

/**
 * `entering` marks a scene arriving — a step, a screen, a move — and lets the
 * entrance animations play. A repaint of the same scene (a pick, the menu,
 * a toggle) rebuilds the same DOM, and without the mark every seat would
 * bounce into place again on every tap.
 */
/** The seed of the game whose ending is already in the record, so a repaint does not write it again. */
let recordedGame: number | null = null

/** Which sheets were up on the last paint, so an open one is not re-animated. */
let sheetsUp = ''

function render(entering = false): void {
  const game = state.session.current
  // The record across games: a finished game is written once, by its seed,
  // and taken back out if the narrator rewinds past the ending. A last day
  // played differently replaces the earlier ending rather than counting
  // twice, since a game is known by its seed.
  if (state.screen !== 'over') {
    // Rewound past the ending: the game did not end that way after all, so
    // the record lets it go until it ends again. Only this game — a new
    // table is a different seed, and its predecessor's ending stands.
    if (recordedGame !== null && game.seed === recordedGame && summarise(game, Date.now()) === null) {
      forgetGame(recordedGame)
    }
    recordedGame = null
  } else if (game.seed !== recordedGame) {
    const summary = summarise(game, Date.now())
    if (summary !== null) {
      recordGame(summary)
      recordedGame = game.seed
    }
  }
  const t = strings(state.locale)
  document.documentElement.lang = state.locale
  document.documentElement.dataset.phase =
    state.screen === 'night' ? 'night' : state.screen === 'day' ? 'day' : 'neutral'
  // The wind and the drone under the whole night, off with the morning.
  sound.night(state.screen === 'night')

  // The slideshow only exists on the day screen; anything that leaves it
  // (undo, rewind, next night, restart) drops the slide with it.
  if (state.screen !== 'day' || game.awaitingHunterShot !== null) {
    dawn = null
    paperOpen = false
  }
  const slides = dawn === null ? [] : currentSlides()
  const slide = dawn === null ? null : slides[Math.min(dawn, slides.length - 1)] ?? null
  if (slide) document.documentElement.dataset.dawn = slide.lethal ? 'lethal' : 'calm'
  else delete document.documentElement.dataset.dawn

  releaseHandler?.()
  releaseHandler = null

  let body: string
  let sheets = ''

  const askingPlayer = game.players.find((p) => p.id === asking)
  const flaggedNow = game.players.filter((p) => p.alive && p.hasQuestion)

  if (askingPlayer) {
    const total = askReturnTo === 'firstNight' ? askTotal : null
    const position = total === null ? null : total - askQueue.length
    body = questionCardMarkup(askingPlayer, state.locale, position, total)
  } else if (askIntro && flaggedNow.length > 0) {
    body = questionsIntroMarkup(flaggedNow, state.locale)
  } else if (statsOpen) {
    body = statsMarkup(loadStats(), state.locale, names)
  } else if (tableView) {
    // The room's screen wins over every screen of the narrator's, the lobby included.
    body = tableMarkup(projectionNow())
  } else if (state.screen === 'setup') {
    body = game.players.length === 0
      ? namesMarkup(names, state.locale, seatedFromPhones(), screenJoin())
      : rosterMarkup(game.players, state.locale, complexity, rearranging, armedSeat)
    if (editing !== null) {
      const player = game.players.find((p) => p.id === editing)
      if (player) sheets += editorMarkup(player, state.locale)
    }
  } else if (state.screen === 'reveal') {
    const order = revealOrder()
    const player = order[state.revealIndex]
    body = player
      ? revealMarkup({
          player,
          position: state.revealMode === 'onboarding' ? state.revealIndex + 1 : null,
          total: state.revealMode === 'onboarding' ? order.length : null,
          phase: revealPhase,
          locale: state.locale,
          mode: state.revealMode,
          canGoBack: state.revealMode === 'onboarding' && state.revealIndex > 0,
          seen: held.has(player.id),
          dir: revealDir,
        })
      : revealDoneMarkup()
  } else if (state.screen === 'night') {
    const subject = game.players.find((p) => p.id === inspecting)
    body = subject
      ? inspectionMarkup(subject, state.locale)
      : isNightComplete(game)
        ? nightDoneMarkup()
        : showingPlayer
          ? playerViewMarkup(game, state.locale, picked)
          : nightMarkup(game, state.locale, picked, state.layout, peeking, seatedFromPhones())
  } else if (state.screen === 'day') {
    body =
      game.awaitingHunterShot !== null
        ? hunterMarkup()
        : dawn !== null
          ? dawnMarkup(slides, dawn, game.night, state.locale, dawnKind)
          : paperOpen
            ? dailyMarkup(edition(game, game.day, state.locale), state.locale)
            : dayMarkup(
              game, state.locale, state.layout, peeking, viewOf(timer, Date.now()),
              voting ? { armed: voter } : null,
              {
                revealable: room !== null && game.votes.length > 0 && shown === null,
                count: shown === null ? null : { shown, total: countOrder(game).length },
              },
            )
    if (picking) sheets += pickerMarkup()
  } else {
    body = overMarkup()
  }

  // Sheets are fixed overlays, so they are siblings of the stage rather than
  // children of the screen: a screen mid-animation has a transform, which
  // would make it the containing block and pin the sheet inside it.
  let overlay = sheets
  if (showingLog) overlay += timelineMarkup(state.session, state.locale, notices)
  if (menuOpen) overlay += menuMarkup()
  if (roomOpen) overlay += roomMarkup()
  if (paperShot !== null) overlay += shotMarkup(paperShot)
  // Last, so it is on top: a question is asked about the sheet under it, and
  // a backdrop over the question would take the answer.
  if (confirming !== null) overlay += confirmMarkup(confirming)

  // A sheet slides up when it opens and then stays put. Every paint rebuilds
  // the whole document, so an open sheet replayed its entrance each time the
  // narrator touched a row inside it — which is most of what the menu is for.
  // The same sheets up as last paint means the sheet is already where it
  // belongs, so the entrance is switched off rather than replayed.
  const sheetKey = [
    editing !== null && 'edit',
    picking && 'pick',
    showingLog && 'log',
    menuOpen && 'menu',
    confirming !== null && `confirm:${confirming}`,
    roomOpen && 'room',
    paperShot !== null && 'shot',
  ].filter(Boolean).join('+')
  const settled = sheetKey !== '' && sheetKey === sheetsUp
  sheetsUp = sheetKey
  // Replaced, and the only place that said so was a sheet nobody opens
  // mid-game: this phone looked exactly as it had a second earlier, every
  // control answering taps that now reach nobody. The stage says it itself.
  const ousted =
    roomStatus === 'replaced' && !tableView && dawn === null && !paperOpen
      ? `<p class="stage-notice" data-replaced>${esc(t.ui.room.replaced)}</p>`
      : ''
  root.innerHTML = `<main class="stage${ousted === '' ? '' : ' stage--noticed'}"${entering ? ' data-enter' : ''}>${ousted}${body}</main>`
    + `<div class="sheets"${settled ? ' data-settled' : ''}>${overlay}</div>${chromeMarkup()}`
  bind()
  // A circle with no room for readable tiles becomes rows, before it is seen.
  fitTables(root)
  // ...and any region that ends up scrolling says so at the edge it clips.
  markEdges(root)
  // The handle every sheet wears means what it says.
  bindSheetDrag(root, () => {
    if (dismissSheets()) {
      buzz()
      setState({}, false)
    }
  })
  syncTicker()
  // The TV follows every paint; the link sends one message per frame at most.
  publish()

  /**
   * The end of the pass-around, saying only what the app can know.
   *
   * It used to claim "everyone has seen their role", which is a guess: the
   * phone can be tapped through every seat without a single hold, and a seat
   * with its own phone may never have looked at all. What it knows is which
   * seats held their card on this device (`held`), so that is what it shows —
   * a tick against those, "on their phone" against the rest — and the
   * narrator can read the unmarked names aloud before starting the night.
   * Begin stays enabled either way: whether to wait is the narrator's call.
   */
  function revealDoneMarkup(): string {
    const phones = seatedFromPhones()
    const rows = game.players
      .map((p) => {
        const onPhone = phones.has(p.id)
        const seen = held.has(p.id)
        return `<li class="dealt__row"${seen ? ' data-seen' : ''}${onPhone ? ' data-phone' : ''}>
          <span class="dealt__name">${esc(p.name)}</span>
          ${
            onPhone
              ? `<span class="dealt__note">${esc(t.ui.table.onPhone)}</span>`
              : seen
                ? `<span class="dealt__mark" aria-label="${esc(t.ui.reveal.seenCard)}">✓</span>`
                : ''
          }
        </li>`
      })
      .join('')
    const passed = game.players.filter((p) => !phones.has(p.id))
    const seen = passed.filter((p) => held.has(p.id)).length
    // The list is in seat order and stays that way — it is how a narrator
    // refers to people out loud, and a list that reorders itself under
    // somebody reading from it is worse than one that scrolls. So the line
    // above carries the names instead: at a big table, or a mixed one where
    // the seats with phones take the top of the list, the ones still to look
    // are exactly what scrolls off, and this screen exists to read them out.
    const missing = passed.filter((p) => !held.has(p.id))
    // ...but only while they are the few. Once most of the table still has to
    // look, every name is on the list below anyway and spelling them all out
    // costs three lines of the height the list needs — at twelve it named the
    // whole room and pushed five seats off the bottom. Then the count is the
    // summary and the list is the detail, which is the way round it was.
    const nameThem = missing.length > 0 && missing.length <= Math.max(1, Math.floor(passed.length / 2))
    return `
      <section class="screen screen--center screen--dealt">
        <h1 class="title title--sm">${esc(t.ui.reveal.dealt)}</h1>
        ${passed.length === 0 ? '' : `<p class="label">${esc(
          nameThem
            ? t.ui.reveal.stillToLook(missing.map((p) => p.name))
            : t.ui.reveal.looked(seen, passed.length),
        )}</p>`}
        <ul class="dealt" style="--rows: ${game.players.length}">${rows}</ul>
        <button class="btn btn--primary" type="button" data-begin>${esc(t.ui.reveal.beginFirstNight)}</button>
      </section>
    `
  }

  function nightDoneMarkup(): string {
    return `
      <section class="screen screen--center">
        <h1 class="title">${esc(t.phase.nightFalls)}</h1>
        <p class="subtitle">${esc(t.phase.nightFallsBody)}</p>
        <button class="btn btn--primary" type="button" data-resolve>${esc(t.ui.night.endNight)}</button>
      </section>
    `
  }

  function hunterMarkup(): string {
    const shooter = game.players.find((p) => p.id === game.awaitingHunterShot)
    const targets = game.players
      .filter((p) => p.alive)
      .map((p) => `<button class="target" type="button" data-shoot="${p.id}">${esc(p.name)}</button>`)
      .join('')

    return `
      <section class="screen screen--day" data-accent="${accentOf('AVENGE')}">
        <h1 class="title title--sm">${esc(t.roles.AVENGE.name)}</h1>
        <p class="subtitle subtitle--sm">${esc(shooter?.name ?? '')} — ${esc(t.roles.AVENGE.prompt)}</p>
        <div class="table table--list"><div class="targets">${targets}</div></div>
      </section>
    `
  }

  function overMarkup(): string {
    // The whole game as a front page: the winner as the banner, every death
    // a headline, who was who, the record night by night. v1's finishGame
    // view, set as newsprint, and the same page goes out through Share.
    return `
      <section class="screen screen--over">
        <h1 class="title title--sm">${esc(t.ui.over.title)}</h1>
        ${paperMarkup(game, state.locale)}
        ${shareNotice ? `<p class="notice">${esc(t.ui.paper.cannotShare)}</p>` : ''}
        <div class="actions actions--row">
          <button class="btn btn--ghost" type="button" data-share${sharing ? ' disabled' : ''}>${esc(sharing ? t.ui.paper.drawing : t.ui.paper.share)}</button>
          <button class="btn btn--primary" type="button" data-restart>${esc(t.ui.over.playAgain)}</button>
        </div>
      </section>
    `
  }

  /** Choosing whose role to show again — the narrator picks, not the app. */
  function pickerMarkup(): string {
    const options = game.players
      .filter((p) => p.alive)
      .map(
        (p) =>
          `<button class="target" type="button" data-pick="${p.id}">${esc(p.name)}</button>`,
      )
      .join('')

    return `
      <div class="sheet" data-sheet>
        <div class="sheet__panel" role="dialog" aria-modal="true" aria-label="${esc(t.ui.reveal.pickPlayer)}">
          <div class="sheet__head">
            <span class="sheet__handle" aria-hidden="true"></span>
            <p class="sheet__title">${esc(t.ui.reveal.pickPlayer)}</p>
          </div>
          <div class="targets">${options}</div>
          <button class="btn btn--ghost" type="button" data-pick-cancel>${esc(t.ui.common.cancel)}</button>
        </div>
      </div>
    `
  }

  /**
   * The persistent bottom bar: the timeline, and a single ⋯ for everything
   * else. It is absent while a player holds the phone — the reveal — because
   * nothing may sit beside a held role, and because the timeline would show
   * them every move of the game so far.
   */
  function chromeMarkup(): string {
    if (document.body.classList.contains('is-revealing')) return ''
    if (state.screen === 'reveal' && revealOrder()[state.revealIndex]) return ''
    // A slide may be held up to the table; the day screen behind it shows
    // every role, so nothing may lead out of the slideshow but its own Done.
    if (dawn !== null) return ''
    // The paper, likewise: the phone may be facing the town.
    if (paperOpen) return ''
    // A question card is handed to one player: the timeline would show them
    // every move so far and the menu can end the game. Its own Done is the
    // way out, as with a slide and the paper.
    if (asking !== null) return ''
    // The whole room is looking at the screen.
    if (tableView) return ''
    // A player is looking at the screen: the timeline would show them every
    // move so far, and the menu can end the game.
    if (state.screen === 'night' && showingPlayer && !isNightComplete(game)) return ''
    const inGame = state.screen !== 'setup'
    const timeline = inGame
      ? `<button class="bar__btn" type="button" data-log>${esc(t.ui.timeline.open)}</button>`
      : '<span></span>'
    return `
      <nav class="bar${inGame ? '' : ' bar--quiet'}">
        ${timeline}
        <button class="bar__menu" type="button" data-menu aria-haspopup="dialog"
                aria-label="${esc(t.ui.menu.more)}" title="${esc(t.ui.menu.more)}">⋯</button>
      </nav>
    `
  }

  /**
   * The room: a code and a QR while one is open, the relay address and a
   * button before. The secret never appears; the QR carries only the code.
   */
  function roomMarkup(): string {
    const r = t.ui.room
    let body: string
    if (room !== null) {
      const tv = tvUrl(room, location.origin)
      const seated = [...guests.values()].filter((g) => g.seat !== null)
      const status =
        roomStatus === 'replaced'
          ? r.replaced
          : roomStatus !== 'open'
            ? r.reconnecting
            : `${tvs > 0 ? r.tvs(tvs) : r.noTv} · ${r.players(seated.length)}`
      body = `
        <p class="title room__code" aria-label="${esc(r.code)}">${esc(room.code)}</p>
        <p class="room__status" data-room-status>${esc(status)}</p>
        <p class="room__hint">${esc(r.secondScreen)}</p>
        <p class="room__url">${esc(tv)}</p>
        <button class="btn btn--ghost" type="button" data-room-done>${esc(t.ui.common.done)}</button>
        <button class="btn btn--ghost room__end" type="button" data-room-close>${esc(r.close)}</button>
      `
    } else {
      body = `
        <p class="confirm__question">${esc(r.intro)}</p>
        <label class="field">
          <span class="field__label">${esc(r.relay)}</span>
          <input class="field__input" type="url" data-relay value="${esc(loadRelay())}"
                 placeholder="https://…workers.dev" autocapitalize="off" autocorrect="off" spellcheck="false">
        </label>
        <label class="field">
          <span class="field__label">${esc(r.key)}</span>
          <input class="field__input" type="text" data-room-key value="${esc(loadRoomKey())}"
                 autocapitalize="off" autocorrect="off" spellcheck="false" autocomplete="off">
        </label>
        <p class="room__hint">${esc(r.keyHint)}</p>
        ${roomError !== null ? `<p class="notice">${esc(roomError === 'key' ? r.refused : roomError === 'room' ? t.ui.setup.noSuchScreen : r.failed)}</p>` : ''}
        <button class="btn btn--primary" type="button" data-room-open${roomBusy ? ' disabled' : ''}>${esc(roomBusy ? r.opening : r.openHere)}</button>
      `
    }
    return `
      <div class="sheet" data-sheet>
        <div class="sheet__panel room" role="dialog" aria-modal="true" aria-label="${esc(t.ui.menu.bigScreen)}">
          <div class="sheet__head">
            <span class="sheet__handle" aria-hidden="true"></span>
            <p class="sheet__title">${esc(t.ui.menu.bigScreen)}</p>
          </div>
          ${body}
        </div>
      </div>
    `
  }

  /**
   * One question, two answers. The destructive one carries the same label
   * as the row that opened it, so the narrator confirms the thing they tapped.
   */
  function confirmMarkup(pending: Pending): string {
    const copy = {
      restart: { question: t.ui.menu.restartConfirm, action: t.ui.common.restart },
      newTable: { question: t.ui.over.newTableConfirm, action: t.ui.over.newTable },
      clearNames: { question: t.ui.setup.clearConfirm, action: t.ui.setup.clearNames },
      finish: { question: t.ui.menu.endGameConfirm, action: t.ui.over.finishNow },
      clearStats: { question: t.ui.stats.clearConfirm, action: t.ui.stats.clear },
      // The button that ends the day says what ending it does, since what it
      // does is the thing the narrator is being asked about.
      nextNight: { question: t.ui.day.nextNightConfirm, action: t.ui.day.nobody },
      roomNames: {
        question: t.ui.setup.roomTakesNames,
        action: roomRoad?.kind === 'join' ? t.ui.setup.screenJoin : t.ui.room.openHere,
      },
    }[pending]
    return `
      <div class="sheet" data-sheet>
        <div class="sheet__panel confirm" role="alertdialog" aria-modal="true" aria-labelledby="confirm-question">
          <div class="sheet__head"><span class="sheet__handle" aria-hidden="true"></span></div>
          <p class="confirm__question" id="confirm-question">${esc(copy.question)}</p>
          <div class="confirm__actions">
            <button class="btn btn--ghost" type="button" data-confirm-cancel>${esc(t.ui.common.cancel)}</button>
            <button class="btn btn--danger" type="button" data-confirm-ok>${esc(copy.action)}</button>
          </div>
        </div>
      </div>
    `
  }

  /** The paper as an image, for a long press where there is no share sheet. */
  function shotMarkup(url: string): string {
    return `
      <div class="sheet" data-sheet>
        <div class="sheet__panel sheet__panel--tall" role="dialog" aria-modal="true" aria-label="${esc(t.ui.paper.title)}">
          <div class="sheet__head">
            <span class="sheet__handle" aria-hidden="true"></span>
            <p class="sheet__title sheet__title--hint">${esc(t.ui.paper.holdHint)}</p>
          </div>
          <div class="shot"><img class="shot__img" src="${esc(url)}" alt="${esc(t.ui.paper.title)}"></div>
          <button class="btn btn--ghost" type="button" data-shot-close>${esc(t.ui.common.close)}</button>
        </div>
      </div>
    `
  }

  /** The overflow sheet. Rows are per screen; destructive ones sit last. */
  function menuMarkup(): string {
    const other = state.locale === 'es' ? 'en' : 'es'
    const inPlay = state.screen === 'night' || state.screen === 'day'
    const restartable = state.screen !== 'setup' || game.players.length > 0
    const row = (attr: string, label: string, value = '', danger = false): string => `
      <button class="menu__item${danger ? ' menu__item--danger' : ''}" type="button" ${attr}>
        <span class="menu__label">${esc(label)}</span>
        ${value ? `<span class="menu__value">${esc(value)}</span>` : ''}
      </button>
    `
    const items = [
      row('data-lang', t.ui.menu.language, strings(other).languageName),
      inPlay
        ? `<div class="menu__item menu__item--static menu__item--stack">
             <span class="menu__label">${esc(t.ui.menu.layout)}</span>
             <span class="menu__segment" role="radiogroup" aria-label="${esc(t.ui.menu.layout)}">
               <button class="menu__seg" type="button" role="radio" data-layout="circle"
                       aria-checked="${state.layout === 'circle'}">${esc(t.ui.menu.circle)}</button>
               <button class="menu__seg" type="button" role="radio" data-layout="list"
                       aria-checked="${state.layout === 'list'}">${esc(t.ui.menu.list)}</button>
             </span>
           </div>`
        : '',
      inPlay
        ? `<div class="menu__item menu__item--static menu__item--stack">
             <span class="menu__label">${esc(t.ui.menu.timer)}</span>
             <span class="menu__segment" role="radiogroup" aria-label="${esc(t.ui.menu.timer)}">
               ${TIMER_LENGTHS.map(
                 (n) => `<button class="menu__seg" type="button" role="radio" data-timer-length="${n}"
                       aria-checked="${timer.length === n}">${esc(t.ui.timer.minutes(n / 60))}</button>`,
               ).join('')}
             </span>
           </div>`
        : '',
      row('data-room', t.ui.menu.bigScreen, room?.code ?? ''),
      inPlay || room !== null ? row('data-show-table', t.ui.menu.table) : '',
      state.screen === 'day' ? row('data-show-role', t.ui.reveal.showAgain) : '',
      row('data-mute', t.ui.menu.sound, sound.muted() ? t.ui.menu.off : t.ui.menu.on),
      row('data-stats', t.ui.stats.open),
      installPrompt ? row('data-install', t.ui.menu.install) : '',
      inPlay ? row('data-finish', t.ui.over.finishNow, '', true) : '',
      // At the end of a game the two roads are side by side, so the ⋯ row is
      // the one that is not "Play again": a different set of people.
      restartable
        ? state.screen === 'over'
          ? row('data-new-table', t.ui.over.newTable, '', true)
          : row('data-reset', t.ui.common.restart, '', true)
        : '',
    ].join('')

    return `
      <div class="sheet" data-sheet>
        <div class="sheet__panel sheet__panel--tall" role="dialog" aria-modal="true" aria-label="${esc(t.ui.menu.more)}">
          <div class="sheet__head"><span class="sheet__handle" aria-hidden="true"></span></div>
          <div class="menu">${items}</div>
          <button class="btn btn--ghost" type="button" data-menu-close>${esc(t.ui.common.close)}</button>
        </div>
      </div>
    `
  }
}

/** Living players, in seating order — the order the phone travels. */
// A seat with a phone already has its card there: the pass-around skips it.
const revealOrder = () =>
  state.revealMode === 'single'
    ? state.session.current.players.filter((p) => p.id === singleTarget)
    : state.session.current.players.filter((p) => !seatedFromPhones().has(p.id))

let singleTarget: PlayerId | null = null

/**
 * The screen a rewound session belongs on.
 *
 * Undo and the timeline's rewind move the game underneath the screen, and the
 * screen has to follow it. It did not: stepping back over the start of a
 * night left `screen` on 'night' while the state beneath it was the setup the
 * table had been dealt into, and an empty schedule makes `isNightComplete`
 * vacuously true — so the narrator was shown an ordinary "the town sleeps /
 * end the night" card for a night that had not begun, and tapping it resolved
 * a night 0 and printed a morning report for events that never happened, with
 * nothing on screen to say anything was wrong. The screen is not independent
 * of the phase; derive it from the phase every time the session moves back.
 *
 * The one screen it will not choose is 'over': the ending is read to the town
 * and the narrator arrives at the final page through the reading, so a rewind
 * that happens to land on a won position stays on the board it rewound to.
 */
const screenFor = (session: Session): Partial<AppState> => {
  const game = session.current
  if (game.phase === 'day') return { screen: 'day' }
  if (game.phase === 'night') return { screen: 'night' }
  // Before the first night. With a table dealt, that is the screen the
  // pass-around ended on, which offers the first night again; with no table,
  // the names.
  if (game.players.length === 0) return { screen: 'setup', revealIndex: 0 }
  const phones = seatedFromPhones()
  return {
    screen: 'reveal',
    revealMode: 'onboarding',
    revealIndex: game.players.filter((p) => !phones.has(p.id)).length,
  }
}

/**
 * The seats whose card was actually held on this device, this deal.
 *
 * Local on purpose: it is not a fact about the game, it is what this phone
 * watched happen, and it must not survive a fresh deal. `revealDoneMarkup`
 * reads it so the screen after the pass-around says what is true rather than
 * asserting that everyone has looked.
 */
const held = new Set<PlayerId>()

// ---------------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------------

function bind(): void {
  const game = state.session.current

  // Every other row in the menu can be changed with the sheet still open —
  // mute, layout, the clock's length — so the one that closed it read as a
  // different, less considered control. It relabels itself in place instead.
  on(root, '[data-lang]', 'click', () => {
    setState({ locale: state.locale === 'es' ? 'en' : 'es' }, false)
  })

  on(root, '[data-menu]', 'click', () => {
    menuOpen = true
    setState({}, false)
  })

  on(root, '[data-menu-close]', 'click', () => {
    menuOpen = false
    setState({}, false)
  })

  // Tapping the dimmed backdrop closes whichever sheet is up.
  on(root, '[data-sheet]', 'click', (event, el) => {
    if (event.target !== el) return
    dismissSheets()
    setState({}, false)
  })

  // The way out of the room sheet that does not end the room. Mid-game the
  // sheet is the only place the code is written, so it stays up until the
  // narrator is done reading it out — but "Close the room" was the only
  // labelled button on it, and it reads exactly like an ordinary dismiss
  // while actually cutting every phone and screen off.
  on(root, '[data-room-done]', 'click', () => {
    roomOpen = false
    setState({}, false)
  })

  on(root, '[data-shot-close]', 'click', () => {
    closeShot()
    setState({}, false)
  })

  // See it take, close the sheet yourself — like the layout row.
  on(root, '[data-mute]', 'click', () => {
    sound.setMuted(!sound.muted())
    setState({}, false)
  })

  on(root, '[data-install]', 'click', () => {
    menuOpen = false
    setState({}, false)
    void installPrompt?.prompt()
  })

  // Destructive rows ask first, on our own sheet, then run below.
  on(root, '[data-reset]', 'click', () => ask('restart'))
  on(root, '[data-new-table]', 'click', () => ask('newTable'))
  on(root, '[data-clear-names]', 'click', () => ask('clearNames'))
  on(root, '[data-finish]', 'click', () => ask('finish'))

  on(root, '[data-confirm-cancel]', 'click', () => {
    confirming = null
    roomRoad = null
    setState({}, false)
  })

  on(root, '[data-confirm-ok]', 'click', () => {
    const pending = confirming
    confirming = null
    if (pending === 'restart') startOver({ forgetPeople: false })
    else if (pending === 'newTable') startOver({ forgetPeople: true })
    else if (pending === 'clearNames') clearNames()
    else if (pending === 'finish') finish()
    else if (pending === 'roomNames') {
      const road = roomRoad
      roomRoad = null
      if (road?.kind === 'open') openTheRoom(road.a, road.b)
      else if (road) joinTheRoom(road.a, road.b)
    }
    else if (pending === 'nextNight') nextNight()
    else if (pending === 'clearStats') {
      clearStats()
      setState({}, false)
    }
  })

  function ask(pending: Pending): void {
    menuOpen = false
    // The sheet that asked steps aside; the question is the only thing up.
    roomOpen = false
    confirming = pending
    setState({}, false)
  }

  /**
   * Starting again, by one road.
   *
   * "Play again" on the game-over page and Restart in ⋯ were two functions
   * that looked like one choice: the red one forgot the language, the seat
   * order and the room's guests, the primary one kept them, and nothing said
   * which was which. Both come through here now, and the only difference is
   * the one the two labels state out loud — a new table forgets the people.
   */
  function startOver({ forgetPeople }: { forgetPeople: boolean }): void {
    shareNotice = false
    closeShot()
    // A new game starts at an empty door.
    notices = []
    turnedAway.clear()
    clear()
    // A room's table is whoever joins it, so a remembered list would show
    // names nobody can find; without a room the list is the evening's. An
    // emptied list always comes with a fresh hello (a no-op with no room
    // open), or the phones would stay seated at a table with no names on it
    // and nobody could rejoin without reloading.
    const startEmpty = forgetPeople || room !== null
    names = startEmpty ? [] : loadRoster()
    if (startEmpty) rekeyRoom()
    editing = null
    singleTarget = null
    inspecting = null
    showingPlayer = false
    showingLog = false
    menuOpen = false
    tableView = false
    picked = []
    held.clear()
    leaveDay()
    // The narrator's language and layout are the narrator's, not the game's.
    // Re-booting re-detected the locale from the browser, so a table that had
    // been running all night in Spanish restarted into English on the phone,
    // on every player's phone and on the TV.
    state = { ...boot(), locale: state.locale, layout: state.layout }
    setState({ session: newSession(createGame([])), screen: 'setup', revealIndex: 0 })
  }

  function clearNames(): void {
    // The remembered list is the one thing a reset keeps, so wiping it is
    // deliberate and asked first.
    names = []
    clearRoster()
    setState({}, false)
  }

  // End early and see the whole game — v1's flag button.
  function finish(): void {
    buzz()
    leaveDay()
    setState({ screen: 'over' })
  }

  // ---- Setup ----
  // ---- Names ----
  // One field, Enter adds, repeat. The count is simply how many were typed.
  on(root, '[data-name-form]', 'submit', (event) => {
    event.preventDefault()
    const input = root.querySelector<HTMLInputElement>('[data-new-name]')
    const name = input?.value.trim() ?? ''
    if (name === '') return
    names = [...names, name]
    saveRoster(names)
    buzz()
    setState({}, false)
    root.querySelector<HTMLInputElement>('[data-new-name]')?.focus()
  })

  on(root, '[data-remove-name]', 'click', (_e, el) => {
    names = names.filter((_, i) => i !== Number(el.dataset.removeName))
    saveRoster(names)
    setState({}, false)
  })

  on(root, '[data-names-done]', 'click', () => {
    if (names.length < MIN_PLAYERS) return
    const setups: PlayerSetup[] = names.map((name) => ({ name, roleId: 'PLAIN' as RoleId }))
    saveRoster(names)
    buzz()
    setState({ session: newSession(createGame(setups)) })
  })

  on(root, '[data-complexity]', 'click', (_e, el) => {
    complexity = (el.dataset.complexity ?? 'standard') as Complexity
    setState({}, false)
  })

  // Names are all the narrator normally types; the app deals the rest.
  on(root, '[data-deal-random]', 'click', () => {
    const roles = dealRoles(game.players.length, complexity, systemRandom)
    buzz()
    mutate((s) => ({
      ...s,
      players: s.players.map((p, i) => {
        const roleId = roles[i] ?? 'PLAIN'
        return { ...p, roleId, wolfAttacksSurvivable: roleId === 'SURVIVE' ? 1 : 0 }
      }),
    }))
  })

  // Seats open the editor only during setup. In play the same circle renders
  // its seats as data-target / data-lynch buttons instead, so the existing
  // handlers pick them up and the narrator taps people where they are sitting.
  on(root, '[data-seat]', 'click', (_e, el) => {
    if (state.screen !== 'setup') return
    editing = Number(el.dataset.seat)
    setState({}, false)
  })

  // Seating. Tap one person, then the one to swap with; ◀ ▶ in the editor
  // nudge a single seat. Only during setup — ids are seating positions and are
  // referenced everywhere once play starts.
  on(root, '[data-rearrange]', 'click', () => {
    rearranging = !rearranging
    armedSeat = null
    setState({}, false)
  })

  on(root, '[data-swap]', 'click', (_e, el) => {
    const id = Number(el.dataset.swap)
    if (armedSeat === null || armedSeat === id) {
      armedSeat = armedSeat === id ? null : id
      setState({}, false)
      return
    }
    const a = armedSeat
    armedSeat = null
    buzz()
    mutate((s) => swapSeats(s, a, id))
  })

  on(root, '[data-nudge]', 'click', (_e, el) => {
    const id = editing
    if (id === null) return
    const direction = el.dataset.nudge === '1' ? 1 : -1
    buzz()
    // moveSeat renumbers ids to seating positions, so the moved player's new
    // id is simply their new position. The editor follows them there. Never
    // match by name — two players may share one.
    const n = game.players.length
    const from = game.players.findIndex((p) => p.id === id)
    editing = from === -1 ? null : (from + direction + n) % n
    mutate((s) => moveSeat(s, id, direction))
  })

  // Pick one, see it take, then close the sheet yourself: an option that
  // slams the menu shut the moment it is tapped leaves the narrator unsure
  // anything happened.
  on(root, '[data-layout]', 'click', (_e, el) => {
    const layout = el.dataset.layout === 'list' ? 'list' : 'circle'
    if (layout === state.layout) return
    setState({ layout }, false)
  })

  on(root, '[data-cancel]', 'click', () => {
    editing = null
    setState({}, false)
  })

  on(root, '[data-save]', 'click', () => {
    const name = root.querySelector<HTMLInputElement>('[data-name]')?.value ?? ''
    const roleValue = root.querySelector<HTMLSelectElement>('[data-role]')?.value ?? 'PLAIN'
    const roleId: RoleId = isRoleId(roleValue) ? roleValue : 'PLAIN'
    const id = editing
    editing = null

    mutate((s) => ({
      ...s,
      players: s.players.map((p) =>
        p.id === id
          ? {
              ...p,
              name: name.trim(),
              roleId,
              wolfAttacksSurvivable: roleId === 'SURVIVE' ? 1 : 0,
            }
          : p,
      ),
    }))
  })

  on(root, '[data-deal]', 'click', () => {
    saveRoster(game.players.map((p) => p.name))
    // The roles are settled here: the trades go to whoever is still a citizen.
    mutate((s) => assignTrades(s, systemRandom), { night: 0, kind: 'setup' })
    // A new deal is a new set of cards: nobody has looked at these yet.
    held.clear()
    revealPhase = 'handoff'
    buzz()
    setState({ screen: 'reveal', revealIndex: 0, revealMode: 'onboarding' })
  })

  // ---- Reveal ----
  on(root, '[data-confirm-identity], [data-confirm]', 'click', () => {
    if (state.screen === 'reveal') {
      revealPhase = 'confirm'
      // Animated: the hold button arrives into the thumb zone. The step used
      // to swap in a millisecond with nothing moving, so a player handed the
      // phone mid-change could not tell the screen had become theirs.
      setState({}, true)
    }
  })

  on(root, '[data-back]', 'click', () => {
    revealPhase = 'handoff'
    revealDir = 'back'
    setState({}, true)
  })

  // Nobody can ask about their role out loud without giving something away,
  // so they flag it here and the narrator checks privately before night one.
  // Nobody can ask about their role out loud without giving something away, so
  // they flag it privately here. It sits with the persistent controls rather
  // than on the card, because the card is only up while a finger is held down
  // and no one can hold and tap at the same time.
  on(root, '[data-question]', 'click', () => {
    const player = revealOrder()[state.revealIndex]
    if (!player) return
    const id = player.id
    buzz()
    mutate((s) => ({
      ...s,
      players: s.players.map((p) => (p.id === id ? { ...p, hasQuestion: !p.hasQuestion } : p)),
    }))
  })

  on(root, '[data-reveal-back]', 'click', () => {
    if (state.revealIndex === 0) return
    revealPhase = 'handoff'
    revealDir = 'back'
    setState({ revealIndex: state.revealIndex - 1 })
  })

  // Single mode came from a screen; the wrong name picked must not cost two
  // taps that both say something untrue to get home again.
  on(root, '[data-reveal-cancel]', 'click', () => {
    hideRole()
    releaseHandler?.()
    releaseHandler = null
    singleTarget = null
    revealPhase = 'handoff'
    buzz()
    setState({ screen: state.revealReturnTo })
  })

  if (state.screen === 'reveal') {
    // No re-render inside the gesture: unmounting the held button would fire
    // pointercancel on touch and read as an instant release. The card is
    // written into a slot beside the live button instead.
    releaseHandler = bindHold(root, {
      onReveal: showRole,
      onHide: () => {
        hideRole()
        // This seat has looked now, so Done takes the Ledger and the hold
        // settles back. Safe to repaint here: the finger is already up, and
        // it is only unmounting the button mid-gesture that reads as a
        // release. No entrance — the scene has not changed, only its weight.
        setState({}, false)
      },
    })
  } else if (asking !== null) {
    // The question card is the same gesture: it is a role, in the clear, on a
    // phone that is about to change hands.
    const id = asking
    releaseHandler = bindHold(root, {
      onReveal: () => {
        const subject = game.players.find((p) => p.id === id)
        const slot = root.querySelector<HTMLElement>('[data-card]')
        if (!subject || !slot) return
        slot.innerHTML = askCardMarkup(subject, state.locale)
        root.querySelector<HTMLElement>('[data-reveal-root]')?.setAttribute('data-showing', '')
        document.body.classList.add('is-revealing')
      },
      onHide: hideRole,
    })
  }

  // Advancing is deliberate and separate from the gesture, so a fumbled press
  // can never skip someone.
  on(root, '[data-reveal-next]', 'click', advanceReveal)

  const beginFirstNight = (): void => {
    askIntro = false
    setState({
      session: advance(state.session, startNight, { night: 1, kind: 'nightStart' }),
      screen: 'night',
    })
  }

  on(root, '[data-begin]', 'click', () => {
    const flagged = game.players.filter((p) => p.alive && p.hasQuestion)
    if (flagged.length === 0) {
      beginFirstNight()
      return
    }
    // Nobody asks out loud; the narrator walks the flagged players privately.
    askReturnTo = 'firstNight'
    askQueue = flagged.map((p) => p.id)
    askTotal = askQueue.length
    askIntro = true
    setState({})
  })

  // Open one player's card: from the round's intro, or from a flagged name on
  // the day screen. In the round the rest of the queue waits behind it.
  on(root, '[data-ask]', 'click', (_e, el) => {
    const id = Number(el.dataset.ask)
    if (askIntro) {
      askQueue = askQueue.filter((q) => q !== id)
      askIntro = false
    } else {
      askReturnTo = 'day'
      askQueue = []
    }
    asking = id
    buzz()
    setState({})
  })

  // Done clears the flag — the question is answered — and moves on.
  on(root, '[data-question-done]', 'click', () => {
    const id = asking
    asking = null
    if (id !== null) {
      mutate((s) => ({
        ...s,
        players: s.players.map((p) => (p.id === id ? { ...p, hasQuestion: false } : p)),
      }))
    }
    const next = askQueue.shift()
    if (next !== undefined) {
      asking = next
      setState({})
      return
    }
    if (askReturnTo === 'firstNight') beginFirstNight()
    else setState({})
  })

  // ---- Night ----
  on(root, '[data-target]', 'click', (_e, el) => {
    const roleId = currentStep(game)
    if (roleId === null) return
    const id = Number(el.dataset.target)
    const kind = ROLES[roleId].target.kind
    buzz()
    sound.tick()

    if (kind === 'player') {
      picked = []
      const action: NightAction = { kind: 'target', roleId, actor: null, target: id }
      mutate((s) => recordAction(s, action), { night: game.night, kind: 'action', roleId, action })
      // The detective is shown a card, so hold it up before moving on.
      if (roleId === 'INSPECT') inspecting = id
      setState({}, false)
      return
    }

    if (kind === 'twoPlayers') {
      // Tapping a chosen player unpicks them, so a misfire is recoverable
      // without undoing the whole step.
      picked = picked.includes(id) ? picked.filter((p) => p !== id) : [...picked, id]
      if (picked.length === 2) {
        const [first, second] = picked as [PlayerId, PlayerId]
        picked = []
        const action: NightAction = { kind: 'pair', roleId, first, second }
        mutate((s) => recordAction(s, action), { night: game.night, kind: 'action', roleId, action })
      } else {
        setState({}, false)
      }
      return
    }

    if (kind === 'potion') {
      // Choose the target first; the vial buttons unlock once one is set.
      picked = picked.includes(id) ? [] : [id]
      setState({}, false)
      return
    }

    if (kind === 'split') {
      // Build the first faction one tap at a time; Confirm records the split.
      picked = picked.includes(id) ? picked.filter((p) => p !== id) : [...picked, id]
      setState({}, false)
    }
  })

  // The Cultist's split: whoever was tapped is the first faction, everyone
  // else living is the second. Neither may be empty.
  on(root, '[data-split-confirm]', 'click', () => {
    const roleId = currentStep(game)
    if (roleId !== 'SPLIT') return
    const living = game.players.filter((p) => p.alive).map((p) => p.id)
    const sectOne = living.filter((id) => picked.includes(id))
    const sectTwo = living.filter((id) => !picked.includes(id))
    if (sectOne.length === 0 || sectTwo.length === 0) return
    picked = []
    buzz()
    const action: NightAction = { kind: 'split', roleId: 'SPLIT', sectOne, sectTwo }
    mutate((s) => recordAction(s, action), { night: game.night, kind: 'action', roleId, action })
  })

  on(root, '[data-potion]', 'click', (_e, el) => {
    const target = picked[0]
    // Guarded as well as disabled: never spend a potion on a guessed target.
    if (target === undefined) return
    const potion = el.dataset.potion === 'heal' ? 'heal' : 'kill'
    picked = []
    buzz()
    const action: NightAction = { kind: 'potion', roleId: 'MEDIC', target, potion }
    mutate((s) => recordAction(s, action), { night: game.night, kind: 'action', roleId: 'MEDIC', action })
  })

  // Roles that act without picking a target (the Godfather converting, the
  // Associate choosing a side). This button used to share [data-confirm] with
  // the reveal screen's "Are you Ana?", whose handler is guarded by
  // screen === 'reveal' — so on the night screen it silently did nothing and
  // the Godfather could never convert.
  on(root, '[data-night-confirm]', 'click', () => {
    const roleId = currentStep(game)
    if (roleId === null) return
    picked = []
    buzz()
    const action: NightAction = { kind: 'confirm', roleId }
    mutate((s) => recordAction(s, action), { night: game.night, kind: 'action', roleId, action })
  })

  on(root, '[data-inspect-done]', 'click', () => {
    inspecting = null
    setState({})
  })

  // Turn the phone to the player whose step it is, and back. What they see
  // is decided by perspectiveFor() in screens/night.ts, never here.
  on(root, '[data-show-player]', 'click', () => {
    showingPlayer = true
    buzz()
    setState({})
  })

  on(root, '[data-view-done]', 'click', () => {
    showingPlayer = false
    setState({})
  })

  // The narrator's board, for this step only.
  on(root, '[data-peek]', 'click', () => {
    peeking = !peeking
    setState({}, false)
  })

  // ---- The table, for the room ----
  on(root, '[data-show-table]', 'click', () => {
    menuOpen = false
    tableView = true
    setState({})
  })

  on(root, '[data-table-close]', 'click', () => {
    tableView = false
    setState({})
  })

  // Everyone is in: the names become the roster and the narrator deals.
  on(root, '[data-table-proceed]', 'click', () => {
    tableView = false
    if (state.screen === 'setup' && game.players.length === 0 && names.length >= MIN_PLAYERS) {
      const setups: PlayerSetup[] = names.map((name) => ({ name, roleId: 'PLAIN' as RoleId }))
      saveRoster(names)
      buzz()
      setState({ session: newSession(createGame(setups)) })
      return
    }
    setState({})
  })

  // ---- The room, for a TV ----
  on(root, '[data-room]', 'click', () => {
    menuOpen = false
    roomOpen = true
    roomError = null
    setState({}, false)
  })

  on(root, '[data-room-open]', 'click', () => {
    if (roomBusy) return
    const field = root.querySelector<HTMLInputElement>('[data-relay]')
    const relay = normalizeRelay(field?.value ?? loadRelay())
    const key = (root.querySelector<HTMLInputElement>('[data-room-key]')?.value ?? loadRoomKey()).trim()
    if (relay === '') {
      roomError = 'relay'
      setState({}, false)
      return
    }
    // The address and the key are settings, not the destructive part: they
    // are kept whether or not the narrator goes through with the room.
    saveRelay(relay)
    saveRoomKey(key)
    if (takesNames()) {
      roomRoad = { kind: 'open', a: relay, b: key }
      ask('roomNames')
      return
    }
    openTheRoom(relay, key)
  })

  /** A room about to empty a list somebody typed. Both roads in ask first. */
  function takesNames(): boolean {
    return state.screen === 'setup' && state.session.current.players.length === 0 && names.length > 0
  }

  function openTheRoom(relay: string, key: string): void {
    saveRelay(relay)
    saveRoomKey(key)
    roomBusy = true
    roomError = null
    setState({}, false)
    void openRoom(relay, key)
      .then((opened) => {
        room = opened
        saveRoom(room)
        connectRoom()
        // Before the game, the room is a lobby: turn this screen to it at
        // once, so a stood-up phone or a mirrored iPad shows the code. The
        // table is whoever joins; names typed for a phoneless evening step aside.
        if (state.screen === 'setup') {
          if (state.session.current.players.length === 0) names = []
          roomOpen = false
          tableView = true
        }
      })
      .catch((error: unknown) => {
        roomError = error instanceof RelayRefused && error.status === 403 ? 'key' : 'relay'
      })
      .then(() => {
        roomBusy = false
        setState({}, false)
      })
  }

  // The big screen's code, typed on the names screen: this phone claims the
  // room the TV opened. Five letters submit by themselves.
  on(root, '[data-screen-code]', 'input', (_e, el) => {
    const input = el as HTMLInputElement
    input.value = input.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 5)
    screenCode = input.value
    // Join with an empty box did nothing at all and said nothing either, so
    // it waits for the five letters instead — the way the door below waits
    // for four players. Set on the element rather than through a paint: a
    // repaint on every keystroke would take the caret with it.
    const submit = input.form?.querySelector<HTMLButtonElement>('[data-screen-submit]')
    if (submit) submit.disabled = screenCode.length !== 5
    if (input.value.length === 5 && !(loadRoomKey() === '' || roomError === 'key')) {
      input.form?.requestSubmit()
    }
  })

  // "Join a screen with its code": the fields, for the tables that have one.
  on(root, '[data-screen-open]', 'click', () => {
    screenFormOpen = true
    setState({}, false)
  })

  on(root, '[data-screen-key]', 'input', (_e, el) => {
    screenKey = (el as HTMLInputElement).value
  })

  on(root, '[data-screen-form]', 'submit', (event) => {
    event.preventDefault()
    if (roomBusy) return
    const code = (root.querySelector<HTMLInputElement>('[data-screen-code]')?.value ?? '').trim().toUpperCase()
    const key = (root.querySelector<HTMLInputElement>('[data-screen-key]')?.value ?? loadRoomKey()).trim()
    screenCode = code
    screenKey = key
    if (!/^[A-Z0-9]{5}$/.test(code)) return
    if (key === '') {
      roomError = 'key'
      setState({}, false)
      return
    }
    if (takesNames()) {
      roomRoad = { kind: 'join', a: code, b: key }
      ask('roomNames')
      return
    }
    joinTheRoom(code, key)
  })

  function joinTheRoom(code: string, key: string): void {
    roomBusy = true
    roomError = null
    setState({}, false)
    void claimRoom(loadRelay(), code, key)
      .then((claimed) => {
        saveRoomKey(key)
        room = claimed
        saveRoom(room)
        connectRoom()
        screenCode = ''
        screenKey = ''
        // The table is whoever joins: names typed for a phoneless evening step aside.
        if (state.screen === 'setup' && state.session.current.players.length === 0) names = []
        buzz()
      })
      .catch((error: unknown) => {
        roomError = error instanceof RelayRefused ? (error.status === 403 ? 'key' : error.status === 404 ? 'room' : 'relay') : 'relay'
        // One of the two was right. Clear only the one the relay turned down.
        if (roomError === 'key') screenKey = ''
        else if (roomError === 'room') screenCode = ''
      })
      .then(() => {
        roomBusy = false
        setState({}, false)
      })
  }

  on(root, '[data-room-close]', 'click', () => {
    // A decision, not a disconnection: the relay drops the room and tells
    // every screen and phone why (docs/BIG-SCREEN.md §12.2).
    link?.end()
    link = null
    room = null
    roomError = null
    tvs = 0
    guests.clear()
    roomStatus = 'closed'
    saveRoom(null)
    setState({}, false)
  })

  // The ballot comes off the seal: the count comes up on the room's screen
  // one ballot at a time, at this phone's beat, and each ballot ticks here.
  // Anything that leaves the day stops it; once complete it stays up.
  on(root, '[data-reveal-votes]', 'click', () => {
    if (shown !== null) return
    shown = 0
    buzz()
    countBeat = window.setInterval(() => {
      if (shown === null) return
      const total = countOrder(state.session.current).length
      shown = Math.min(shown + 1, total)
      buzz()
      sound.tick()
      if (shown >= total && countBeat !== null) {
        window.clearInterval(countBeat)
        countBeat = null
      }
      setState({}, false)
    }, COUNT_BEAT_MS)
    setState({}, false)
  })

  // The Associate picks a side on the first night; the pick is a role change
  // the resolver applies at dawn. Anything but a real role id is ignored.
  on(root, '[data-choose-role]', 'click', (_e, el) => {
    const roleId = currentStep(game)
    const newRole = el.dataset.chooseRole ?? ''
    if (roleId === null || !isRoleId(newRole)) return
    picked = []
    buzz()
    const action: NightAction = { kind: 'chooseRole', roleId, newRole }
    mutate((s) => recordAction(s, action), { night: game.night, kind: 'action', roleId, action })
  })

  on(root, '[data-inspect-back]', 'click', () => {
    // Undo the detective's pick as well as closing the card.
    inspecting = null
    if (canUndo(state.session)) setState({ session: undo(state.session) })
    else setState({}, false)
  })

  on(root, '[data-log]', 'click', () => {
    showingLog = true
    setState({}, false)
  })

  on(root, '[data-log-close]', 'click', () => {
    showingLog = false
    setState({}, false)
  })

  on(root, '[data-revert]', 'click', (_e, el) => {
    const index = Number(el.dataset.revert)
    showingLog = false
    inspecting = null
    showingPlayer = false
    peeking = false
    picked = []
    const session = revertTo(state.session, index)
    buzz()
    leaveDay()
    setState({ session, ...screenFor(session) })
  })

  on(root, '[data-skip]', 'click', () => {
    const roleId = currentStep(game)
    if (roleId === null) return
    picked = []
    const action: NightAction = { kind: 'skip', roleId }
    mutate((s) => recordAction(s, action), { night: game.night, kind: 'action', roleId, action })
  })

  on(root, '[data-undo]', 'click', () => {
    if (!canUndo(state.session)) return
    picked = []
    showingPlayer = false
    peeking = false
    inspecting = null
    buzz()
    const session = undo(state.session)
    // Stepping back out of the night takes the day's own controls with it.
    if (session.current.phase !== 'day') leaveDay()
    setState({ session, ...screenFor(session) })
  })

  on(root, '[data-resolve]', 'click', () => {
    mutate(endNight, { night: game.night, kind: 'nightEnd' })
    const morning = state.session.current
    // A night that ends the game is still read: the reading closes on the
    // winner's slide and `endReading` lands on the final paper. Jumping
    // straight to it skipped the morning the town had just lived through.
    // The morning is read to the town from the slideshow, so it starts by
    // itself. If the Avenger died, the shot comes first and the show after.
    showAfterShot = morning.awaitingHunterShot !== null ? 'dawn' : null
    dawnKind = 'dawn'
    dawn = showAfterShot ? null : 0
    // A new day, a fresh clock; the narrator starts it when the reading ends.
    leaveDay()
    setState({ screen: 'day' })
  })

  // ---- Day ----
  on(root, '[data-lynch]', 'click', (_e, el) => {
    // One execution a day. The day screen stops offering a second, but a tap
    // already on its way when the verdict landed must not take a life either.
    if (game.log.some((o) => o.type === 'death' && o.cause === 'lynch' && o.night === game.night)) return
    buzz([120, 80, 120])
    sound.drum()
    // The vote ends the discussion, whatever the clock says.
    leaveDay()
    mutate((s) => lynch(s, Number(el.dataset.lynch)), {
      night: game.night, kind: 'lynch', target: Number(el.dataset.lynch),
    })
    const afternoon = state.session.current
    // The deciding vote is read like any other verdict; the winner's slide
    // closes it. It used to land on the final paper in twenty milliseconds,
    // so the room watched a hand go up and then read a newspaper.
    // The verdict is read the way the morning is: full screen, by itself.
    // If the town hanged the Gunman, his shot comes first and the reading after.
    showAfterShot = afternoon.awaitingHunterShot !== null ? 'verdict' : null
    dawnKind = 'verdict'
    dawn = showAfterShot ? null : 0
    setState({})
  })

  on(root, '[data-shoot]', 'click', (_e, el) => {
    buzz()
    sound.tick()
    mutate((s) => hunterShot(s, Number(el.dataset.shoot)), {
      night: game.night, kind: 'hunterShot', target: Number(el.dataset.shoot),
    })
    if (showAfterShot !== null) {
      dawnKind = showAfterShot
      dawn = 0
    } else if (winner(state.session.current) !== null) {
      // Nothing was waiting on the shot and it ended the game: the winner
      // still gets its slide rather than the paper arriving unannounced.
      dawnKind = 'verdict'
      dawn = 0
    }
    showAfterShot = null
    setState({})
  })

  // ---- Dawn slideshow ----
  // Slides cut, they do not crossfade: a view transition on top of the
  // ground's own colour transition left the red arriving one slide late.
  // The slide's entrance is its own keyframe; the ground fades in CSS.
  on(root, '[data-dawn-play]', 'click', () => {
    dawnKind = 'dawn'
    dawn = 0
    buzz()
    setState({}, false)
  })

  on(root, '[data-dawn-next]', 'click', (e) => {
    // The body and the Next button both carry this; a tap on the button
    // must not also count as a tap on the body it sits outside of.
    e.stopPropagation()
    if (dawn === null) return
    const count = currentSlides().length
    if (dawn >= count - 1) {
      endReading()
      return
    }
    dawn += 1
    setState({}, false)
  })

  on(root, '[data-dawn-prev]', 'click', () => {
    if (dawn === null || dawn === 0) return
    dawn -= 1
    setState({}, false)
  })

  on(root, '[data-dawn-close]', 'click', endReading)

  /**
   * The morning reading ends on the paper: the town has heard the night,
   * and the page is what it argues over. The verdict reading ends on the
   * day screen, since the paper for it has already been read.
   */
  function endReading(): void {
    const morning = dawnKind === 'dawn'
    dawn = null
    // The reading closed on the winner: what the town argues over now is the
    // final edition, which is the game-over screen's own page.
    if (winner(state.session.current) !== null) {
      setState({ screen: 'over' })
      return
    }
    if (morning) {
      paperOpen = true
      setState({})
    } else {
      setState({}, false)
    }
  }

  // ---- The paper ----
  // The day's edition, full screen; a scene of its own, so it enters.
  on(root, '[data-paper-open]', 'click', () => {
    paperOpen = true
    buzz()
    setState({})
  })

  on(root, '[data-paper-close]', 'click', () => {
    paperOpen = false
    setState({})
  })

  // The ledger, from ⋯: a full screen with its own Done over whatever the
  // game is showing (the bar stays: no player sees it), and the record can
  // be wiped from it after a question.
  on(root, '[data-stats]', 'click', () => {
    menuOpen = false
    statsOpen = true
    buzz()
    setState({})
  })
  on(root, '[data-stats-close]', 'click', () => {
    statsOpen = false
    setState({})
  })
  on(root, '[data-stats-clear]', 'click', () => ask('clearStats'))

  // The primary button sits directly under the seats the narrator is tapping
  // to record the vote, and the night takes those votes with it — so a
  // mistap there threw away a count the town had already given. Anything
  // recorded asks first, on the same sheet as every other move that cannot
  // be taken back by tapping again.
  on(root, '[data-next-night]', 'click', () => {
    if (game.votes.length > 0) ask('nextNight')
    else nextNight()
  })

  function nextNight(): void {
    leaveDay()
    mutate(startNight, { night: state.session.current.night + 1, kind: 'nightStart' })
    setState({ screen: 'night' })
  }

  // ---- The vote ----
  // Two taps a vote: the voter, then their pick; the voter again takes it
  // back. Each lands in the history through mutate(), so undo covers it,
  // and the mode stays on for the next voter. The engine refuses the dead,
  // the silenced and self-votes on its own; the seats only dim them.
  on(root, '[data-voting]', 'click', () => {
    voting = !voting
    voter = null
    setState({}, false)
  })

  on(root, '[data-vote]', 'click', (_e, el) => {
    const id = Number(el.dataset.vote)
    buzz()
    sound.tick()
    if (voter === null) {
      voter = id
      setState({}, false)
      return
    }
    const who = voter
    voter = null
    if (id === who) {
      // Nothing to take back is not a move: no history entry for it.
      if (!game.votes.some((v) => v.voter === who)) {
        setState({}, false)
        return
      }
      mutate((s) => withdrawVote(s, who), { night: game.night, kind: 'vote', voter: who })
    } else {
      mutate((s) => castVote(s, who, id), { night: game.night, kind: 'vote', voter: who, target: id })
    }
  })

  // ---- The discussion timer ----
  // One face: tap to start, tap to pause, and a tap on a finished clock
  // starts it over. Repaints are plain — nothing else on the screen moved.
  on(root, '[data-timer-toggle]', 'click', () => {
    setTimer(toggleTimer(timer, Date.now()))
    buzz()
    setState({}, false)
  })

  on(root, '[data-timer-reset]', 'click', () => {
    setTimer(resetTimer(timer))
    setState({}, false)
  })

  on(root, '[data-timer-length]', 'click', (_e, el) => {
    const length = Number(el.dataset.timerLength)
    if (!(TIMER_LENGTHS as readonly number[]).includes(length)) return
    setTimer(withLength(timer, length))
    setState({}, false)
  })

  // ---- Revisit a role ----
  on(root, '[data-show-role]', 'click', () => {
    menuOpen = false
    picking = true
    setState({}, false)
  })

  on(root, '[data-pick-cancel]', 'click', () => {
    picking = false
    setState({}, false)
  })

  on(root, '[data-pick]', 'click', (_e, el) => {
    picking = false
    singleTarget = Number(el.dataset.pick)
    // Always start at the handoff, so the phone can reach them before the
    // role is anywhere near the screen.
    revealPhase = 'handoff'
    buzz()
    setState({ screen: 'reveal', revealIndex: 0, revealMode: 'single', revealReturnTo: 'day' })
  })

  // The front page as an image, through the share sheet where there is
  // one, saved where there is not. Drawing takes a moment on a phone, so
  // the button waits rather than letting a second tap queue a second sheet.
  on(root, '[data-share]', 'click', () => {
    if (sharing) return
    sharing = true
    shareNotice = false
    buzz()
    setState({}, false)
    // Drawing the page and handing it to the system sheet can end in neither
    // a resolve nor a reject — a sheet dismissed by the system, a headless
    // browser with no sheet at all — and the button was left dead for good.
    // Whichever lands first wins; the other is ignored.
    let settled = false
    const done = (finish: () => void): void => {
      if (settled) return
      settled = true
      sharing = false
      finish()
      if (state.screen === 'over') setState({}, false)
      else closeShot()
    }
    const giveUp = window.setTimeout(() => done(() => {}), SHARE_TIMEOUT_MS)
    void sharePaper(game, state.locale)
      .catch((): ShareResult => ({ kind: 'unavailable' }))
      .then((result) => {
        window.clearTimeout(giveUp)
        done(() => {
          shareNotice = result.kind === 'unavailable'
          if (result.kind === 'shown') paperShot = result.url
        })
      })
  })

  // The same people, a fresh deal.
  on(root, '[data-restart]', 'click', () => startOver({ forgetPeople: false }))

}

/**
 * Keeps one interval alive exactly while the clock runs. The digits are
 * repainted in place: rebuilding the screen every second would restart the
 * crew glow, drop a sheet mid-slide and fight the narrator's thumb.
 */
function syncTicker(): void {
  const running = isRunning(timer) && remaining(timer, Date.now()) > 0
  if (running && ticker === null) ticker = window.setInterval(tick, 250)
  if (!running && ticker !== null) {
    window.clearInterval(ticker)
    ticker = null
  }
}

function tick(): void {
  const now = Date.now()
  const seconds = remaining(timer, now)
  const digits = root.querySelector<HTMLElement>('[data-timer-digits]')
  const text = formatClock(seconds)
  if (digits && digits.textContent !== text) digits.textContent = text
  if (seconds > 0) return

  // Time is up: park the clock at zero and say so. A held role card must
  // never be rebuilt under a finger, so if the narrator is mid-reveal the
  // row simply reads "time is up" on the way back to the day.
  setTimer(pauseTimer(timer, now))
  buzz([120, 80, 120])
  if (state.screen === 'day' && !document.body.classList.contains('is-revealing')) {
    setState({}, false)
  } else {
    syncTicker()
  }
}

/** Writes the role card in beside the live button — no re-render. */
function showRole(): void {
  const player = revealOrder()[state.revealIndex]
  const slot = root.querySelector<HTMLElement>('[data-card]')
  if (!player || !slot) return

  slot.innerHTML = roleCardMarkup(player, state.locale)
  // The bar filled and the card is up: this seat has genuinely looked.
  held.add(player.id)
  root.querySelector<HTMLElement>('[data-reveal-root]')?.setAttribute('data-showing', '')
  // Nothing may sit beside a visible role.
  document.body.classList.add('is-revealing')
}

/**
 * Hides the role on release but stays on this player.
 *
 * Releasing used to advance, so a fumbled press skipped someone with no way
 * back. Advancing is now [data-reveal-next] only.
 */
function hideRole(): void {
  const slot = root.querySelector<HTMLElement>('[data-card]')
  if (slot) slot.innerHTML = ''
  root.querySelector<HTMLElement>('[data-reveal-root]')?.removeAttribute('data-showing')
  document.body.classList.remove('is-revealing')
}

/** Moves the pass-around on to the next player, or back to the game. */
function advanceReveal(): void {
  hideRole()
  releaseHandler?.()
  releaseHandler = null
  revealPhase = 'handoff'
  revealDir = 'next'

  if (state.revealMode === 'single') {
    singleTarget = null
    setState({ screen: state.revealReturnTo })
    return
  }

  const order = revealOrder()
  const last = state.revealIndex >= order.length - 1
  setState({ revealIndex: last ? order.length : state.revealIndex + 1 })
}

render()
