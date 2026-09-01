// Sprint 0: app shell only. The real UI arrives in Sprint 3, rendering from
// engine state — nothing here should accumulate game logic or user-visible
// strings in the meantime.
import './ui/styles.css'

const app = document.querySelector<HTMLDivElement>('#app')
if (!app) throw new Error('#app not found')

app.innerHTML = `
  <main class="shell">
    <h1 class="shell__title">Pueblo Duerme</h1>
    <p class="shell__note">v3 — scaffolding</p>
  </main>
`
