# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

**Omertà** — a narrator assistant for a social-deduction party game in the Werewolf/Mafia family. It is a tool for the single person running the game, not for the players. It tracks who has which role, walks the narrator through the night step by step in script order, resolves kills and protections, and prints a morning report.

The game is themed around **organised crime**, with a light occult streak on two roles. It began as a Spanish werewolf game (*Pueblo Duerme*, still live in `legacy/`) and was re-themed during the v3 rewrite. It ships in Spanish and English.

Deployed as a GitHub Pages site (`juansbg.github.io`).

## Current state: a v3 rewrite is underway

The project is being rebuilt. The roadmap is six sprints; **Sprints 0 (scaffolding), 1 (engine) and 2 (i18n) are done.**

`src/engine/` is complete and at full narrator-script parity. `src/i18n/` holds the Spanish and English string tables and the outcome renderer. 73 tests, no DOM, no strings in the engine. **Sprint 3 (the UI) is next** — the first sprint that touches the screen, and the point at which design tokens and autosave land.

| | Path | Status |
|---|---|---|
| **v3** | `src/` | Active development. Vite + TypeScript. This is where all new work goes. |
| v1 | `legacy/v1/` | **Frozen.** The 2021 vanilla-JS app. Still the live site at `/` until the Sprint 5 cutover. Do not modify. |
| v2 | `legacy/v2/` | **Frozen.** An abandoned 2022 jQuery rewrite that never got a night loop. Kept only for its CSS circle technique. |

The full roadmap, including what each sprint delivers and why, lives at `~/.claude/plans/rustling-cooking-church.md`.

## Commands

```bash
npm install      # first time
npm run dev      # vite dev server
npm run test     # vitest — the engine suite is the safety net
npm run build    # typecheck + production build
```

Node is **not currently installed on the dev machine** (`brew install node`). Everything is authored but unverified until it is.

## v3 architecture

```
src/
  engine/   pure TS — no DOM, no strings, fully unit-testable
  i18n/     es/en string tables and role name packs (Sprint 2)
  ui/       renders from engine state; owns all strings and animation
```

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
- **Abominable Sectario** — in the script, in neither old tree. `SEC` in `src/engine/roles.ts`.

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
