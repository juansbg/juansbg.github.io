import { ROLES, isRoleId, type RoleId } from '../engine/roles'
import {
  advance,
  canUndo,
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
  type PlayerSetup,
  type TimelineEntry,
} from '../engine/state'
import type { NightAction, PlayerId } from '../engine/types'
import { detectLocale, renderWinner, strings } from '../i18n'
import { buzz, esc, on, swap } from './dom'
import { clear, clearRoster, load, loadRoster, save, saveRoster, type AppState } from './store'
import { editorMarkup, MIN_PLAYERS, namesMarkup, rosterMarkup } from './screens/setup'
import { dealRoles, systemRandom, type Complexity } from '../engine/deal'
import { dayMarkup, inspectionMarkup, nightMarkup, questionCardMarkup, questionsIntroMarkup } from './screens/night'
import { circleMarkup } from './screens/circle'
import { historyMarkup, timelineMarkup } from './screens/timeline'
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
let showingLog = false
/** The overflow sheet behind the ⋯ button. */
let menuOpen = false
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
  if (animate) swap(render)
  else render()
}

const mutate = (
  change: Parameters<typeof advance>[1],
  entry?: TimelineEntry,
): void => {
  setState({ session: advance(state.session, change, entry) })
}

// ---------------------------------------------------------------------------
// Render
// ---------------------------------------------------------------------------

function render(): void {
  const game = state.session.current
  const t = strings(state.locale)
  document.documentElement.lang = state.locale
  document.documentElement.dataset.phase =
    state.screen === 'night' ? 'night' : state.screen === 'day' ? 'day' : 'neutral'

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
        : nightMarkup(game, state.locale, picked, state.layout)
  } else if (state.screen === 'day') {
    body =
      game.awaitingHunterShot !== null
        ? hunterMarkup()
        : dayMarkup(game, state.locale, state.layout)
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

  root.innerHTML = `<main class="stage">${body}</main>${overlay}${chromeMarkup()}`
  bind()

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
      <section class="screen screen--day" style="--role: var(--role-AVENGE)">
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
      state.screen === 'day' ? row('data-show-role', t.ui.reveal.showAgain) : '',
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
    setState({}, false)
  })

  on(root, '[data-reset]', 'click', () => {
    if (!window.confirm(strings(state.locale).ui.menu.restartConfirm)) return
    // Forget the game, keep the people: the names come back on the next screen.
    clear()
    names = loadRoster()
    editing = null
    singleTarget = null
    inspecting = null
    showingLog = false
    menuOpen = false
    picked = []
    state = boot()
    setState({ session: newSession(createGame([])), screen: 'setup', revealIndex: 0 })
  })

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

  on(root, '[data-clear-names]', 'click', () => {
    // The remembered list is the one thing a reset keeps, so wiping it is
    // deliberate and asks first.
    if (!window.confirm(strings(state.locale).ui.setup.clearConfirm)) return
    names = []
    clearRoster()
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
    }
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
    picked = []
    const session = revertTo(state.session, index)
    buzz()
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
    buzz()
    setState({ session: undo(state.session) })
  })

  on(root, '[data-resolve]', 'click', () => {
    mutate(endNight, { night: game.night, kind: 'nightEnd' })
    if (winner(state.session.current) !== null) setState({ screen: 'over' })
    else setState({ screen: 'day' })
  })

  // ---- Day ----
  on(root, '[data-lynch]', 'click', (_e, el) => {
    buzz()
    mutate((s) => lynch(s, Number(el.dataset.lynch)), {
      night: game.night, kind: 'lynch', target: Number(el.dataset.lynch),
    })
    if (winner(state.session.current) !== null) setState({ screen: 'over' })
    else setState({})
  })

  on(root, '[data-shoot]', 'click', (_e, el) => {
    mutate((s) => hunterShot(s, Number(el.dataset.shoot)), {
      night: game.night, kind: 'hunterShot', target: Number(el.dataset.shoot),
    })
    if (winner(state.session.current) !== null) setState({ screen: 'over' })
    else setState({})
  })

  on(root, '[data-next-night]', 'click', () => {
    mutate(startNight, { night: game.night + 1, kind: 'nightStart' })
    setState({ screen: 'night' })
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

  // End early and see the whole game — v1's flag button.
  on(root, '[data-finish]', 'click', () => {
    if (!window.confirm(strings(state.locale).ui.menu.endGameConfirm)) return
    menuOpen = false
    buzz()
    setState({ screen: 'over' })
  })
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
