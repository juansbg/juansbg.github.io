// A player's phone. Joins the room with a name, keeps a key pair the relay
// never sees, and renders the one projection sealed for this seat: the card
// under a hold, the vote by day, "you are out" after. Same fonts, tokens and
// card as the narrator's phone; none of the narrator's handlers.
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
import { bindHold, roleCardMarkup } from './ui/screens/reveal'
import { seatCenter as center, seatMarkup, seatPlayer } from './ui/screens/seat'
import { esc, on } from './ui/dom'

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
let joined = false
let refused = false
let projection: SeatProjection | null = null
let link: PlayerLink | null = null
let releaseHold: (() => void) | null = null

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
  if (room === null || relay === '') {
    body = center(`<h1 class="title title--sm">${esc(t.ui.tv.noRoom)}</h1>`)
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
    body = seatMarkup(projection, locale)
  }

  root.innerHTML = `
    <main class="stage stage--seat">${body}</main>
    ${joined && status !== 'open' ? `<p class="tv__status">${esc(t.ui.tv.reconnecting)}</p>` : ''}
  `

  bind()
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
  }
  render()
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
  })
  render()
}

// `on` binds to the elements that exist now, so it runs after every paint.
const bind = (): void => {
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
}

// A background tab or a dropped finger must never leave a card on screen.
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    const slot = root.querySelector('[data-card]')
    if (slot) slot.innerHTML = ''
    document.body.classList.remove('is-revealing')
  }
})

void start()
