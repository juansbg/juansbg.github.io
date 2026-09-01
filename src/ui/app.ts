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
  winner,
  type PlayerSetup,
} from '../engine/state'
import type { NightAction, PlayerId } from '../engine/types'
import { detectLocale, renderWinner, strings } from '../i18n'
import { buzz, esc, on, swap } from './dom'
import { clear, load, save, type AppState } from './store'
import { countPickerMarkup, editorMarkup, MIN_PLAYERS, rosterMarkup } from './screens/setup'
import { dayMarkup, nightMarkup } from './screens/night'
import { bindHold, bindRelease, revealMarkup, type RevealPhase } from './screens/reveal'

const appRoot = document.querySelector<HTMLDivElement>('#app')
if (!appRoot) throw new Error('#app not found')
const root: HTMLDivElement = appRoot

let state: AppState = boot()
/** Local to the reveal screen; never persisted — a held role must not resume. */
let revealPhase: RevealPhase = 'handoff'
let editing: PlayerId | null = null
let picking = false
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
    }
  }

  return {
    session: newSession(createGame([])),
    locale,
    screen: 'setup',
    revealIndex: 0,
    revealMode: 'onboarding',
    revealReturnTo: 'night',
  }
}

const setState = (patch: Partial<AppState>, animate = true): void => {
  state = { ...state, ...patch }
  save(state)
  if (animate) swap(render)
  else render()
}

const mutate = (change: Parameters<typeof advance>[1]): void => {
  setState({ session: advance(state.session, change) })
}

// ---------------------------------------------------------------------------
// Render
// ---------------------------------------------------------------------------

function render(): void {
  const game = state.session.current
  const t = strings(state.locale)
  document.documentElement.lang = state.locale

  releaseHandler?.()
  releaseHandler = null

  let body: string

  if (state.screen === 'setup') {
    body = game.players.length === 0
      ? countPickerMarkup(state.locale)
      : rosterMarkup(game.players, state.locale)
    if (editing !== null) {
      const player = game.players.find((p) => p.id === editing)
      if (player) body += editorMarkup(player, state.locale)
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
        })
      : revealDoneMarkup()
  } else if (state.screen === 'night') {
    body = isNightComplete(game) ? nightDoneMarkup() : nightMarkup(game, state.locale)
  } else if (state.screen === 'day') {
    body = game.awaitingHunterShot !== null ? hunterMarkup() : dayMarkup(game, state.locale)
    if (picking) body += pickerMarkup()
  } else {
    body = overMarkup()
  }

  root.innerHTML = `${body}${chromeMarkup()}`
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
        <div class="targets">${targets}</div>
      </section>
    `
  }

  function overMarkup(): string {
    const line = renderWinner(winner(game), state.locale) ?? ''
    return `
      <section class="screen screen--center">
        <h1 class="title title--sm">${esc(t.ui.over.title)}</h1>
        <p class="winner">${esc(line)}</p>
        <button class="btn btn--primary" type="button" data-restart>${esc(t.ui.over.playAgain)}</button>
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
        <div class="sheet__panel" role="dialog" aria-modal="true">
          <p class="subtitle subtitle--sm">${esc(t.ui.reveal.pickPlayer)}</p>
          <div class="targets">${options}</div>
          <button class="btn btn--ghost" type="button" data-pick-cancel>${esc(t.ui.common.cancel)}</button>
        </div>
      </div>
    `
  }

  function chromeMarkup(): string {
    // Hidden during a reveal: nothing may sit beside a held role.
    if (state.screen === 'reveal' && revealPhase === 'revealed') return ''
    const other = state.locale === 'es' ? 'en' : 'es'
    return `
      <nav class="chrome">
        <button class="icon-btn" type="button" data-lang>${esc(strings(other).languageName)}</button>
        ${state.screen !== 'setup' ? `<button class="icon-btn" type="button" data-reset aria-label="${esc(t.ui.common.restart)}">⟲</button>` : ''}
      </nav>
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
    setState({ locale: state.locale === 'es' ? 'en' : 'es' })
  })

  on(root, '[data-reset]', 'click', () => {
    clear()
    editing = null
    singleTarget = null
    state = boot()
    setState({ session: newSession(createGame([])), screen: 'setup', revealIndex: 0 })
  })

  // ---- Setup ----
  on(root, '[data-count]', 'click', (_e, el) => {
    const count = Number(el.dataset.count ?? MIN_PLAYERS)
    const setups: PlayerSetup[] = Array.from({ length: count }, () => ({
      name: '',
      roleId: 'PLAIN' as RoleId,
    }))
    buzz()
    setState({ session: newSession(createGame(setups)) })
  })

  on(root, '[data-seat]', 'click', (_e, el) => {
    editing = Number(el.dataset.seat)
    setState({}, false)
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

  if (state.screen === 'reveal') {
    bindHold(
      root,
      () => {
        revealPhase = 'revealed'
        render()
        releaseHandler = bindRelease(hideRole)
      },
      hideRole,
    )
  }

  on(root, '[data-begin]', 'click', () => {
    setState({ session: advance(state.session, startNight), screen: 'night' })
  })

  // ---- Night ----
  on(root, '[data-target]', 'click', (_e, el) => {
    const roleId = currentStep(game)
    if (roleId === null) return
    const target = Number(el.dataset.target)
    buzz()
    mutate((s) => recordAction(s, targetAction(roleId, target)))
  })

  on(root, '[data-potion]', 'click', (_e, el) => {
    const potion = el.dataset.potion === 'heal' ? 'heal' : 'kill'
    const chosen = root.querySelector<HTMLElement>('[data-target][data-chosen]')
    const target = chosen ? Number(chosen.dataset.target) : game.players.find((p) => p.alive)?.id ?? 0
    buzz()
    mutate((s) => recordAction(s, { kind: 'potion', roleId: 'MEDIC', target, potion }))
  })

  on(root, '[data-skip]', 'click', () => {
    const roleId = currentStep(game)
    if (roleId === null) return
    mutate((s) => recordAction(s, { kind: 'skip', roleId }))
  })

  on(root, '[data-undo]', 'click', () => {
    if (!canUndo(state.session)) return
    buzz()
    setState({ session: undo(state.session) })
  })

  on(root, '[data-resolve]', 'click', () => {
    mutate(endNight)
    if (winner(state.session.current) !== null) setState({ screen: 'over' })
    else setState({ screen: 'day' })
  })

  // ---- Day ----
  on(root, '[data-lynch]', 'click', (_e, el) => {
    buzz()
    mutate((s) => lynch(s, Number(el.dataset.lynch)))
    if (winner(state.session.current) !== null) setState({ screen: 'over' })
    else setState({})
  })

  on(root, '[data-shoot]', 'click', (_e, el) => {
    mutate((s) => hunterShot(s, Number(el.dataset.shoot)))
    if (winner(state.session.current) !== null) setState({ screen: 'over' })
    else setState({})
  })

  on(root, '[data-next-night]', 'click', () => {
    mutate(startNight)
    setState({ screen: 'night' })
  })

  // ---- Revisit a role ----
  on(root, '[data-show-role]', 'click', () => {
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
    setState({ session: newSession(createGame([])), screen: 'setup', revealIndex: 0 })
  })
}

function hideRole(): void {
  if (state.screen !== 'reveal' || revealPhase !== 'revealed') return
  releaseHandler?.()
  releaseHandler = null

  const order = revealOrder()
  const last = state.revealIndex >= order.length - 1

  revealPhase = 'handoff'

  if (state.revealMode === 'single') {
    singleTarget = null
    setState({ screen: state.revealReturnTo })
    return
  }

  setState({ revealIndex: last ? order.length : state.revealIndex + 1 })
}

const targetAction = (roleId: RoleId, target: PlayerId): NightAction => {
  const spec = ROLES[roleId].target
  if (spec.kind === 'twoPlayers') {
    return { kind: 'pair', roleId, first: target, second: target }
  }
  return { kind: 'target', roleId, actor: null, target }
}

render()
