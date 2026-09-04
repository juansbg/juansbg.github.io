import { ROLES, isRoleId, type RoleId } from '../engine/roles'
import {
  advance,
  canUndo,
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
  type TimelineEntry,
} from '../engine/state'
import type { NightAction, PlayerId } from '../engine/types'
import { detectLocale, renderWinner, strings } from '../i18n'
import { accentOf } from './accent'
import { buzz, esc, on, swap } from './dom'
import { sound, unlockOnGesture } from './sound'
import { clear, clearRoster, load, loadRoster, loadTimer, save, saveRoster, saveTimer, type AppState } from './store'
import { editorMarkup, MIN_PLAYERS, namesMarkup, rosterMarkup } from './screens/setup'
import { dealRoles, systemRandom, type Complexity } from '../engine/deal'
import { dayMarkup, inspectionMarkup, nightMarkup, playerViewMarkup, questionCardMarkup, questionsIntroMarkup } from './screens/night'
import { circleMarkup } from './screens/circle'
import { dawnMarkup, dawnSlides, verdictSlides, type Reading, type Slide } from './screens/dawn'
import { historyMarkup, timelineMarkup } from './screens/timeline'
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
/** The dawn slideshow: which slide is up, or null when the report is a list. */
let dawn: number | null = null
/**
 * The night ended on the Avenger's death: the slideshow waits for the shot,
 * so the town hears the whole morning at once.
 */
let showAfterShot: Reading | null = null
/** Which reading is up: the morning's, or the town's verdict. */
let dawnKind: Reading = 'dawn'
const currentSlides = (): Slide[] =>
  (dawnKind === 'verdict' ? verdictSlides : dawnSlides)(state.session.current, state.locale)
/** The overflow sheet behind the ⋯ button. */
let menuOpen = false
/**
 * A destructive action waiting for a second tap. Native `window.confirm`
 * flashes a white system dialog, which in a dark room is a torch in the
 * face; this is the same question asked on our own sheet.
 */
type Pending = 'restart' | 'clearNames' | 'finish'
let confirming: Pending | null = null
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
/**
 * Recording the town's vote: on or off, and the voter whose pick is awaited.
 * Off, a tap on a seat executes; on, it votes. Every move that leaves the
 * day turns it off.
 */
let voting = false
let voter: PlayerId | null = null

const leaveDay = (): void => {
  voting = false
  voter = null
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

const setState = (patch: Partial<AppState>, animate = true): void => {
  state = { ...state, ...patch }
  save(state)
  if (animate) swap(() => render(true))
  else render(false)
}

const mutate = (
  change: Parameters<typeof advance>[1],
  entry?: TimelineEntry,
): void => {
  // Any move belongs to the narrator, so the phone comes back to them — and
  // the next step starts safe to turn around again.
  showingPlayer = false
  peeking = false
  setState({ session: advance(state.session, change, entry) })
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
function render(entering = false): void {
  const game = state.session.current
  const t = strings(state.locale)
  document.documentElement.lang = state.locale
  document.documentElement.dataset.phase =
    state.screen === 'night' ? 'night' : state.screen === 'day' ? 'day' : 'neutral'
  // The wind and the drone under the whole night, off with the morning.
  sound.night(state.screen === 'night')

  // The slideshow only exists on the day screen; anything that leaves it
  // (undo, rewind, next night, restart) drops the slide with it.
  if (state.screen !== 'day' || game.awaitingHunterShot !== null) dawn = null
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
  } else if (state.screen === 'setup') {
    body = game.players.length === 0
      ? namesMarkup(names, state.locale)
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
          : nightMarkup(game, state.locale, picked, state.layout, peeking)
  } else if (state.screen === 'day') {
    body =
      game.awaitingHunterShot !== null
        ? hunterMarkup()
        : dawn !== null
          ? dawnMarkup(slides, dawn, game.night, state.locale, dawnKind)
          : dayMarkup(
              game, state.locale, state.layout, peeking, viewOf(timer, Date.now()),
              voting ? { armed: voter } : null,
            )
    if (picking) sheets += pickerMarkup()
  } else {
    body = overMarkup()
  }

  // Sheets are fixed overlays, so they are siblings of the stage rather than
  // children of the screen: a screen mid-animation has a transform, which
  // would make it the containing block and pin the sheet inside it.
  let overlay = sheets
  if (showingLog) overlay += timelineMarkup(state.session, state.locale)
  if (menuOpen) overlay += menuMarkup()
  if (confirming !== null) overlay += confirmMarkup(confirming)

  root.innerHTML = `<main class="stage"${entering ? ' data-enter' : ''}>${body}</main>${overlay}${chromeMarkup()}`
  bind()
  syncTicker()

  function revealDoneMarkup(): string {
    return `
      <section class="screen screen--center">
        <h1 class="title title--sm">${esc(t.ui.reveal.allSeen)}</h1>
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
    const line = renderWinner(winner(game), state.locale) ?? ''
    // The whole game as coloured cards, night by night: v1's finishGame view.
    return `
      <section class="screen screen--over">
        <h1 class="title title--sm">${esc(t.ui.over.title)}</h1>
        ${line ? `<p class="winner">${esc(line)}</p>` : ''}
        ${circleMarkup(game.players, state.locale, { showRoles: true, revealTeams: true, compact: true })}
        <h2 class="label">${esc(t.ui.over.history)}</h2>
        ${historyMarkup(game, state.locale)}
        <div class="actions">
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
    // A player is looking at the screen: the timeline would show them every
    // move so far, and the menu can end the game.
    if (state.screen === 'night' && showingPlayer && !isNightComplete(game)) return ''
    const inGame = state.screen !== 'setup'
    const timeline = inGame
      ? `<button class="bar__btn" type="button" data-log>${esc(t.ui.timeline.open)}</button>`
      : '<span></span>'
    return `
      <nav class="bar">
        ${timeline}
        <button class="bar__menu" type="button" data-menu aria-haspopup="dialog"
                aria-label="${esc(t.ui.menu.more)}" title="${esc(t.ui.menu.more)}">⋯</button>
      </nav>
    `
  }

  /**
   * One question, two answers. The destructive one carries the same label
   * as the row that opened it, so the narrator confirms the thing they tapped.
   */
  function confirmMarkup(pending: Pending): string {
    const copy = {
      restart: { question: t.ui.menu.restartConfirm, action: t.ui.common.restart },
      clearNames: { question: t.ui.setup.clearConfirm, action: t.ui.setup.clearNames },
      finish: { question: t.ui.menu.endGameConfirm, action: t.ui.over.finishNow },
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
        ? `<div class="menu__item menu__item--static">
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
      state.screen === 'day' ? row('data-show-role', t.ui.reveal.showAgain) : '',
      row('data-mute', t.ui.menu.sound, sound.muted() ? t.ui.menu.off : t.ui.menu.on),
      installPrompt ? row('data-install', t.ui.menu.install) : '',
      inPlay ? row('data-finish', t.ui.over.finishNow, '', true) : '',
      restartable ? row('data-reset', t.ui.common.restart, '', true) : '',
    ].join('')

    return `
      <div class="sheet" data-sheet>
        <div class="sheet__panel" role="dialog" aria-modal="true" aria-label="${esc(t.ui.menu.more)}">
          <div class="sheet__head"><span class="sheet__handle" aria-hidden="true"></span></div>
          <div class="menu">${items}</div>
          <button class="btn btn--ghost" type="button" data-menu-close>${esc(t.ui.common.close)}</button>
        </div>
      </div>
    `
  }
}

/** Living players, in seating order — the order the phone travels. */
const revealOrder = () =>
  state.revealMode === 'single'
    ? state.session.current.players.filter((p) => p.id === singleTarget)
    : state.session.current.players

let singleTarget: PlayerId | null = null

// ---------------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------------

function bind(): void {
  const game = state.session.current

  on(root, '[data-lang]', 'click', () => {
    menuOpen = false
    setState({ locale: state.locale === 'es' ? 'en' : 'es' })
  })

  on(root, '[data-menu]', 'click', () => {
    menuOpen = true
    setState({}, false)
  })

  on(root, '[data-menu-close]', 'click', () => {
    menuOpen = false
    setState({}, false)
  })

  // Tapping the dimmed backdrop closes whichever sheet is up. For the editor
  // that is a cancel: nothing is saved until Save.
  on(root, '[data-sheet]', 'click', (event, el) => {
    if (event.target !== el) return
    menuOpen = false
    showingLog = false
    picking = false
    editing = null
    confirming = null
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
  on(root, '[data-clear-names]', 'click', () => ask('clearNames'))
  on(root, '[data-finish]', 'click', () => ask('finish'))

  on(root, '[data-confirm-cancel]', 'click', () => {
    confirming = null
    setState({}, false)
  })

  on(root, '[data-confirm-ok]', 'click', () => {
    const pending = confirming
    confirming = null
    if (pending === 'restart') reset()
    else if (pending === 'clearNames') clearNames()
    else if (pending === 'finish') finish()
  })

  function ask(pending: Pending): void {
    menuOpen = false
    confirming = pending
    setState({}, false)
  }

  function reset(): void {
    // Forget the game, keep the people: the names come back on the next screen.
    clear()
    names = loadRoster()
    editing = null
    singleTarget = null
    inspecting = null
    showingPlayer = false
    showingLog = false
    menuOpen = false
    picked = []
    leaveDay()
    state = boot()
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
    revealPhase = 'handoff'
    buzz()
    setState({ screen: 'reveal', revealIndex: 0, revealMode: 'onboarding' })
  })

  // ---- Reveal ----
  on(root, '[data-confirm-identity], [data-confirm]', 'click', () => {
    if (state.screen === 'reveal') {
      revealPhase = 'confirm'
      setState({}, false)
    }
  })

  on(root, '[data-back]', 'click', () => {
    revealPhase = 'handoff'
    setState({}, false)
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
    setState({ revealIndex: state.revealIndex - 1 })
  })

  if (state.screen === 'reveal') {
    // No re-render inside the gesture: unmounting the held button would fire
    // pointercancel on touch and read as an instant release. The card is
    // written into a slot beside the live button instead.
    releaseHandler = bindHold(root, { onReveal: showRole, onHide: hideRole })
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
    setState({ session, screen: session.current.phase === 'day' ? 'day' : 'night' })
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
    buzz()
    setState({ session: undo(state.session) })
  })

  on(root, '[data-resolve]', 'click', () => {
    mutate(endNight, { night: game.night, kind: 'nightEnd' })
    const morning = state.session.current
    if (winner(morning) !== null) {
      setState({ screen: 'over' })
      return
    }
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
    buzz([120, 80, 120])
    sound.drum()
    // The vote ends the discussion, whatever the clock says.
    leaveDay()
    mutate((s) => lynch(s, Number(el.dataset.lynch)), {
      night: game.night, kind: 'lynch', target: Number(el.dataset.lynch),
    })
    const afternoon = state.session.current
    if (winner(afternoon) !== null) {
      setState({ screen: 'over' })
      return
    }
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
    if (winner(state.session.current) !== null) setState({ screen: 'over' })
    else {
      if (showAfterShot !== null) {
        dawnKind = showAfterShot
        dawn = 0
      }
      showAfterShot = null
      setState({})
    }
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
    if (dawn >= count - 1) dawn = null
    else dawn += 1
    setState({}, false)
  })

  on(root, '[data-dawn-prev]', 'click', () => {
    if (dawn === null || dawn === 0) return
    dawn -= 1
    setState({}, false)
  })

  on(root, '[data-dawn-close]', 'click', () => {
    dawn = null
    setState({}, false)
  })

  on(root, '[data-next-night]', 'click', () => {
    leaveDay()
    mutate(startNight, { night: game.night + 1, kind: 'nightStart' })
    setState({ screen: 'night' })
  })

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

  on(root, '[data-restart]', 'click', () => {
    clear()
    names = loadRoster()
    setState({ session: newSession(createGame([])), screen: 'setup', revealIndex: 0 })
  })

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
