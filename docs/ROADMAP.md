# Omertà — what comes after v3

v3 shipped on 2026-09-02: the engine, both languages, the phone UI, the PWA. This
document records what a first simulation of the engine found, the fixes that
follow from it, the features planned next, and the order in which they are being
built. It is the working roadmap for both Claude sessions and for the user.

## 1. The simulation

### Method

A throwaway bot was written against the real engine (2026-09-04) and deleted after
the run; a permanent version is the first task below. It deals a table with
`dealRoles`, then plays whole games through the public engine API — `startNight`,
`recordAction` for every step the schedule asks for, `endNight`, `hunterShot`,
`lynch`, `winner` — with simple policies:

- **Everyone at night picks a legal target at random.** The Godfather converts
  half the time he is asked. The Chameleon takes a card from the centre 60% of the
  time. The Apothecary cures the doomed 70% of the time while she has the vial,
  poisons someone at random 25% of the time otherwise.
- **The town votes in one of two ways.** *Random*: any living player. *Detective*:
  if the Detective is alive and has found a living crew member, hang them;
  otherwise hang someone the Detective has not cleared.
- 3,000 games per table size, complexity and policy, a seeded generator so the
  run is reproducible, a cap of 40 nights to catch stalls.

The whole run, 48 configurations × 3,000 games, takes about two seconds.

### Results

Columns: winner share in %, nights played (average, 10th and 90th percentile,
maximum), share of games over on the first morning (before any vote), over on the
first day (before the second night), longer than eight nights, and stalled at the
cap.

```
== town policy: random ==
n   cx        town  crew  lov  mar wipe | nights avg  p10  p90  max | over@N1  over@D1  >8n  capped
5   simple      33   67    0    0    0 |       1.8    1    2    3 |       0       24    0       0
6   simple      13   87    0    0    0 |       1.6    1    2    4 |       0       50    0       0
7   simple      13   87    0    0    0 |       2.4    2    3    5 |       0        0    0       0
8   simple      20   80    0    0    0 |       2.7    2    4    5 |       0        0    0       0
9   simple      21   79    0    0    0 |       3.4    3    4    6 |       0        0    0       0
10  simple      10   90    0    0    0 |       3.1    2    4    7 |       0        0    0       0
12  simple      16   84    0    0    0 |       4.3    3    5    7 |       0        0    0       0
15  simple       8   92    0    0    0 |       5.4    4    7    9 |       0        0    0       0
5   standard    33   67    0    0    0 |       1.8    1    2    3 |       0       24    0       0
6   standard     5   95    0    0    0 |       1.3    1    2    4 |      51       25    0       0
7   standard    11   90    0    0    0 |       2.0    1    3    5 |       2       28    0       0
8   standard    14   87    0    0    0 |       2.7    2    4    5 |       0        3    0       0
9   standard    17   83    0    0    0 |       3.3    2    5    7 |       0        1    0       0
10  standard     9   92    0    0    0 |       3.0    2    5    7 |       0        4    0       0
12  standard    14   86    0    0    0 |       4.4    3    6    8 |       0        0    0       0
15  standard    10   90    0    0    0 |       5.4    4    7    9 |       0        0    1       0
5   complex     37   61    1    2    0 |       1.7    1    2    3 |       2       32    0       0
6   complex      5   94    0    1    0 |       1.3    1    2    4 |      51       22    0       0
7   complex      9   87    0    4    0 |       1.9    1    3    4 |       2       33    0       0
8   complex     12   82    0    6    0 |       2.4    2    4    6 |       0        8    0       0
9   complex     14   78    0    8    0 |       3.0    2    4    6 |       0        4    0       0
10  complex      6   88    0    5    0 |       2.6    2    4    6 |       0        6    0       0
12  complex     11   77    0   12    0 |       3.5    2    5    7 |       0        4    0       0
15  complex      6   80    0   14    0 |       4.1    2    6    9 |       0        3    0       0

== town policy: detective ==
n   cx        town  crew  lov  mar wipe | nights avg  p10  p90  max | over@N1  over@D1  >8n  capped
5   simple      61   39    0    0    0 |       1.5    1    2    3 |       0       50    0       0
6   simple      44   56    0    0    0 |       1.8    1    2    4 |       0       28    0       0
7   simple      42   59    0    0    0 |       2.4    2    3    4 |       0        0    0       0
8   simple      57   43    0    0    0 |       2.8    2    4    5 |       0        0    0       0
9   simple      55   45    0    0    0 |       3.2    2    4    5 |       0        0    0       0
10  simple      45   55    0    0    0 |       3.5    2    4    6 |       0        0    0       0
12  simple      52   48    0    0    0 |       4.5    3    5    7 |       0        0    0       0
15  simple      38   62    0    0    0 |       5.9    5    7    9 |       0        0    0       0
5   standard    61   39    0    0    0 |       1.5    1    2    3 |       0       50    0       0
6   standard    16   84    0    0    0 |       1.4    1    2    4 |      50       14    0       0
7   standard    32   68    0    0    0 |       2.3    1    3    5 |       2       18    0       0
8   standard    36   64    0    0    0 |       2.8    2    4    6 |       0        2    0       0
9   standard    48   52    0    0    0 |       3.4    2    4    6 |       0        1    0       0
10  standard    30   70    0    0    0 |       3.6    2    5    7 |       0        2    0       0
12  standard    42   58    0    0    0 |       4.7    3    6    8 |       0        0    0       0
15  standard    38   62    0    0    0 |       6.0    4    7   11 |       0        0    1       0
5   complex     63   34    0    2    0 |       1.4    1    2    3 |       3       53    0       0
6   complex     18   82    0    1    0 |       1.4    1    2    4 |      50       13    0       0
7   complex     29   68    0    3    0 |       2.1    1    3    4 |       3       21    0       0
8   complex     32   61    0    7    0 |       2.6    2    4    5 |       0        6    0       0
9   complex     38   54    0    8    0 |       3.1    2    4    6 |       0        4    0       0
10  complex     22   72    0    6    0 |       3.0    2    4    7 |       0        5    0       0
12  complex     29   59    0   12    0 |       3.7    2    5    7 |       0        4    0       0
15  complex     24   62    0   14    0 |       4.7    3    7    9 |       0        3    0       0
```

"wipe" is a game that ended with nobody alive: it rounds to 0% but happened
about once per 3,000 games at complex tables (raw counts of 1 to 3 per row).

### Findings

In order of confidence:

1. **Six-player tables are broken at standard and complex.** `crewSize(6)` rounds
   1.5 up to two crew, and `crewRoles` promotes one of them to the Godfather. A
   conversion on the first night makes it three against three, which is crew
   parity, so the game is over before anyone has voted. Every one of the 1,518
   first-morning endings in the six-player standard row was a conversion.
   Ten players gets three crew (30% of the table) for the same rounding reason
   and is the next worst row at every complexity.
2. **A game can end with nobody alive and no winner.** `winner()` returns `null`
   when nobody is alive, so if the Gunman is hanged with two players left and
   shoots the last crew member, or a pair of lovers are the last two, the app is
   left on a day screen with an empty table and no way out.
3. **Nothing runs forever.** No game passed 11 nights; the 40-night cap was never
   reached. There are no stalls, and no deal makes an unplayable game in that
   sense.
4. **The deal leans crew.** Under a detective-led town, simple tables sit near
   even; standard and complex lean crew 60–70%. The Godfather's conversion is
   the swing. The Martyr wins 12–14% of big complex games under random voting,
   an upper bound since a real table votes with intent.

The policies are crude, so the absolute rates are indicative; the structural
findings (1–3) do not depend on them.

### Decisions taken from it

- **Crew size becomes `floor((n + 1) / 4)`, minimum one:** 5–6 players → 1,
  7–10 → 2, 11–14 → 3, 15–18 → 4. The old `round(n / 4)` gave six players two and
  ten players three.
- **The Godfather is dealt from eight players up.** Below that a single
  conversion decides the game. The exact threshold is checked by the permanent
  simulator rather than by hand; if the balance test says seven is fine, seven it
  is.
- **A wipe-out is a town win.** Every path to nobody alive goes through the last
  crew member dying, and the town's condition is "no crew left". The
  `living.length === 0 → null` guard in `winner()` goes; the crew-count check
  already answers it.
- **The simulator becomes part of the repo** with a balance test that fails the
  build if a table stalls, ends in a wipe with no winner, or ends on the first
  morning more than a few percent of the time.

### After the fixes (2026-09-04)

All three decisions are on `main`: `src/engine/sim/` is the simulator, `npm run
sim` prints this table, and `src/engine/sim/balance.test.ts` runs 400 games per
setting on every test run. The same run as above, after the changes:

```
== town policy: random ==
n   cx        town  crew  lov  mar wipe | nights avg  p10  p90  max | over@N1  over@D1  >8n  stalled
5   simple      33   67    0    0    0 |       1.8    1    2    3 |       0       24    0        0
6   simple      46   54    0    0    0 |       2.0    1    3    4 |       0       19    0        0
7   simple      13   87    0    0    0 |       2.4    2    3    5 |       0        0    0        0
8   simple      20   80    0    0    0 |       2.7    2    4    5 |       0        0    0        0
9   simple      21   79    0    0    0 |       3.4    3    4    6 |       0        0    0        0
10  simple      30   70    0    0    0 |       3.8    3    5    6 |       0        0    0        0
12  simple      16   84    0    0    0 |       4.3    3    5    7 |       0        0    0        0
15  simple       8   92    0    0    0 |       5.4    4    7    9 |       0        0    0        0
5   standard    33   67    0    0    0 |       1.8    1    2    3 |       0       24    0        0
6   standard    48   52    0    0    0 |       2.1    1    3    4 |       2       19    0        0
7   standard    21   79    0    0    0 |       2.4    2    3    5 |       0        5    0        0
8   standard    14   87    0    0    0 |       2.7    2    4    5 |       0        3    0        0
9   standard    17   83    0    0    0 |       3.3    2    5    7 |       0        1    0        0
10  standard    21   79    0    0    0 |       3.8    3    5    6 |       0        0    0        0
12  standard    14   86    0    0    0 |       4.4    3    6    8 |       0        0    0        0
15  standard    10   90    0    0    0 |       5.4    4    7    9 |       0        0    1        0
5   complex     37   61    1    2    0 |       1.7    1    2    3 |       2       32    0        0
6   complex     44   50    1    5    0 |       1.9    1    3    4 |       2       26    0        0
7   complex     18   77    0    5    0 |       2.2    1    3    5 |       2        9    0        0
8   complex     12   82    0    6    0 |       2.4    2    4    6 |       0        8    0        0
9   complex     14   78    0    8    0 |       3.0    2    4    6 |       0        4    0        0
10  complex     16   74    0   10    0 |       3.4    2    5    6 |       0        4    0        0
12  complex     11   77    0   12    0 |       3.5    2    5    7 |       0        4    0        0
15  complex      6   80    0   14    0 |       4.1    2    6    9 |       0        3    0        0

== town policy: detective ==
n   cx        town  crew  lov  mar wipe | nights avg  p10  p90  max | over@N1  over@D1  >8n  stalled
5   simple      61   39    0    0    0 |       1.5    1    2    3 |       0       50    0        0
6   simple      79   21    0    0    0 |       1.7    1    2    3 |       0       41    0        0
7   simple      40   60    0    0    0 |       2.4    2    3    4 |       0        0    0        0
8   simple      58   42    0    0    0 |       2.8    2    4    5 |       0        0    0        0
9   simple      54   46    0    0    0 |       3.2    2    4    5 |       0        0    0        0
10  simple      66   34    0    0    0 |       3.5    2    4    6 |       0        0    0        0
12  simple      52   48    0    0    0 |       4.5    3    5    7 |       0        0    0        0
15  simple      39   61    0    0    0 |       5.9    5    7    9 |       0        0    0        0
5   standard    62   38    0    0    0 |       1.5    1    2    3 |       0       50    0        0
6   standard    75   25    0    0    0 |       1.7    1    3    4 |       2       40    0        0
7   standard    53   47    0    0    0 |       2.4    2    3    4 |       0        5    0        0
8   standard    41   59    0    0    0 |       2.9    2    4    5 |       0        2    0        0
9   standard    50   50    0    0    0 |       3.4    2    4    6 |       0        1    0        0
10  standard    54   46    0    0    0 |       3.9    3    5    7 |       0        0    0        0
12  standard    47   53    0    0    0 |       4.8    3    6    8 |       0        0    0        0
15  standard    40   60    0    0    0 |       6.1    4    8    9 |       0        0    1        0
5   complex     62   36    0    2    0 |       1.4    1    2    3 |       3       54    0        0
6   complex     71   24    1    4    0 |       1.6    1    2    3 |       2       42    0        0
7   complex     45   51    0    4    0 |       2.2    2    3    4 |       2        8    0        0
8   complex     35   59    0    6    0 |       2.7    2    4    5 |       0        7    0        0
9   complex     42   51    0    7    0 |       3.2    2    4    6 |       0        4    0        0
10  complex     45   45    0   10    0 |       3.5    2    5    6 |       0        4    0        0
12  complex     31   58    0   11    0 |       3.8    2    5    7 |       0        3    0        0
15  complex     26   60    0   14    0 |       4.7    3    7    8 |       0        3    0        0
```

What changed: six players now ends on the first morning 2% of the time instead of
51% (only the Chameleon taking a card, or a coin-flip poison, can do it), and a
detective-led town wins it three times in four, which is the bot's strength at a
one-crew table rather than a problem. Seven players lost its Godfather and moved
from 68% crew to about even. Ten players moved from three crew to two and from 70%
crew to about even. Nothing stalls; every game has a winner; wipe-outs round to
zero and are a town win when they happen.

The balance test asserts: no stall, no game without a winner, wipe-outs at most
1%, first-morning endings at most 5%, and each side winning at least 15% of
detective-led games at every size from 5 to 15 at every complexity.

## 2. The big-screen mode

The user's proposal: the narrator casts a table view to a TV, every player scans a
QR code to get their role and to vote, and the TV shows only what the whole town
knows.

**What is cheap:** every role's view is already decided in one place,
`perspectiveFor()` in `src/ui/screens/night.ts`. The town's view is that
projection with no role. Hiding the right things is a solved problem in this
codebase.

**What is expensive:** the app is a static page with no server, and the TV and
the phones need to receive state from the narrator's phone. The narrator's phone
stays the single source of truth and pushes *projections*, never the state: the
public view to the TV, each seat's own view to that seat's token. A tiny relay
(a room on a Cloudflare Worker with WebSockets, free tier, or equivalent) carries
them. The relay never holds the whole game. WebRTC was considered and rejected:
it still needs signalling, and eight phones on party Wi-Fi is where it fails.

Phased so that each step is worth shipping alone:

1. **TV view.** A QR on the narrator's phone opens the room on the TV: the table,
   who is dead, the verdict and dawn slides on the big screen, the day timer.
   Nothing secret leaves the phone.
2. **Phone role cards.** Each seat scans its own QR and gets its card, hold to
   reveal kept. Retires pass-the-phone, the slowest part of setup.
3. **Voting from phones.** A tally on the TV, votes revealed one by one, the
   extra vote and the silence applied by the engine instead of from memory.
4. **Night actions from phones.** The narrator becomes optional and the product
   changes from a narrator's assistant to a full game app. Not planned: the
   narrator reading the night aloud is most of the atmosphere. If it is ever
   built it is a separate mode.

Steps 1–3 are roughly the size of the engine rewrite: three or four sprints, plus
the first piece of infrastructure the project owns. **The design is in
`docs/BIG-SCREEN.md`**: topology, room codes, what travels, the relay, the two
pages, and the five decisions the user has to make before phase 1 starts.

## 3. Other features

- **Sound and haptics.** Night ambience, a single drum on the verdict, a click
  when a seat is chosen. Offline; audio needs one user gesture to unlock.
  Respect `prefers-reduced-motion` and a mute in ⋯.
- **The morning paper.** The game-over history rendered as a front page: who was
  who, the nights, the executions, the death lines as headlines; shareable as an
  image through the Web Share API.
- **Day timer.** A countdown for the discussion, on the phone now and on the TV
  later. Large, Plex Mono, no scrolling.
- **Vote tally on the day screen.** Who voted for whom, so the town can argue
  over it without the narrator keeping it in their head. Needs a per-player vote
  record in the engine (a public outcome), which is also what the TV tally and
  phone voting will use.
- **Balance preview in setup.** The dealer shows the expected win split for the
  table it just built, from precomputed simulator numbers.
- **Running statistics** across games on the same roster: who gets hanged most,
  which side wins, the Detective's hit rate. The roster already persists.
- **A rules card per role** during the reveal, for first-timers.
- **The Cultist's win condition.** The one card with no reason to exist. Needs
  a rule decision from the user; nothing invented beyond the script until then.

## 4. Order of work and who does what

Two sessions work in parallel on separate branches (see CLAUDE.md, "Working in
this repo"). Engine and simulation on one side, product features that do not
touch the engine on the other, so the branches merge cleanly. Both edit
CLAUDE.md only in their own bullets.

### Session A — `pueblo-duerme-f3` (worktree `night-logic`)

1. **Permanent simulator** — `src/engine/sim/` (policies, `playGame`, stats),
   `npm run sim` printing the table above, and `balance.test.ts` asserting the
   invariants. *Done first because 2 and 3 are verified with it.* **Done.**
2. **Wipe-out is a town win** — `winner()` in `src/engine/state.ts`, tests.
   **Done.**
3. **Deal balance** — `crewSize` and the Godfather threshold in
   `src/engine/deal.ts`; rerun the table into this document. **Done.**
4. **Per-player vote record** — an engine outcome for the day's vote, so the tally
   (peer, step 4 below) and later the TV have data. Engine only; the UI is the
   peer's. **Done:** `castVote`, `withdrawVote`, `tally`, `leader` in
   `src/engine/state.ts`; the public `tally` outcome; `STATE_VERSION` 3.
5. **Balance preview in setup**, from the simulator's numbers. **Done:**
   `balanceOf()` in `src/engine/balance.ts`, `balanceMarkup` under the
   complexity chips.

### Session B — `pueblo-duerme-60` (main checkout)

1. **Day timer** on the day screen.
2. **Sound and haptics**, with a mute in ⋯.
3. **The morning paper** on the game-over screen, with share.
4. **Vote tally on the day screen**, once the engine outcome from A4 is on
   `main`.
5. **A rules card per role** in the reveal.

### Then, together

- The big-screen mode, designed in `docs/BIG-SCREEN.md`. **Decided on
  2026-09-04:** the relay runs on Cloudflare; the seating plan is the screen,
  with deaths, votes and the readings overlaid on it; the narrator's own phone
  or iPad in landscape is the first screen, a TV through the relay the second.
  Phase 0 (the table view on the narrator's device, no relay) is Session A's
  next build. **Done:** `src/room/projections.ts`, `src/ui/screens/table.ts`,
  "Show the table" in ⋯. **Phase 1 built** (`relay/`, `src/room/client.ts`,
  `tv.html`, "Big screen" in ⋯): waiting on a Cloudflare login to deploy.
- Running statistics.
- **The Cultist stays out for now** (decided 2026-09-04): a pending feature,
  not planned, until the user chooses a rule for it. The card remains
  assignable by hand and the split still works; nothing more is built on it.
