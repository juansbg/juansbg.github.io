// The TV: a page that joins a room as a screen and renders whatever the
// narrator's phone publishes. Same fonts, same tokens, same table markup as
// the phone's table view, so the two never drift. No handlers, no game.
import '@fontsource/bebas-neue/latin-400.css'
import '@fontsource/ibm-plex-sans/latin-400.css'
import '@fontsource/ibm-plex-sans/latin-500.css'
import '@fontsource/ibm-plex-sans/latin-600.css'
import '@fontsource/ibm-plex-mono/latin-400.css'
import '@fontsource/ibm-plex-mono/latin-500.css'
import './ui/styles.css'

import { detectLocale, strings, type Locale } from './i18n'
import { parseFragment, ScreenLink, type LinkStatus } from './room/client'
import type { TvProjection } from './room/projections'
import { tableMarkup } from './ui/screens/table'
import { esc } from './ui/dom'

const root = document.querySelector<HTMLDivElement>('#app')
if (!root) throw new Error('#app missing')

const { room, relay } = parseFragment(location.hash)
let projection: TvProjection | null = null
let status: LinkStatus = 'connecting'
const fallback: Locale = detectLocale(navigator.languages ?? [navigator.language])

const render = (): void => {
  const locale = projection?.locale ?? fallback
  const t = strings(locale).ui.tv
  document.documentElement.lang = locale
  document.documentElement.dataset['phase'] = projection?.phase ?? 'night'

  let body: string
  if (room === null || relay === '') {
    body = `<section class="screen screen--center"><h1 class="title title--sm">${esc(t.noRoom)}</h1></section>`
  } else if (projection === null) {
    body = `
      <section class="screen screen--center">
        <p class="label">${esc(t.title)}</p>
        <h1 class="title tv__code">${esc(room)}</h1>
        <p class="subtitle">${esc(status === 'open' ? t.waiting : t.reconnecting)}</p>
      </section>`
  } else {
    body = tableMarkup(withClock(projection), false)
  }

  root.innerHTML = `
    <main class="stage stage--tv">${body}</main>
    ${projection !== null && status !== 'open' ? `<p class="tv__status">${esc(t.reconnecting)}</p>` : ''}
  `
}

/** The clock counts down here: the phone publishes the deadline, not every second. */
const withClock = (p: TvProjection): TvProjection => {
  if (p.timer === null || p.timer.endsAt === null) return p
  const seconds = Math.max(0, Math.ceil((p.timer.endsAt - Date.now()) / 1000))
  return { ...p, timer: { ...p.timer, seconds, phase: seconds === 0 ? 'done' : 'running' } }
}

if (room !== null && relay !== '') {
  new ScreenLink(
    relay,
    room,
    (next) => {
      projection = next
      render()
    },
    (next) => {
      status = next
      render()
    },
  )
}

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
