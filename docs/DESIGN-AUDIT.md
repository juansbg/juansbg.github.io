# Design audit — before we call it finished

A pass over every screen and surface against `docs/DESIGN.md`, taken on
2026-09-11 at 375×667, 430×932, 820×1180, 1180×820, the TV page at
1920×1080 and 3840×2160, and the player page at 375×667, in both
languages. Every screen was measured in the browser (tap targets,
computed faces and sizes, contrast against the painted ground, page
scroll) and looked at; three static passes covered the stylesheet, the
motion rules and every place the name is baked in.

Findings are ranked by how much each would embarrass us on a real table:
**tier 1** breaks the game in the hand, **tier 2** reads as off-brand or
sloppy to anyone looking, **tier 3** is polish. Each carries what you would
see, where it comes from, and the fix proposed. Items marked **decision**
change something the design doc says and want the user's word first;
everything else is a fix the branch can just take.

What held up everywhere: no radius anywhere, no gradient, no blur, no
sixth colour in the stylesheet, Midnight ink on every red ground, Neon
only ever a sigil, the page never scrolls on any screen at 375×667, every
`.btn` and icon button at 48px, the reveal card fits in both languages,
the paper (daily and final) reads well on the phone, and the TV lobby
scales. The problems are concentrated in one place: **the seating circle
gives up its space to whatever sits above it**, and on a short phone or a
big screen that is the whole game.

---

## Tier 1 — breaks the game in the hand

### 1. The circle collapses on a 667-tall phone whenever the block above it grows

**What you see.** Day 1 in Spanish, eight players, one death and one fire
in the morning report: the seat tiles are **34px** squares, the names
read `GUILL…` and `FERN…`, the seat numbers are gone, and the dead seat is
a smudge. The Apothecary's step (a four-line prompt plus the Heal/Poison
row) gives **37px** tiles with the doom mark sitting on top of the name.
The vote mode (the tally row appears) gives **43px**. The plain day
screen manages 51px and a two-line night step 64px. The same screens at
430×932 are fine (83px), so this is every iPhone SE, 8, and mini, and any
phone with the keyboard bar up.

**Why.** `--seat` is computed from `min(width, height)` of what is left
after the head, the card or report, the label row and the primary
button; the circle is the only flexible thing on the screen, so every
extra line above it is taken out of the tiles. The 2rem floor in
`styles.css` is far below the 48px the design rule promises.

**Fix.** Make the circle the thing that holds and the block above it the
thing that yields:
- A real floor: tiles never below **3.5rem** (56px) with the name at
  12px; when the geometry cannot give that, `circleMarkup` switches to
  the list layout by itself for that screen (the list is "the answer past
  the floor" per DESIGN.md, but today the narrator has to find it in ⋯).
- The morning report on the day screen scrolls inside a box of at most
  two rows (it already is a designated scroll region on the timeline);
  the prompt card on a night step clamps its sentence to two lines after
  the first night of the game (the narrator has read it) with a tap to
  expand.
- The Apothecary's Heal/Poison pair moves inside the card as a segmented
  row under the prompt instead of a second full-width row over the
  button.
- The "Choose who" mono label folds into the card's bottom edge.

Files: `styles.css` (`--seat`, `.night__card`, `.report`), `screens/circle.ts`
(the auto list), `screens/night.ts` (Heal/Poison placement). **Decision**
on the auto-list threshold only; the rest is mechanical.

### 2. The TV does not scale: a phone-sized circle in the middle of a 1080p or 4K screen

**What you see.** At 1920×1080 the table is a ring of **112px** tiles with
**18px** names in the middle of the screen, the caption "DAY 2" is 19px in
muted ink top-left, the clock digits are 40px top-right, and the reading
card — the death of the night — is a 480×366 red card with a **32px**
sentence. At 3840×2160 the tiles are still 112px on a ring 1024px tall.
From a sofa none of it reads; the phone's own dawn slide is more
legible than the television.

**Why.** `--seat` is capped at 7rem for every stage, and `.stage--tv` only
resizes the paper (done in the gazette work), not the table, the caption,
the clock or the reading.

**Fix.** A `.stage--tv` scale, the way the paper already has one:
- tiles from `min(vw, vh) / (N + 2)` with the cap raised to 14rem on the
  TV; names at `clamp(1.5rem, 2.2vmin, 3rem)`, seat numbers 1rem, the
  strike and the vote badge scaled with the tile;
- the caption and the clock in one head row at `3.5vmin`, Ledger, not
  muted (the TV is read across a room; nothing on it is secondary);
- the reading as a full-screen slide over the table, as on the phone
  (`data-lethal` paints the whole TV Vendetta), name at `18vmin`, line
  at `4vmin`, with the table returning when the phone closes it.

Files: `styles.css` (`.stage--tv` block), `screens/table.ts` (reading
markup class). No engine or projection change.

### 3. Twelve players on a phone: 40px tiles, and the list that should save it is a narrow column

**What you see.** A twelve-seat night at 375×667: **40px** tiles, **11px**
names, three names truncated. Switch to the list in ⋯ and you get a
single centred column of **120px-wide** buttons with no seat number and
no "You" marker, scrolling inside a 258px box with a visible scrollbar.

**Fix.** Rows, not chips: the list layout becomes full-width rows (seat
number in mono, name in Bebas, the same flags and strike as the tile),
two columns from 600px up, and the circle switches to it by itself under
the floor from item 1. Files: `screens/circle.ts` (`listMarkup`),
`styles.css` (`.table--list`).

### 4. On an iPad or a laptop the app is a phone column with two thirds of the screen empty

**What you see.** iPad portrait: a **544px** column centred in 820px, the
circle no larger than on the phone (83px tiles). iPad landscape and a
laptop window (1180×820): the same column, 63px tiles, a 298px circle,
the bar spanning the full width under an empty field either side. It
looks like a phone app mirrored, not a table the narrator props up.

**Fix.** One breakpoint at 900px: the stage becomes two columns — the
circle on the left sized from the height (up to the TV cap), the card or
report, the label row and the primary action stacked on the right; the
bar stays full width. The day screen, every night step, the table view
and the player view all fall out of the same grid. Files: `styles.css`
(`.screen--night`, `.screen--day`, `.screen--table` at
`@media (min-width: 900px)`). **Decision**: worth doing before release,
or accept the column and ship the TV for big screens.

---

## Tier 2 — reads as off-brand or careless

### 5. The voice slips: exclamation marks, "the city", and a gendered death line

- The day head says **"THE CITY WAKES!"** and **"¡LA CIUDAD DESPIERTA!"**;
  the night's last screen says **"THE CITY SLEEPS"**. The voice rule bans
  exclamation marks, and everywhere else the place is *the town* / *el
  pueblo* (the paper, the verdict, every outcome line, the trades).
- The Spanish report line is **"Ha amanecido muerto Elena."**: `muerto`
  is masculine, and half the names at a table are not. The dawn bank
  avoids this; the report line does not.
- The player page with a bad link says **"No room in this address"**
  (*at* this address), and offers nothing to do next.

**Fix.** `ui.day.title` → "The town wakes" / "El pueblo despierta";
`phase.nightFalls` family → "The town sleeps"; `outcome.death` in Spanish
rewritten gender-neutral ("Elena ha aparecido sin vida." or
"Amanece sin Elena."); `ui.tv.noRoom` → "No room at this address" plus a
line to scan the narrator's code again. Files: `i18n/en.ts`, `i18n/es.ts`.
Strings only, so it can land first.

### 6. The day head is crowded at 375px

**What you see.** The title wraps to two lines inside a **108px** column
(93px in Spanish) because four 48px icon buttons — ROLES, ▶, ¶, ↶ — sit
beside it with 4px between them; the row is 37px tall and the title
reads as an afterthought.

**Fix.** Two rows: the title alone on the first at the display size,
the tools on the second, right-aligned with an 8px gap (the same
`.screen__tools` the night uses, which has one button fewer and just
fits). The two "read" buttons (▶ the reading, ¶ the paper) become one
word button "Morning" that opens the reading and lands on the paper, as
the automatic flow already does. Files: `screens/night.ts` (`dayMarkup`),
`styles.css` (`.screen__head`).

### 7. Type under the floor on every seat

**What you see.** Seat numbers **8px** mono, names **11–12.5px** Bebas
(the design floor for Bebas is 20px), the "You" marker **8px**, the vote
badge **9.4px**, the `.seat__role` label 6–10px, the seat flag 11px. In
the dark, at arm's length, only the tile's colour is legible.

**Fix.** Floors tied to the tile floor from item 1: numbers ≥ 10px,
names ≥ 12px with `--seat` at 56px and 14px at 64px, "You" ≥ 10px, badge
≥ 11px; the `.seat__role` label is only ever shown on the narrator's
peek and can be 11px mono. Note in DESIGN.md that seat names are the one
sanctioned Bebas below 20px, since a tile is a label of one word.
Files: `styles.css` (`.seat__n`, `.seat__name`, `.seat__you`,
`.seat__votes`, `.seat__role`).

### 8. Muted ink fails contrast at small sizes

**What you see.** Measured against the painted ground: the mono eyebrow
labels ("WHAT HAPPENED IN THE NIGHT", "WHO DOES THE TOWN EXECUTE?",
"DISCUSSION", "CHOOSE WHO", the sheet titles) are **3.9:1** at 12px; the
menu values ("Español", "On") **3.7:1**; the timeline's text
**3.7:1** at 14px; the player page's "make sure nobody can see" hint
**2.1:1**; "End the game" and "Restart" in Vendetta on the sheet surface
**4.0:1**; the idle timer reset icon **1.7:1**. The design table promises
13.7:1 for Ash on Midnight, but `--fg-muted` is a mix well below it.

**Fix.** Raise `--fg-muted` to a mix that clears 4.5:1 on `--surface`
(about 62% Ash), keep `--fg-faint` for the dead and disabled only, and
never set a 12px label in anything under `--fg-2`. The two danger rows
get `--lethal` on `--bg` (5.2:1) by dropping the sheet's surface step
behind them, or Bebas at 20px, which is large text. Files: `tokens.css`,
`styles.css` (`.label`, `.sheet__title`, `.menu__value`, `.log__text`,
`.reveal__hint`).

### 9. Tap targets under 48px and gaps under 8px

- `.menu__seg` (the circle/list and the timer length choices) is
  **40px** tall; "THE CIRCLE" wraps to two lines inside it and the
  Spanish "ELEGIR A LA GENTE EN" label takes three.
- The night and day tool buttons sit **4px** apart; the clock face and
  its reset **4px**.
- The names-list remove button is **44px** wide.
- Seats: see item 1.

**Fix.** `min-height: var(--touch)` on `.menu__seg`; the layout row set
label-above like the timer row; `.screen__tools` and `.clock` gap to
`--space-2`; the remove button to 48px. Files: `styles.css`, `app.ts`
(`menuMarkup`).

### 10. A Plex button and Plex chips

"I have a question" / "Tengo una duda" on the confirm screen is a
button set in Plex inside a dashed hairline, and the complexity chips
(Simple / Standard / Advanced) are Plex 500 — the rule is that every
button label is Bebas. **Decision**: make them Bebas (the chips at
20px, the question as a ghost button), or record both as sanctioned
exceptions in DESIGN.md (a quieter "not a move" button). Files:
`styles.css` (`.reveal__question`, `.chip`).

### 11. Bebas carrying sentences

`.winner` ("The Family wins.", also on the player page and the TV),
`.paper__banner` (the same line as the final edition's banner),
`.reveal__lead` ("Pass the phone to Ana") and the hold label ("Press and
hold to see your role") are full sentences in Bebas caps; the type rule
says Bebas is never for a sentence read aloud. **Decision**: these read
as stamps and I would keep them, dropping the full stop from the winner
line and recording the four in DESIGN.md as the sanctioned
stamp-sentences; the alternative is Plex 600 at the same size.

### 12. The timeline sheet shouts REWIND on every row

**What you see.** Every log row carries a two-line "REWIND TO HERE" ghost
button 96px wide, so a night of eight moves is eight identical shouting
boxes; the mono divider "MORNING AFTER NIGHT 1" wraps; the muted text is
3.7:1 (item 8).

**Fix.** The revert becomes the ↶ icon button in the row's last column
with the sentence as its accessible name, or the row itself is the tap
and a single "Rewind to here" appears on the selected row. Divider on one
line at `--text-xs` with the night on the left. Files: `screens/timeline.ts`,
`styles.css` (`.log__revert`).

### 13. The final edition on a phone: the cast list clips and the dateline wraps

**What you see.** "WHO WAS WHO" is a two-column grid at 375px: "THE
BODYGUARD" runs to the paper's edge and clips, "THE DETECTIVE" breaks
onto a second line, and the dateline "FINAL EDITION · 2 NIGHTS · 6 AT THE
TABLE" wraps between its hairlines. "SHARE THE PAPER" wraps in its
half-width button.

**Fix.** The cast in one column below 420px (two from there up), the
dateline shortened to "Final edition · Night 2 · 6 players", the share
button labelled "Share". Files: `styles.css` (`.paper__cast`), `i18n`
(`ui.paper.edition`, `ui.paper.share`).

### 14. Red as decoration on the reveal

The hold-to-reveal progress bar fills in Vendetta. The palette rule keeps
Vendetta for blood, the crew and the button that kills; a progress bar is
none of those. **Fix.** The fill in Ledger (the narrator's hand), or Ash.
File: `styles.css` (`.reveal__fill`). One line, but it is a visible
colour change, so **decision**.

### 15. The canvas paper invents two greys, and the shadows are raw black

`paper.ts` draws the shareable image with `MUTED '#4f4f62'` and
`RULE '#9c9a90'`, neither of which is one of the five or a mix of them,
and `NEWSPRINT '#c7c3b4'` approximates the token by hand. `tokens.css`
defines `--shadow-lift` / `--shadow-deep` with `rgb(0 0 0 …)`.

**Fix.** The canvas reads its colours once from a probe element
(`getComputedStyle` on `.paper`, `.paper__dek`, `.paper__rule`) so the
image follows the tokens; the shadows become Midnight at the same alpha.
Files: `screens/paper.ts`, `tokens.css`.

### 16. The list layout and the empty bar in setup

- The names screen carries the full bottom bar with nothing in it but ⋯,
  a 56px strip on a 667px phone that has nothing to say yet.
- The wordmark on the names screen hugs the top edge (8px) on a phone
  without a notch.

**Fix.** In setup, the bar collapses to the ⋯ square at the right (the
timeline has nothing to show); the names screen takes `--space-4` at the
top. Files: `app.ts` (`chromeMarkup`), `styles.css`.

---

## Tier 3 — polish

17. **Motion.** `.reveal--open` is dead CSS; `.inspect__role` plays
    `reveal-in` and is not on the `.stage:not([data-enter])` list (benign
    today, one repaint away from re-bouncing). Reduced motion is honoured
    everywhere it should be (`--dur-*` collapse, the crew glow freezes,
    `swap()` and `buzz()` both check). Delete the dead rule, add
    `.inspect__role` to the list.
18. **The scales mark** (⚖, the verdict's mark on the paper) renders in
    Bebas at 15px; give the text marks a face and size of their own.
19. **The seat page** has an empty middle third while the hold button
    stays 88px; let the card stage grow and centre the hold; the ballot
    label "Your vote — tap it again to take it back" is two lines of
    mono, cut it to "Your vote".
20. **The table view's caption** ("DAY 1", "2 of 7 have voted") is
    muted 16px on a screen meant for a room; Ledger, `--text-md`.
21. **The Spanish menu** wraps "ELEGIR A LA GENTE EN" to three lines
    beside its segments (fixed by item 9's label-above).
22. **`::selection`** is Vendetta with Midnight text: fine by the rule,
    but selecting a name on the day screen flashes red; consider Ledger.

---

## The name: every place the wordmark is baked in

For a rename to be one pass. None of the icons carry letters (the
favicon and all four PNG icons are the Family's fedora in Neon on
Midnight), so a new name needs no new artwork unless it wants a new
mark.

| Where | What | Notes |
|---|---|---|
| `src/i18n/en.ts:7`, `es.ts:7` | `appName: 'Omertà'` | Feeds the setup title, both paper mastheads (HTML and the canvas share image, drawn in caps at 132px), and the share filename `omertà-<time>.png` |
| `src/i18n/en.ts:714`, `es.ts:714` | `ui.tv.title: 'Omertà'` | A second copy, not derived from `appName`; make it derive |
| `index.html:10`, `tv.html:8`, `seat.html:8` | `<title>` | "Omertà", "Omertà · TV", "Omertà · Seat" |
| `public/beta/index.html:8,14` | title and link text of the legacy redirect page | Can stay until the beta worker is retired |
| `vite.config.ts:17-18` | manifest `name` / `short_name` | The home-screen label; existing installs keep the old label until reinstalled |
| `package.json:2,6` | package name and description | Cosmetic |
| `src/ui/store.ts:37,153,188`, `sound.ts:16`, `room/client.ts:16-18`, `seat.ts:45-47` | storage keys `omerta:*` | Ten constants; a prefix change needs a read-old-write-new migration in `store.ts` or every installed phone loses its game, roster, timer, mute and room |
| `src/ui/store.test.ts`, `sound.test.ts` | the same keys in fixtures | Update with the constants |
| `relay/wrangler.toml:7`, `relay/src/index.ts:90`, `.env:2` | the worker name `omerta-relay` and its `*.workers.dev` URL | Renaming the worker changes the URL: redeploy, then update `.env`, `docs/BIG-SCREEN.md`, `docs/ROADMAP.md` together |
| `docs/DESIGN.md`, `docs/ROADMAP.md`, `docs/sigils.html`, `docs/design-language.html`, `CLAUDE.md` | headings and one type specimen | Text only |
| `.claude/launch.json` | dev server name | Local |

The wordmark is set only in Bebas from the string, never drawn: the setup
title (`screens/setup.ts:44`), the paper masthead (`paper.ts:314`), and
the canvas (`paper.ts:563`). A rename is `appName` plus the table above.

---

## Method

Measurements came from a small script imported into the dev page (kept
under `.claude/`, not committed): for every visible interactive element,
its box against 44/48px and its distance to the next; for every text
node, the computed face and size, and the WCAG ratio of its ink against
the ground composited from its ancestors; `scrollHeight` against the
viewport for the never-scrolls rule; horizontal overflow of every
element. Screens were reached by seeding `omerta:v1` with engine-built
states and clicking through the real handlers; the TV and player pages
were rendered from real projections in their own entries. The static
passes grepped every colour literal, radius, shadow, face, keyframe,
`prefers-reduced-motion` block and tap-target rule in `src/ui` and the
entries.
