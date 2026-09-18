# The town paper and the citizens' trades — design

The idea (user, 2026-09-04): plain citizens get a trade under their role — the
card still says **CITIZEN** in Bebas, and under it, smaller, *Baker* — and the
town gets a newspaper every morning: what happened in the night as a page of
short articles, in the paper's own voice, with the odd breadcrumb dropped
through the trades ("The baker heard footsteps next door while the last loaf
was in the oven") so the table has something to argue about on a quiet night.
Known facts carry names ("Abby found dead"); citizens not yet revealed stay
nameless; and a day after a death the police name what the dead were ("The
investigation finds Abby was the Godfather").

This is the design, written before anyone builds it. It ends with the
decisions the user has to make.

## 1. What it is for

Three things, in order:

1. **Talk on quiet nights.** A night with no death gives the town nothing.
   The paper gives it a page.
2. **A claim space for citizens.** With trades secret, "I am the baker" is
   something a citizen can say and the Family can only guess at. That is a new
   kind of lie to catch.
3. **A slow drip of truth.** The dead are named for what they were, one day
   late. The town learns whether it hanged a Family member or a Bodyguard,
   and the Family learns nothing it did not know.

And one thing it must never do: **lie.** Every article about the game is true
of the game. Colour pieces that are not about the game never name a trade or
a person, so nothing on the page can be mistaken for a clue that is not one.

## 2. Trades

- **Only citizens (`PLAIN`) get a trade.** A role is already a story; a
  citizen has none, which is the gap the trade fills. A converted citizen
  keeps their trade (the town's baker who turned).
- **A trade is a number.** `Player.trade: number | null`, an index into a
  list in the string tables (`trades`, twenty-four entries per language, the
  same order in both, so index 3 is *Baker* in English and *Panadero* in
  Spanish). The engine stays theme-free: no trade word ever appears in an id,
  and the rule from CLAUDE.md holds.
- **Dealt with the roles, unique within a game.** `dealRoles` returns roles;
  `createGame` assigns trades to the citizens from a shuffled list, using the
  same injected `Random`, so tests are deterministic. A manual deal gets them
  too. Twenty-four trades cover a table of twenty citizens with slack.
- **Secret until death.** Nothing public says who holds which trade. The held
  card shows it, the rules card explains it in one sentence, the "show a role
  again" card shows it, and the Detective sees the role only (a trade is not
  what the Detective reads). When a citizen dies, the paper may name the trade
  ("Abby, the town's baker, found dead"), so the claim space narrows as the
  game goes on. See decision 2.
- **The list**, period flavour, nothing that names a role or a side: baker,
  tailor, butcher, barber, florist, fishmonger, cobbler, blacksmith,
  innkeeper, grocer, milkman, postman, schoolteacher, nurse, priest,
  gravedigger, locksmith, watchmaker, printer, pianist, seamstress, chimney
  sweep, carpenter, tobacconist. Spanish: panadero, sastre, carnicero,
  barbero, florista, pescadero, zapatero, herrero, posadero, tendero,
  lechero, cartero, maestro, enfermera, cura, sepulturero, cerrajero,
  relojero, impresor, pianista, costurera, deshollinador, carpintero,
  estanquero. Gendered forms follow the word, not the player; the trade is a
  shop sign, not a description of the person.

## 3. Clues

A clue is an engine outcome, public, structured, string-free — the same rule
as every other outcome:

```ts
{ type: 'clue'; night: number; trade: number; clue: Clue; public: true }

type Clue =
  /** A Family member lives next door to this trade's holder — or does not. */
  | { kind: 'neighbour'; crew: boolean }
  /** Tonight's victim lived this many doors from this trade's holder (ring distance). */
  | { kind: 'doors'; doors: number }
  /** Somebody's door held tonight: an attack was stopped. No names. */
  | { kind: 'held' }
```

- **Truth by construction.** The resolver computes the clue from the resolved
  players and deaths. A property test in the simulator asserts every clue in
  every simulated game is true of the state that produced it.
- **The holder is never named**, only the trade; the table has to find the
  baker first. `neighbour` is the Bloodhound's growl from an unknown seat;
  `doors` is a distance from an unknown seat; both are weak alone and sharp
  once the town knows who the baker is, which is the point of the claim space.
- **`held` leaks something the game keeps secret today:** that the Bodyguard
  or the Veteran stopped a hit. CLAUDE.md is explicit that the village must
  not learn this. It is in the type because the user asked for "apothecary
  potions, murders" breadcrumbs, and it is the mildest such leak. Off by
  default; decision 4.
- **Frequency is a dial, seeded, and inverse to the night's noise.** A
  `GameState.seed` (set at `createGame` from the injected `Random`) plus the
  night number seeds a small PRNG (`sim/rng.ts` already has mulberry32), so
  undo and redo produce the same clue and the log never changes under the
  narrator. A quiet night (no public death) rolls for a clue at 60%; a night
  with a death at 25%; never more than one clue a night. The holder is a
  living citizen chosen by the same roll. These numbers are the first thing
  the simulator tunes.
- **What a clue costs the Family.** `neighbour` at 60% on quiet nights means
  the town gets a Bloodhound-strength fact about every third night on
  average, anchored to a seat it does not know. The simulator can measure the
  win-rate shift under the detective policy before and after; the dial moves
  if it is more than a few points. **Measured 2026-09-11** (`docs/ROADMAP.md`
  §1, "The paper's breadcrumbs, measured"): five to seventeen points at
  standard tables for a town that trusts every trade claim, an upper bound;
  one to four at simple tables, where the claim space itself decides; about
  even at complex ones. The dial stays.

## 4. Investigations

- **A day after a death, the dead are named for what they were.** A player
  who died on night *N* or day *N* is revealed in the edition of day *N + 1*:
  role, side, and trade if a citizen. Always, not sometimes — a rule the
  table can count on beats one it has to guess at. This is a rule change
  (today nobody's role is revealed until the game ends); decision 3.
- **Not an outcome, a view.** Nothing new goes in the log: "dead for a day"
  is a fact `edition()` reads off the death outcomes and the day. But the
  **projection** must carry the revealed roles for the TV, as a `revealed:
  { id, roleId }[]` list holding only players the rule has already made
  public, and `projections.test.ts` checks that nobody else's role is in it.
  That test is the security model of the TV; it gets one new case, not a
  weaker one.
- **Wording keys off the role**, with a small bank per role (two or three
  headlines each): "Investigation finds Abby ran the Family" (Godfather),
  "Evidence of witchcraft at Pedro's" (Apothecary, the occult streak),
  "Detective's badge found among Caro's things". The Family's reveals are the
  town's good news and the paper's tone should say so.

## 5. The paper

- **One paper, three editions.** The peer's `paper.ts` already sets the whole
  game as a front page for the game-over screen. The daily paper is the same
  newspaper: `paperOf()` grows an `edition(state, day)` that gathers one
  morning's articles, and the game-over page becomes the final edition with
  everything. Same masthead, same type, same rules; the reader should feel
  they have been reading the same paper all game.
- **Newsprint is Ash.** The user asked for the paper in Ash. In the design
  language Ledger is paper and "the one bright surface"; Ash is the town's
  ink and the hairlines. The recommendation is to let Ash become a second
  surface with one job: *newsprint* — the daily paper only — with Midnight
  ink and Vendetta rules, so the narrator's official report (Ledger) and the
  town's gossip sheet (Ash, a shade dimmer, slightly yellowed) are told apart
  at a glance. Decision 1; it needs one line in `docs/DESIGN.md` and two
  tokens (`--newsprint`, `--on-newsprint`, both mixes of Ash and Midnight).
- **An article is a headline and a dek**, Bebas and Plex, then *scribbles*:
  short rules of varying length drawn in CSS, the way a paper is mocked up,
  never lorem ipsum. Lead article across the top, then two columns. The
  page scrolls inside the stage; nothing else does. *(Still true of the
  phone. On a wall the scribbles are set as words and the sheet is ruled
  into columns — section 5b.)*
- **Article sources, in page order:**
  1. **Deaths**, named: headline from the death's own line (`deathLines()`
     already gives each death a unique sentence), the dek names the cause the
     town knows (found dead, hanged, poisoned) and the trade if a citizen.
  2. **The verdict**, named: who the town hanged, with the count if a tally
     was recorded.
  3. **Public events**: the fire (silenced), the Raven's mark (extra vote),
     the growl, a card taken from the centre — each one article, named where
     the outcome is already public by name.
  4. **Investigations**, named (section 4).
  5. **Clues**, nameless (section 3).
  6. **Colour**, nameless, zero to two per edition from a bank of thirty per
     language, seeded by day: council business, weather, a lost dog. Never a
     trade, never a person, never a role word — so nothing here can be read as
     a hint.
- **Where it opens.** On the day screen, a paper button beside ▶: full screen
  newsprint, its own Done, the bar hidden while it is up (the phone may be
  facing the town). The TV shows it when the phone does (`paper: day | null`
  in the projection, the page rendered from the projection's public
  articles). The dawn slideshow stays as it is: the reading is the drama, the
  paper is the record. The final edition replaces nothing; it is the
  game-over page that already exists.
- **Voice.** The masthead's, already set by the peer: dry, newsprint,
  1930s desk. Headlines short; deks one sentence; no exclamation marks.
  Every string in the tables, both languages, each its own small story like
  the death banks.

## 5b. The page on a wall (2026-09-18)

Section 5 designed a page for a hand and it was a good one. A user played
a live game and the same page, blown up onto a television, was a phone
page enlarged — one 1440px column of 83-character lines where a newspaper
column is 35 to 45, 186 to 217px of bare newsprint under the last story on
a quiet morning, and the three scribbles under each headline reading as
loading bars at three metres. The final edition was worse: a whole story
and its dek below the bottom edge, on a screen that cannot scroll, with
`scrollHeight === clientHeight` reporting nothing wrong. The user asked
for a redesign, not an adaptation: "much more realistic, fun and
eye-catching".

The page above still describes the phone's, which is unchanged in
substance. What a room sees is set differently, and these are the rules a
change has to keep:

- **The sheet is re-ruled from how much news there is.** `planFor(rest)`
  gives the column count and the lead's span; a quiet morning gets three
  wide columns and a loud one five. The engine's output swings by a factor
  of four and a page set for one end of that has to look wrong at the
  other. A light day is also set louder (`--air`), the way a front page
  enlarges a lead when there is little to run.
- **The follow-ups are dealt DOWN the columns, not across** (`columnsOf`),
  which is the order a page is read and the order this game's record runs:
  night 2 above night 3, never beside it. The columns differ by at most one
  story and the news is heaviest on the left.
- **The type block under each story stretches.** This is the whole answer
  to "a quiet day has to look as deliberate as a bloody one": a column runs
  floor to ceiling at two stories and at ten, by construction, with no bare
  newsprint left to explain. A block that would get fewer than three lines
  is taken off instead — one line is a rule stuck under the dek, not a
  block — and taking it off feeds the others.
- **The greek is set like type, not like rules.** Words with gaps, a ragged
  right, paragraphs, a reading leading, off a fixed table walked by a
  coprime step so the pattern does not come back into phase and open
  rivers. An unbroken rule five hundred pixels long, forty times in a row,
  is a thing no press has ever produced. Still never lorem: it says nothing
  in any language and cannot be read as a clue.
- **The lead's dek is its first paragraph.** It flows into column one and
  the type block continues under it in the same stream. Set full-measure
  above a separate wall of grey, it read as a card with a headline on it.
- **The lead carries a plate**, which is the mark already beside that very
  outcome, blown up in a solid Midnight frame with the name under it and
  the sigil reversed out in newsprint. Every front page has one dark
  rectangle and the eye uses it to hold the sheet down. It leaks nothing
  the headline does not already say, and `paper.test.ts` still holds the
  page's sigils to an exact list.
- **One thing crosses a gutter.** From four follow-ups the last story runs
  across the foot of the columns with the lead full-depth beside it. A page
  built only of full-depth columns is a grid, and the room sees it every
  morning.
- **The page cannot lose a story in silence.** `fitPaper` steps the type
  down until no run of real type is clipped and marks the page
  `data-fit-over` if it runs out of steps. It asks about the TYPE, not
  about the boxes: the lead's body hides its own overflow so the greek can
  stop at the foot of a column, which made a clipped dek invisible to every
  ancestor's `scrollHeight`. It also holds the `line-in` entrance while it
  measures, because a `translateY(4px)` counts towards a box's scrollable
  overflow and the first paint otherwise reads four pixels too tall — at
  every step of the ladder, cached against a key that never changes again.

The evidence is a play-through probe rather than an argument:
`scratchpad/paper/run.mjs` plays real games through the relay and reports,
for every edition on the wall, how many runs of real type are cut out of
how many asked, what `--paper-fit` settled at and whether it was beaten.
`scratchpad/paper/beaten.mjs` is its control: squeezed to 1000x340 the
ladder bottoms out, the page marks itself, the console says so once, and
the frame coming back restores it.

## 5c. The page on a tablet, and on the narrator's own device (2026-09-18)

Section 5b designed the wall's page and keyed every rule of it on
`.stage--tv`. The narrator's own copy — `dailyMarkup` on the phone route —
got none of it at any width: an iPad in either orientation, a laptop and a
phone on its side all drew the phone's one column, capped at the phone's
34rem, in the middle of a screen twice as wide, with the wall's ears bolted
onto a nameplate that had never been told about them. PRICE 5¢ sat under THE
FAMILY by 52 to 61px on every frame from 768 to 1280, which is what the user
saw, and the user reasonably said the redesign "doesn't look that much more
impressive": the surface a table without a television looks at was the
unimproved one. The rules a change has to keep now:

- **A sheet is decided by the frame, not the surface.** A sheet is a page
  that fills its frame and does not scroll: the morning edition on any frame
  from 48rem wide and 28rem tall up, and everything the television shows.
  `:is(.paper--daily, .stage--tv .paper)` is that, and it is the prefix on
  every rule in the sheet section of `styles.css`. Height is in the gate
  because a phone on its side is 844 by 390 and no sheet fits in 390px.
  `fitPaper` reads which papers are sheets off the box (`overflow-y:
  hidden`), never off a class or a mirrored media query, so it and the
  stylesheet cannot disagree; a page that scrolls has a hand on it and is
  left alone.
- **Three rulings, one paper.** Under 75rem the sheet is a tabloid. Upright:
  the lead across the top, the follow-ups in two columns under it — three
  once there are two boxes and a foot — and the register a strip along the
  foot. On its side: the lead down the left the full depth, the stories in
  two columns beside it, and with a foot, three columns beside a lead that
  gives up its plate for the width (the mark comes back beside the words).
  From 75rem the broadsheet, with the register as a column. The column
  boxes `columnsOf` dealt for a wall are kept as they are — read across a
  row and then down they are still in order — and each still clips its own
  type block at the foot of its cell.
- **Five columns need sixteen hundred pixels.** `planFor` used to rule from
  the story count alone, so a busy morning on a 1024px frame was five
  columns of 176px with the lead breaking its own headline mid-word.
  `tracksFor(width)` caps the plan at four under 1600, and both surfaces
  re-set the page when the frame crosses that line rather than fitting it
  harder (`refit` in `app.ts`, the resize handler in `tv.ts`).
- **The nameplate is measured, not computed.** The name sits in an `auto`
  track between two `1fr` sides so it never leaves the axis — which is also
  why, when it is too wide, the sides go to zero and the ears overflow into
  it, and nothing clips them, so the cut check cannot see it. `fitPaper`
  asks the name directly whether it clears both ears and steps `--name-fit`
  down until it does; a side that cannot hold its ear and a rule of minimum
  length counts as crowded, because an eight-pixel hairline reads as a
  hyphen. If the last step still collides the ears go (`data-no-ears`), the
  way a phone's do: a nameplate without a price is a nameplate, one with the
  price under the name is a misprint. This runs before the ladder, because
  it changes the masthead's height.
- **A split dek is a page that does not fit.** `break-inside: avoid` is
  honoured only while the paragraph is shorter than the column; a
  fifteen-seat Spanish dek broke across the lead's two columns with nothing
  cut and nothing for the cut check to find. A dek whose lines do not share
  a left edge is now `over()`, and so is a dek whose side label sits in
  another column: with the dek filling column one exactly, the town's
  swatch went over the break to the top of column two and read as a kicker
  on a block of greek.
- **The answer a ladder step gives is only an answer for the page that step
  leaves behind.** Taking a thin type block off moves every story in its
  column, so the thin pass runs inside each step and the step is measured
  again after it. Before that the ladder passed a page at 0.85 whose dek was
  then clipped by the layout the thin pass produced.
- **The plate weighs nothing in its row.** Its sigil is a share of the
  plate's height, and when nothing beside the plate is taller than its floor
  that height was the sigil's own — a percentage of an indefinite height is
  `auto`, the sigil took 82% of the plate's width, and a two-line headline
  got a hand's width of bare newsprint under it. `contain: size` on the plate.

The evidence is `scratchpad/paper/sheet.mjs`: it opens a real table, stops
on the narrator's own copy of each morning, walks a phone, a phone on its
side, two iPads in portrait, an iPad in landscape, the user's 1132×871
window, and three laptop widths, then the wall at four sizes, and reports
for each the masthead's same-line collisions, whether any ear is outside the
sheet, how many runs of real type are cut by an instrument that is not the
page's own, whether the page scrolls, what the fit pass settled at, where
every box landed, and the shot. Three mornings at fifteen seats in Spanish
and two at eight and five in English pass on every frame; `beaten.mjs` still
bottoms out and recovers.

## 6. Engine, projection, UI — what changes where

- **Engine** (`src/engine/`): `Player.trade`, `GameState.seed`, trades in
  `createGame` (and `dealRoles` untouched), a `clue` outcome type and its
  generation at the end of `resolveNight`, `STATE_VERSION` 4 with a migration
  (`trade: null`, a fresh `seed`). `roles.test.ts`'s shape rule still holds:
  nothing themed in an id.
- **Simulator** (`src/engine/sim/`): a truthfulness property over clues, and
  the win-rate delta with clues on and off in the report.
- **Projection** (`src/room/projections.ts`): `revealed`, `paper`, and the
  clue outcomes flow through `log` already since they are public.
- **i18n**: `trades`, `ui.paper.*` article banks (clues per kind, reveals per
  role, colour), the trade line on the role card.
- **UI**: the held card and the inspect card (`reveal.ts`), `paper.ts`
  (`edition`, newsprint ground, scribbles), the day screen button, the TV
  page, `tokens.css` (newsprint), `docs/DESIGN.md` (one section).

## 7. Order and split

1. **Trades** (engine + reveal card + strings). Small, and the game is better
   with it even before the paper exists. *Session A.*
2. **The daily edition without clues** (deaths, verdict, public events,
   investigations, colour) on the phone and the TV. This is the paper the
   user described, minus the breadcrumbs. *Session B, since `paper.ts` is
   theirs.*
3. **Clues** (engine outcome, seed, generation, the property test, the
   simulator delta) and their articles. *Session A for the engine, B for the
   articles.* **Engine side built** (2026-09-04): `clue` outcomes with
   `neighbour` and `doors`, rendered lines in both languages, the
   truthfulness test; `held` left out until decided.
4. **Tuning** with the simulator; the frequency dial and `held` decided on
   numbers. *Together.*

Two sprints. Step 2 ships alone and is worth it alone.

## 8. Decisions for the user

1. **Newsprint on Ash.** Recommended: yes, as a second surface with one job
   (section 5). The alternative is the daily paper on Ledger like the report,
   which keeps the rule at the cost of the two looking the same.
2. **Trades secret until death.** Recommended: yes; it is what makes a clue
   a puzzle and a claim a lie worth catching. The alternative — trades public
   from the reveal — makes every clue a direct pointer and the game sharper
   but shorter.
3. **The dead are named for what they were, one day late, always.**
   Recommended: yes. A rule change to the game as the script has it; the
   table's choice.
4. **Which clues.** Recommended: `neighbour` and `doors` on, `held` off,
   until the simulator says what each costs the Family.
5. **How often.** Recommended: 60% on a quiet night, 25% otherwise, one at
   most, tuned by the simulator; the narrator gets no switch for it in the
   first version, so a table cannot argue about the dial. **Kept after
   measuring** (2026-09-11): the paper is worth a handful of points to a
   trusting town, not the game.
