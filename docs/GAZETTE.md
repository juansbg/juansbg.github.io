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
  if it is more than a few points.

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
  three or four short hairlines of varying length drawn in CSS, the way a
  paper is mocked up, never lorem ipsum. Lead article across the top, then
  two columns. The page scrolls inside the stage; nothing else does.
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
   articles.*
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
   first version, so a table cannot argue about the dial.
