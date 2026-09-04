# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

**Omertà** — a narrator assistant for a social-deduction party game in the Werewolf/Mafia family. It is a tool for the single person running the game, not for the players. It tracks who has which role, walks the narrator through the night step by step in script order, resolves kills and protections, and prints a morning report.

The game is themed around **organised crime**, with a light occult streak on two roles. It began as a Spanish werewolf game (*Pueblo Duerme*, still live in `legacy/`) and was re-themed during the v3 rewrite. It ships in Spanish and English.

Deployed as a GitHub Pages site (`juansbg.github.io`).

## Current state: a v3 rewrite is underway

The project is being rebuilt. The roadmap is six sprints; **all six are done.** v3 is the live site at the root; the old trees are no longer deployed.

`src/engine/` is complete and at full narrator-script parity: every role that takes a night step is wired end to end, including the ones that used to be prompted and then ignored (see "Every night step is real" below). `src/i18n/` holds the Spanish and English string tables and the outcome renderer. 282 tests, no DOM, no strings in the engine. A simulator plays whole games against the engine and a balance test runs on every test run (see "The simulator" below). The app installs and runs offline (see "The app is a PWA" below). The UI lives in `src/ui/`: one token set in `tokens.css`, screens in `src/ui/screens/`, autosave in `store.ts`.

`STATE_VERSION` is 2. Version 1 saves did not track the Apothecary's vials; `store.ts` migrates them on load (`healUsed`/`poisonUsed` default to false) rather than dropping the game. Bump the version again only with a migration beside it.

### How the narrator's flow works now

- **Setup is names only.** `screens/setup.ts` starts with a single field: type a name, Enter, repeat. The player count is how many names were typed; there is no count picker. The list is remembered in `omerta:roster` across resets — reset forgets the game, not the people — and a separate "Clear the list" asks before wiping it.
- **Roles are dealt at random** (`engine/deal.ts`) by default; manual assignment stays as an override. The crew is `floor((n + 1) / 4)`, one at five or six players, two up to ten, three up to fourteen; the Godfather is dealt from `GODFATHER_FROM` (eight) players up. Both numbers came out of the simulator: rounding to nearest gave six players two crew, and one conversion then ended the game on the first morning half the time. The dealer only ever hands out roles the engine fully resolves — `NOT_AUTO_DEALT` lists the exceptions and a test enforces it. The list is now just `SPLIT` (the script gives the Cultist no win condition, so it is a pure manipulation card and a table must choose it) and `PICK_SIDE` (counts as crew for the deal but may stay with the town, so it would unbalance whichever side it does not pick). The Chameleon (`SWAP`) is dealt at complex tables since its card picker exists.
- **Every night step is real.** Each of these was once a prompt whose answer went nowhere; the fix for each lives in `screens/night.ts` and `engine/resolve.ts`:
  - *The Godfather* (`CONVERT`) is asked after the Family has chosen, with the victim named and two buttons — take them in, or let the hit go ahead (`data-night-confirm` / `data-skip`). It used to offer only Confirm, so every prompted night converted. Once the one conversion is spent (`infectionUsed`) `scheduleFor` drops his step; he still wakes with the Family, there is just nothing to ask.
  - *The Associate* (`PICK_SIDE`) records a `chooseRole` to `KILLER` or `PLAIN` on night one (`data-choose-role`). A bare `confirm` was recorded before, which the resolver ignores.
  - *The Apothecary* (`MEDIC`) has one cure and one poison per game (`healUsed`, `poisonUsed` on `GameState`). The cure only unlocks on someone `doomedTonight()` says is about to die; the poison on anyone living. A cure poured on the living is not spent. When both are gone the step still appears with a note to wake her anyway, so the table learns nothing.
  - *The Chameleon* (`SWAP`) picks from `spareCards()` in `engine/cards.ts`: every town card nobody at the table holds, minus first-night-only cards (already inert by his step) and the plain Citizen. Taking one is a `chooseRole`; the table hears which card left the centre via a public `cardTaken` outcome and never who took it. The Veteran's free life travels with its card.
  - *The Cultist* (`SPLIT`) taps seats into the first faction, the rest form the second, and `data-split-confirm` stays locked until both have someone. The split is recorded on `Player.sect` and shown only to the Cultist; no win condition is implemented, by design.
  - *The Renegade* (`ROGUE`) may target his own side — only `KILLER` is kept off the crew in `legalTargets`.
  - *The Family's hit* is scheduled while anyone who wakes with the Family is alive (`scheduleFor` adds `KILLER` for any living crew member except an unjoined Associate). It used to need a living plain member, so a Family of just the Godfather and the Renegade slept through the rest of the game.
- **The night table is safe to turn around by default.** At every night step the circle is rendered through the acting role's perspective (`perspectiveFor()` in `screens/night.ts`): no role labels, sigils, team colours or question flags, only what that role already knows, and still tappable for the narrator. A Roles toggle in the night header (`data-peek`) brings the narrator's full board back for that step only and resets on every move. Show renders `playerViewMarkup`, the same perspective as a full screen with no controls and no bar, for holding up across the table. What each role sees is decided in one place, `perspectiveFor()`. The Family sees the whole Family in one red with no "you" mark, so nothing singles out which red seat is the Godfather or the Renegade. The Godfather also sees the Family's pick. The Apothecary sees who is set to die and which vials she has left. The Chameleon sees the centre; the Cultist sees both factions as they form. Everyone else sees a plain table and their own seat. `circleMarkup` takes a `perspective` option for this and ignores every narrator-facing option when it is set. The leak tests in `night.test.ts` ("the player's view") check both languages — **do not weaken them**, and route any new per-role knowledge through `perspectiveFor`, never through the markup directly.
- **The seating circle is the target picker** (`screens/circle.ts`). Seats render as `data-seat` / `data-target` / `data-lynch` depending on the question, so the existing handlers pick them up. Ineligible players are dimmed and disabled, never hidden; the crew glows red for the narrator (v2's idea). A list layout is a toggle, remembered.
- **Outcomes are coloured cards** (`screens/timeline.ts`, `outcomeCardMarkup`): the morning report, the log, and the end-of-game history all colour each entry by the role that caused it via `i18n/outcomeAccent`. This is v1's `displayCards` rebuilt on structured outcomes. The page ground tints cold at night and warm by day (`html[data-phase]`).
- **The dawn slideshow** (`screens/dawn.ts`) is the morning report as a performance: it starts by itself when the night ends (after the Gunman's shot, if he died) and ▶ on the day screen replays it. Each public outcome is a full screen, a death on a Vendetta ground with Midnight ink and a line from a per-cause bank in the string tables (`ui.dawn.death`, ten lines per cause per language, each its own small story). `deathLines()` walks the whole log and gives each death its seat's own pick or the next free one, so nobody in a game is read a sentence someone else already got, and undoing the latest death moves nobody else's line. **The town's verdict is read the same way:** `verdictSlides()` opens full screen as soon as the town has voted (after the Gunman's shot, if they hanged him), under the `ui.dawn.verdict` heading; `dawnKind` in `app.ts` says which reading is up. Tonight's log is split at the first execution, so replaying the morning after a vote does not include the vote. Both readings are built from the same public outcomes as the report, hide the bar while open, and close only through their own Done.
- **The day table is plain by default too.** After the slideshow the phone may be facing the town, so `dayMarkup` shows names, who is dead and who has a question, and nothing else. The same Roles toggle as the night (`data-peek`, the `peeking` flag in `app.ts`) brings roles and the crew glow back for the narrator, and every move resets it.
- **History is persisted**, capped at `HISTORY_LIMIT` moves (`store.ts`), so the log and every "rewind to here" survive a reload. Setup edits are kept for rewinding but hidden from the log (`kind: 'setup'`).

### Layout and chrome rules

- **The page never scrolls.** `html/body/#app` are a fixed `100dvh` with overflow hidden; `#app` is a two-row grid of `.stage` over a persistent `.bar`. Only designated regions scroll: the morning report, the timeline sheet, the end-of-game history, the names list. The seating circle is sized from `min(width, height)` of its container so it shrinks on short phones. A change that makes `document.documentElement.scrollHeight > innerHeight` on any screen at 375×667 is a regression.
- **One bottom bar, one menu.** Timeline is the only first-class button; everything else (language, circle/list, show a role again, end the game, restart) lives behind ⋯. Per-screen primary actions stay in the stage. **The bar is not rendered while a player can see the screen** — during a reveal, while the phone is turned to a player (`showingPlayer`), or while a dawn slide is up — because the timeline would show them every move and the menu can end the game. Each of those is an early return in `chromeMarkup()`; they are independent and order does not matter. Do not add loose buttons to the bottom of screens.
- **Entrances play once.** `screen-in`, `seat-in`, `card-in` and `line-in` only run when the stage carries `data-enter`, which `render(true)` sets for an animated `setState` (a step, a screen, a move). `setState({}, false)` repaints the same scene without them, so a pick, the menu or a toggle never bounces the table into place again. A new entrance keyframe on stage content goes into the `.stage:not([data-enter])` list in `styles.css`; sheets and dawn slides are deliberately not in it.
- **A wipe-out is the town's win.** `winner()` no longer returns `null` when nobody is alive: every road there runs through the last crew member dying (the Gunman hanged with two left and shooting the other), and the crew-count check answers it. The `null` left the app on a day screen with an empty table.
- **Who a role may target is the engine's rule**, `legalTargets` in `engine/targets.ts`; the night screen re-exports it, and the simulator's bots pick from it, so the two cannot disagree.
- **Seats can be rearranged only during setup** (`swapSeats` / `moveSeat` in `engine/state.ts`). Ids are seating positions and are referenced from the log and lovers once play starts, so both refuse after that.
- **Destructive actions ask on our own sheet.** Clear names, end the game and restart open `confirmMarkup()` (`app.ts`, the `confirming` flag): the question in body type, Cancel, and a Vendetta button carrying the same label as the row that was tapped. They used to be `window.confirm`, which flashes a white system dialog in a dark room. Add a fourth destructive action by extending `Pending`, not by calling `window.confirm`.

### The app is a PWA

- `vite-plugin-pwa` (`vite.config.ts`) generates `sw.js` and `manifest.webmanifest` at build time and injects the manifest link; `src/main.ts` registers the worker. Everything the build emits is precached (`globPatterns` includes fonts and icons), so a complete game runs with no network. `registerType: 'autoUpdate'` means a new deploy takes over silently and reloads the page: the game is in `localStorage`, so nothing is lost, but the local flags (`showingPlayer`, `picked`, the reveal phase) reset to the narrator's side, which is the safe side.
- The worker's scope is the site root. The app lived at `/beta/` until the cutover on 2026-09-02, so `public/beta/` carries a redirect page and a `sw.js` that installs over the beta's worker, clears its caches, unregisters and sends open windows to `/`. Keep both until every phone that installed the beta has opened it once more; the root worker ignores `/beta/` (`globIgnores`, `navigateFallbackDenylist`). A saved game survives the move: `localStorage` is per origin, not per path.
- Icons are `public/icon-*.png`, rasterised from `favicon.svg` with `rsvg-convert`; the maskable one is the same fedora on a padded viewBox so it survives the platform's mask. Regenerate all three if the sigil changes.
- An install row appears in ⋯ only while the browser has fired `beforeinstallprompt` (Android/desktop Chrome). iOS has no such event; there the user adds to the home screen from Safari's share sheet, and `apple-touch-icon.png` is what it shows.
- **Verifying offline:** the in-app browser pane refuses to fetch service-worker scripts, so it cannot prove this. Build, `npx vite preview`, and drive headless Chrome over the DevTools protocol instead: register, wait for `activated`, `Network.emulateNetworkConditions {offline: true}`, navigate, and assert `#app .stage` rendered and the fonts loaded. `src/vite-env.d.ts` carries the plugin's types for `virtual:pwa-register`.

### The simulator

- `src/engine/sim/` plays whole games through the public engine API with crude bots (`policies.ts`: everyone picks a legal target at random; the town votes either at random or by following the Detective). `playGame` is the loop, `stats.ts` the summary, `report.ts` the table. `npm run sim [games]` prints it (bundled with rolldown by `scripts/sim.mjs`, since Node cannot run the extensionless TS imports directly); paste the result over the table in `docs/ROADMAP.md` after any change to the dealer, the resolver or the win conditions.
- `balance.test.ts` runs 400 games per setting, every size from 5 to 15 at every complexity under both policies, and fails on a stall, a game with no winner, more than 1% wipe-outs, more than 5% of games over before the first vote, or either side winning less than 15% of detective-led games. The bounds are loose on purpose: the bots play badly by design, and the test exists to catch a rule change that decides the game, not to tune it. **The win rates it prints are indicative, not a measurement of the real game.**
- The bots sit out `SPLIT` and `PICK_SIDE`, which the dealer never hands out. A new role with a night step needs a case in `randomNight` only if its action is not a plain target.

### Design language

**`docs/DESIGN.md` is the authority for anything visual.** Read it before touching `src/ui/`. The short version:

- **Five colours, named, and nothing else.** Vendetta `#FF0F0F` (blood, the crew, anything lethal), Midnight `#000029` (the ground), Ash `#D8D4C0` (secondary ink, hairlines, the town), Ledger `#F7F6F2` (primary ink; the one bright surface, used for the morning report and the held role card), Neon `#54F4FF` (the role glyphs on dark grounds, and nothing else: never text, a button, a surface or a side; Midnight on paper). Every other value in `tokens.css` is a `color-mix()` of these. Never add a sixth, however neutral it looks.
- **Three faces, self-hosted.** Bebas Neue for anything that is a label (titles, buttons, seat names, the marks), IBM Plex Sans for anything read aloud, IBM Plex Mono for numbers. They come from `@fontsource` packages imported in `src/main.ts`, never a CDN.
- **Radius is zero everywhere.** The `--radius-*` tokens resolve to `0`. Depth is a hairline and a surface step, not a shadow.
- **Colour is keyed by side, not by role.** Markup carries `data-accent="crew|town|occult|system"` from `src/ui/accent.ts`; the role's identity is its sigil from `src/ui/sigils.ts` (straight lines on a 24 grid, judged on `docs/sigils.html`), drawn in Neon on dark grounds and Midnight on paper. There are no per-role hues.
- **Two contrast traps:** text on a Vendetta button is Midnight, never white; red on paper is a rule or a strike-through, never small text.
- **The held role card and the inspect card carry no team colour.** The glow of a phone across a table must not say which side.

`docs/design-language.html` is the same spec rendered as a page, with live components.

### Traps worth knowing

- `doomedTonight()` (`engine/resolve.ts`) is a dry run: it calls `resolveNight` on the pending actions so far and reads the direct victims off the outcomes. That is only safe because `resolveNight` is pure. If the resolver ever gains a side effect, the Apothecary's step will trigger it twice.
- `dom.ts`'s `swap()` must always run its callback. `document.startViewTransition` rejects when the tab is hidden or a transition is in flight; an unhandled rejection there means the screen silently stops updating. It now falls back to a plain paint.
- Node 26 ships an experimental `localStorage` global that is `undefined` without `--localstorage-file` and shadows jsdom's. Tests that touch storage install a small in-memory shim (`store.test.ts`) rather than relying on either.

| | Path | Status |
|---|---|---|
| **v3** | `src/` | Active development. Vite + TypeScript. This is where all new work goes. |
| v1 | `legacy/v1/` | **Frozen.** The 2021 vanilla-JS app. No longer deployed; kept as the draft of the rules (see below). Do not modify. |
| v2 | `legacy/v2/` | **Frozen.** An abandoned 2022 jQuery rewrite that never got a night loop. Kept only for its CSS circle technique. |

The v3 roadmap, including what each sprint delivered and why, lives at `~/.claude/plans/rustling-cooking-church.md`. **What comes next is `docs/ROADMAP.md`**: the simulation results, the fixes they led to, the planned features, and which session is building what.

## Working in this repo

- **Two Claude sessions work here at once, on branches.** Feature work goes on a branch (`git worktree add` a second checkout rather than switching the branch under the other session) and is merged into `main` when both sides say they are done. Before committing, run `git worktree list` and diff the staged content *immediately* before `git commit`; a path-scoped `git add` once swept in a peer's uncommitted stylesheet rewrite. Never `git add -A`.
- **Pushing `main` deploys the live site** (`.github/workflows/deploy.yml` triggers on `main` only). Pushing any other branch is safe. The artifact is `dist/` as Vite builds it; nothing is copied in from `legacy/`.
- `.claude/` (launch configs, worktrees) is local and untracked; do not commit it.
- A worktree has no `node_modules` of its own: Vite resolves packages to the main checkout, so the `@fontsource` files 403 in dev there. The production build is unaffected.

## Commands

```bash
npm install      # first time
npm run dev      # vite dev server
npm run test     # vitest — the engine suite is the safety net
npm run build    # typecheck + production build
npm run sim      # the balance report, 3000 games per table; `npm run sim 500` for a quick one
```

Local Node is 26; CI runs 24. Vite 8, TypeScript 7, Vitest 4.

## v3 architecture

```
src/
  engine/   pure TS — no DOM, no strings, fully unit-testable
    sim/         bots that play whole games; the balance test and the report
  i18n/     es/en string tables and the outcome renderer
  ui/       renders from engine state; owns all strings and animation
    tokens.css     the ONE palette — never invent a colour outside it
    store.ts       autosave to localStorage
    screens/       setup, reveal, night (incl. the player view), circle, timeline, dawn
  vite-env.d.ts   Vite and PWA plugin ambient types
```

### The role reveal

`src/ui/screens/reveal.ts` is a pass-the-phone onboarding flow: handoff → confirm identity → **press-and-hold** to see the role. The hold is the security model, not decoration. A tap-to-reveal screen can be left face-up, handed over still showing, or screenshotted; a held reveal cannot outlive the hand holding it. `pointercancel`, `pointerleave` and `visibilitychange` all hide it, and the language/reset chrome is removed while a role is on screen. `reveal.test.ts` asserts no role name or team appears in the handoff or confirm markup, in either language — **do not weaken those tests.**

The same screen serves the mid-game "show a role again" flow in `single` mode, selected by player id from a picker.

Two rules the whole design rests on:

1. **The engine never produces a user-visible string.** It emits structured outcomes (`{type: 'kill', roleId: 'LOB', targetId: 3, blockedBy: 'PRO'}`) and the UI renders sentences at display time. v1 could never be translated because it stored rendered Spanish fragments on each event and *rewrote them mid-resolution* (`"Ha muerto "` → `"Han intentado matar a "`) to signal a blocked kill — the sentence was carrying game state.
2. **`GameState` is JSON-serializable.** Autosave and undo both fall out of this for free.

Role identity is a **function-based ID** — `KILLER`, `INSPECT`, `GUARD`, `MEDIC`, `CONVERT` — defined once in `src/engine/roles.ts`. IDs name what a role *does*, never what it is *called*, so a re-skin costs nothing but a string table. Teams are `town` and `crew`.

This is deliberate and was learned the hard way: the IDs were Spanish werewolf acronyms (`LOB`, `VID`, `BRU`) until the theme changed to organised crime and every one of them became a lie. **Never reintroduce a theme word into an ID, a team name, or a death cause.** `roles.test.ts` enforces the shape.

## Why v1 is being replaced (verified, not theoretical)

Reproduced live on the deployed site:

- **Duplicate names silently corrupt the game.** v1 matches players by display name (`legacy/v1/script.js:191`, `:309`). With two players called "Ana", killing one marks *both* dead and drops `VID` from `rollsUsed`, so the narrator is never prompted for the Vidente again — with no error and no visible sign.
- **No viewport meta**, so `window.innerWidth` is 980 on a 375px phone and the whole page is scaled down. Everything is sized in `vw` against that 980px.
- **The Bruja's choice is discarded every night** — the Curar/Matar dropdown is populated but `configureLastStep()` has no `BRU` case.
- **`fillOptionsByRoll()`'s self-exclusion is dead code** — the `else if` re-adds every non-wolf the first branch excluded, so the Vidente appears in its own target list.
- `steps` is `{}` on night 1 but `[]` later, so `steps.length` in `prevStep()` is `undefined` on the first night.
- `prevStep()` unconditionally `events.pop()`s, deleting an unrelated event when stepping back past a role that recorded none.

These are the specification for what v3's engine tests must prevent, not bugs to go fix in `legacy/`.

## Reading v1 as the specification

`legacy/v1/script.js` is the most complete statement of the game rules that exists in code, so it is worth reading before writing engine logic — but read it as a draft spec, not as a reference implementation.

- `rollOrderFirstNight` / `rollOrderNight` (`:40-41`) are the night order. `calculateNight()` filters them to roles still alive.
- `prepararInforme()` is where rules actually resolve — protection, wolf kills, the Anciano's one-time survival.
- `event.show` marks whether an action is public knowledge in the morning report; secret actions (Vidente, Protector) are recorded but not displayed. v3 keeps this distinction.

**The authority is the PDF, not v1.** `Pueblo_duerme_Guion_DOS.pdf` in the repo root is the narrator script and wins any disagreement. It is untracked and gitignored deliberately: keep it local, and don't copy its prose into the app's copy.

### Rules the PDF specifies that no old code implements

These are Sprint 1 work, and the reason full parity is a goal:

- **Night parity** — Pirómano acts only on odd nights, Lobo albino only on even nights, Actor only the first three. v1 prompts all of them every night.
- **Roles that are selectable but do nothing** — Infecto converting its victim into a wolf, Cupido pairing lovers, Domador de Osos' growl, Cazador's revenge shot, Ángel, Niña Pequeña.
- **Abominable Sectario** — in the script, in neither old tree. `SPLIT` in `src/engine/roles.ts`; the split itself is recorded and shown to the Cultist, and nothing beyond what the script says is invented.

## Product goals and the decisions already made

Four goals drive v3. The decisions below are settled — don't relitigate them without the user.

**Ship as an installable phone app.** An offline PWA, not an App Store build (Capacitor stays possible later without rework, since it wraps the same build). Mobile is the primary target, not a responsive afterthought. Two consequences: nothing may depend on a CDN, and `GameState` must persist — a reload or a phone call currently ends the game.

**Fully playable in English.** Handled by the engine-emits-no-strings rule above. Role display names come from `src/i18n/` name packs.

**Independent role names.** The user's call, to keep the game free to play without brushing against another publisher's branding. Worth knowing the actual risk shape so it isn't over-applied: game *rules and mechanics* are not copyrightable, and short functional names ("Seer", "Witch") are ordinary descriptive words. The real exposure is trademark on *game titles* and copyright on *rulebook prose and art*. So the things that matter are the app's own name and not copying the PDF's wording — not the role names, which are cheap to make distinctive anyway since they live in a string table. (Not legal advice.)

**Modern UI with real motion.** The old trees are 2021/2022 Bootstrap pages with hand-rolled hex, `!important` overrides, and essentially no transitions. Constraints for v3:

- **One palette.** The old trees have two different colour sets for the same roles (`legacy/v1/script.js:43-62` vs `legacy/v2/game.js:11-25`). Establish one design-token set in Sprint 3; do not add a third.
- **All colour lives in CSS**, driven by a class or `data-` attribute. v1 writes `style.backgroundColor` inline from JS on every state change, which is exactly why it can have neither transitions nor a dark mode.
- **Don't port `LightenDarkenColor()`** (`legacy/v1/tools.js`) — its per-channel hex maths overflows into the next channel on bright colours. `color-mix()` replaces it.
- **The player circle comes from v2**, not v1. v2's is pure CSS custom properties (`legacy/v2/styles.css:29-56`) and survives rotation and resize; v1's computes `transform` in JS from `offsetWidth` at creation time and does not.
- **Dark-room ergonomics are a hard constraint.** This app is used one-handed, in the dark, by someone reading aloud. Dark-first palette, no white flashes, large touch targets, fast legible transitions over decorative ones, and honour `prefers-reduced-motion`.
- **Sizing is `clamp()` and container queries**, not `vw` everywhere — the old approach breaks on tablet and desktop.
