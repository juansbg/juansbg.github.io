// Sprint 2: the shell now renders through the string layer, so the i18n path
// is exercised end to end. The real UI arrives in Sprint 3 — nothing here
// should accumulate game logic, and no string may be written inline.
import './ui/styles.css'
import { detectLocale, strings, type Locale } from './i18n'

const app = document.querySelector<HTMLDivElement>('#app')
if (!app) throw new Error('#app not found')

let locale: Locale = detectLocale(navigator.languages ?? [navigator.language])

const render = (): void => {
  const t = strings(locale)

  app.innerHTML = `
    <main class="shell">
      <h1 class="shell__title">${t.appName}</h1>
      <p class="shell__note">${t.phase.nightFalls}</p>
      <button class="shell__lang" type="button" data-lang>
        ${strings(locale === 'es' ? 'en' : 'es').languageName}
      </button>
    </main>
  `

  app.querySelector<HTMLButtonElement>('[data-lang]')?.addEventListener('click', () => {
    locale = locale === 'es' ? 'en' : 'es'
    document.documentElement.lang = locale
    render()
  })
}

document.documentElement.lang = locale
render()
