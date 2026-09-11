# The big-screen mode — design

The proposal (docs/ROADMAP.md, section 2): the narrator puts a table view on a
TV, every player scans a QR code to get their role and to vote, and the big
screen shows only what the whole town knows. This is the design for it, written
before anyone builds it. It ends with the decisions the user has to make.

## 0. Decisions taken (2026-09-04)

- **The seating plan is the screen.** Whatever else is shown is an overlay on
  the circle: dead seats, vote badges, the leader, the timer, and the morning
  and verdict readings as a card over the table. There is no separate
  "report" layout on the big screen.
- **Landscape first.** The narrator will stand a phone or an iPad on its side
  for this mode, or mirror it to a TV. The table view is designed for a wide
  screen and degrades to portrait, the opposite of every other screen in the
  app. The manifest no longer locks the orientation.
- **Phase 0 comes before the relay:** the table view renders on the
  narrator's own device from the same projection the TV will receive, toggled
  from ⋯, with the bar hidden because the town can see it. It needs no
  network and is the reference rendering for `tv.html`.
- **The relay runs on Cloudflare** (a Worker and a Durable Object).
- Decisions 2–5 in section 9 stand at their recommendations until the user
  says otherwise: the seat page is an option per game, the ballot is sealed
  with a live count of how many have voted, ties stay with the narrator, and
  the screen follows the narrator's language.
- **Players name themselves (decided 2026-09-04).** One QR for the whole
  table; a player scans it, types a name, and takes the seat with that name
  or adds one. The per-seat QR in §3 is not built. **The ballot is sealed**
  until the narrator taps Reveal (decision 3, confirmed).

## 1. Goals and non-goals

**Goals**

- The TV shows the table the way the town sees it: names, who is dead, the
  morning and the verdict read full screen, the day timer, the tally.
- Each seat gets its own role card on its own phone, with the hold-to-reveal
  kept, so pass-the-phone goes away.
- Each seat votes from its phone; the tally on the TV and in the engine is the
  same thing.
- The narrator's phone stays the only source of truth. Nothing secret ever
  leaves it in the clear.
- The narrator's app keeps working exactly as today with no network. The room
  is a layer on top; if the relay dies mid-game, the game continues on the phone.

**Non-goals**

- ~~Night actions from the phones (phase 4 in the roadmap).~~ Designed in
  §10 (2026-09-11) once the room, the cards and the votes were live: the
  narrator still reads the night, every phone stays lit and identical, and
  the acting seat's phone alone carries the question.
- Persistence on the server. The relay holds nothing that survives the room.
- Accounts, logins, a lobby. A room is a code and a QR.

## 2. Topology

```
 narrator's phone ──publishes projections──▶ relay (one room) ──▶ TV
        ▲                                        │             ─▶ seat 1 phone
        └────────── votes, joins ◀───────────────┘             ─▶ seat 2 phone …
```

- **The narrator's phone** runs the app as today and, when a room is open,
  publishes a *projection* after every state change: one for the TV, one per
  seat. It computes them itself from `GameState`; the relay never sees the
  whole state.
- **The relay** is a dumb hub keyed by room code. It fans projections out to
  the right connections, forwards votes back to the narrator, and remembers the
  last projection per target so a reconnecting viewer gets it at once.
- **The TV** is a page that renders the TV projection. **A seat** is a page
  that renders its seat projection and sends votes.

Why not peer to peer: WebRTC still needs signalling, and eight phones on a
party's Wi-Fi, some on mobile data, is where it fails. A relay is the boring
answer and the right one.

## 3. Rooms, codes and QR

- The narrator opens a room from ⋯ ("Big screen"). The phone generates a room
  code (four words from a small list, or five letters, readable across a room)
  and a **room secret** and a **seat key** per seat, all random, all on the
  phone.
- The TV QR is `…/tv#room=CODE`. The seat QRs are `…/seat#room=CODE&seat=3&key=…`.
  The fragment is never sent to any server, so the seat keys travel only from
  the phone's screen to the player's camera.
- The narrator shows the seat QRs one at a time from the roster (tap a seat →
  its QR fills the screen), or all at once on the TV as a grid labelled by name.
  The grid on the TV is fine: a key is only useful with the seat page, and the
  seat page shows the role only after hold-to-reveal, so scanning someone
  else's code across the room gains nothing the narrator would not notice.

## 4. What travels

All messages are JSON over one WebSocket per client. Sizes are tiny: a
projection for twelve players is under 2 KB.

**Phone → relay → TV**, `tv` projection. Public facts only:

```ts
interface TvProjection {
  kind: 'tv'
  locale: Locale
  phase: 'setup' | 'night' | 'day' | 'over'
  night: number
  day: number
  players: { id: number; name: string; alive: boolean; silenced: boolean; extraVote: boolean }[]
  /** Public outcomes only, the same objects the report renders. */
  log: Outcome[]                       // every one has public: true
  /** The reading up right now, if any, and which slide. */
  reading: { kind: 'dawn' | 'verdict'; index: number } | null
  timer: { endsAt: number } | null      // epoch ms; the TV counts down itself
  tally: { target: number; votes: number }[]   // counts only, no voters
  winner: Winner | null
}
```

The TV renders it with the same code the phone uses: `circleMarkup` with a
`perspective` of nobody, `dawnMarkup` for the readings, `outcomeCardMarkup` for
the record. The same bundle, so the two never drift.

**Phone → relay → one seat**, `seat` projection, encrypted for that seat:

```ts
interface SeatProjection {
  kind: 'seat'
  seat: number
  name: string
  roleId: RoleId | null                 // null until dealt
  /** What this role knows, from perspectiveFor(); empty lists for a citizen. */
  perspective: { self: number[]; crew: number[]; doomed: number[]; marked: number[] }
  alive: boolean
  canVote: boolean
  vote: number | null
  eligible: number[]                    // living seats other than this one
  phase: 'setup' | 'night' | 'day' | 'over'
}
```

The payload is encrypted on the phone with the seat's key (WebCrypto,
AES-GCM, key derived from the fragment). The relay forwards bytes it cannot
read, and may keep the last one for reconnects without ever holding a role in
the clear. This costs about thirty lines and closes the "does the server know
who the Family is" question for good.

**Seat → relay → phone**:

```ts
{ kind: 'joined'; seat: number }
{ kind: 'vote'; seat: number; target: number | null }   // null withdraws
```

The phone applies a vote through `castVote` (which already refuses the dead,
the silenced and self-votes), records it in the timeline, and republishes.
The narrator still confirms the execution with the existing tap; the tally
only preselects the leader.

**TV → nothing.** The TV never sends.

## 5. The relay

A Cloudflare Worker with one Durable Object per room. Reasons: nothing to keep
alive, free at this scale, one ordered hub per room, WebSockets built in,
rooms evict themselves. The whole server is one file.

- `POST /rooms` → `{ code }` (the phone supplies the room secret's hash; the
  object stores only the hash).
- `GET /rooms/:code/ws?as=narrator&secret=…` — one narrator; rejected if the
  secret does not match the hash.
- `GET /rooms/:code/ws?as=tv` — any number.
- `GET /rooms/:code/ws?as=seat&seat=3` — one per seat; a newer connection
  replaces the older one. The seat key never reaches the server; it is only
  used to decrypt on the phone.
- The object keeps `lastTv` and `lastSeat[seat]` in memory, sends them on
  connect, forwards `vote` and `joined` to the narrator, and evicts the room
  after six hours idle. Message cap 16 KB, a few messages per second per
  connection, no storage.

**Keeping it closed until release (2026-09-04).** The site is public and the
relay is metered, so: only the site's origin is answered; opening a room needs
a key only the narrator has (`ROOM_KEY`, a Worker secret, typed once into the
phone); one address gets thirty handshakes a minute; a room holds forty
sockets. The account stays on the Free plan, which stops rather than bills.
To release, publish the key in the app or drop the check, and widen the
origins if the app ever lives elsewhere.

Any WebSocket relay would do (sixty lines of Node on Fly or Render); the
protocol does not depend on Cloudflare. The relay URL is a build-time constant
with a per-game override in ⋯, so a self-hosted one is a setting.

## 6. The pages

Two more Vite entries beside `index.html`: `tv.html` and `seat.html`. Separate
entries so the narrator's bundle and its no-scroll rules stay untouched, and so
a TV or a seat never loads the narrator's handlers. They share `tokens.css`,
the screens they render, and the i18n tables.

**TV.** Full screen, Bebas names at a size that reads from a sofa, the same
five colours. Setup: the room code and the seat QR grid. Night: the ground
tinted cold, "The town sleeps", nothing else. Morning and verdict: the reading,
advanced by the narrator (the TV follows `reading.index`). Day: the table, the
timer, the tally as bars, votes revealed one by one when the narrator taps
"reveal" (or live, see decisions). Over: the winner and the history.

**Seat.** Join → "You are Ana, seat 3" → the hold-to-reveal card, reused from
`reveal.ts` (`pointercancel`, `pointerleave`, `visibilitychange` all hide it).
Day: the eligible seats as buttons, one vote, changeable until the narrator
executes. Night: "The town sleeps" for every seat, the same screen for all, so
the light of a phone says nothing. After death: "You are out" with the option
to keep watching the TV projection.

## 7. On the narrator's phone

- `src/room/projections.ts` — pure: `tvProjection(state, locale, ui)` and
  `seatProjection(state, seat, perspective)`. Tested the way the player view
  is tested: a TV projection contains no `roleId`, no non-public outcome, no
  voters; a seat projection contains one role and only its own perspective.
  **Those tests are the security model of the mode; do not weaken them.**
- `src/room/client.ts` — the WebSocket, reconnect with backoff, encrypt per
  seat, a `publish(state)` debounced to one message per animation frame.
- `app.ts` — publish after every `setState`; apply incoming votes with
  `castVote` through `mutate` so they are in the log and undo; a "Big screen"
  row in ⋯ with the room code and a way to close the room.
- Nothing in the engine changes. The engine already has everything the mode
  needs: `perspectiveFor`, `castVote`, `tally`, `leader`, public outcomes.

## 8. Phases and size

0. **The table view on the narrator's device** (`src/room/projections.ts`,
   `src/ui/screens/table.ts`, a row in ⋯): the projection and its leak tests,
   the landscape layout, the overlays. No relay. Small, and everything after
   it renders through it. **Done.**
1. **TV view** (room, relay, `tv.html`, the TV projection, the QR): the
   narrator's phone drives, the TV follows. About the size of the PWA sprint
   plus the relay. Ships alone and is worth it alone. **Built** (2026-09-04);
   the relay is deployed at `https://omerta-relay.jsblanco-gomez.workers.dev`
   (`npm run relay:deploy`, the machine is logged in) and `VITE_RELAY_URL` in
   `.env` makes it the app's default.
2. **Seat cards** (`seat.html`, the seat projection, encryption, the join
   flow): pass-the-phone becomes optional. About the size of the reveal
   sprint. **Built** (2026-09-04): ECDH over the relay, AES-GCM on every
   seat projection, join by name, the card under a hold.
3. **Votes from seats**: small once 2 exists; the engine side is already done.
   **Built** with 2: a vote from a phone is `castVote` through the log, the
   ballot sealed on the TV until the narrator reveals.

Three or four sprints for all of it. Phase 1 is where the infrastructure gets
decided, so it is the one to start with.

## 9. Decisions for the user

1. **Where the relay runs.** Cloudflare (recommended: a free account, a
   Worker and a Durable Object, deployed from this repo with `wrangler`) or a
   self-hosted Node relay. Either way an account and a URL are needed before
   phase 1 starts.
2. **Is the seat page the default or an option?** Recommended: an option per
   game, off by default, so a table without a TV plays exactly as today.
3. **Open or sealed ballot.** Live tally on the TV as votes come in (fast,
   noisy, fun), or sealed until the narrator taps "reveal" and the votes come up
   one by one (the drama option). Recommended: sealed, with the live count of
   *how many* have voted, not for whom.
4. **Ties.** Today the narrator decides. With phone voting the engine's
   `leader()` returns null on a tie and the narrator still picks; keep that, or
   add a runoff? Recommended: keep it.
5. **Language on the TV and the seats.** Follow the narrator's phone
   (recommended), or let each seat pick its own.

## 10. Phase 4 — the night from the phones (designed 2026-09-11)

The user's brief: the whole point of the QR codes is that every player acts
from their own phone, at night as well as by day, the TV shows the count and
never the voters, and the narrator, who still carries the admin device, stops
walking the one phone that holds every choice around the table.

By day this already holds: a phone votes through `castVote`, the ballot is
sealed on the TV with a running count of how many have voted, Reveal puts the
count against each seat and never a voter, and the execution stays the
narrator's tap. What is missing is the night. Section 1 called it a non-goal
for phase 1; this section designs it as **a layer on the same room**, not a
separate mode: a seat with a phone acts from it, a seat without one is acted
for by the narrator as today, and the two mix at one table.

### 10.1 Principles

- **The narrator still reads the night.** Nothing advances by itself. The
  narrator says "Detective, wake up", the Detective's phone carries the
  question, the answer arrives and the step moves on, the narrator reads the
  next line. No step has a timer. The narrator's own screen keeps every seat
  tappable, so a dead battery or a player who has fallen asleep costs one tap,
  not the game.
- **Every phone shows the same night.** A lit phone must not say who is
  awake, so every seat's phone stays on the whole night (a screen wake lock
  where the browser gives one) and shows the same screen at every step: the
  night's ground, the role being read, the table as a plain circle. Only the
  acting seat's screen answers a tap. The rule the narrator reads out at the
  first night: *keep your phone in your hand and look at it at every step.*
  Thumbs are the residual leak, as in every phone-based game of this kind; the
  narrator's reading is the cover.
- **A phone knows what its card knows and nothing more.** The night block of
  the seat projection is `perspectiveFor()` made data: the Family sees the
  Family and its pick, the Godfather the victim, the Apothecary who is doomed
  and her vials, the Chameleon the centre, the Detective the card he looked
  at, everyone else their own seat. The playthrough test holds every seat to
  it at every step of 150 simulated games. **Those tests are the security
  model; do not weaken them.**
- **The engine does not change.** A phone's action becomes the same
  `NightAction` the narrator's tap would have made, recorded through
  `recordAction` and `mutate`, so the log, undo and the rewind cover it and
  `legalTargets` is the one rule for who may be picked.

### 10.2 What travels

The seat projection gains `players: { id; name; alive }[]` at every phase (the
table, public already, so the phone can draw the ring) and one block,
`tonight: SeatNight | null` (`night` is already the night's number), built
only while the phase is night and the cards are dealt:

```ts
interface SeatNight {
  /** The role being read right now. The narrator says it aloud, so every phone may show it. */
  step: RoleId | null
  /** This seat holds that role, or wakes with it: its phone carries the question. */
  acting: boolean
  /** What the role knows of the table tonight (perspectiveFor): empty lists for a citizen. */
  view: { self: PlayerId[]; crew: PlayerId[]; doomed: PlayerId[]; marked: PlayerId[] }
  /** The seats this role may pick tonight (legalTargets); empty unless acting. */
  eligible: PlayerId[]
  /** The Apothecary's vials, on her phone alone. */
  vials: { heal: boolean; poison: boolean } | null
  /** The Godfather's one conversion, on his phone alone. */
  convertLeft: boolean | null
  /** The Family's pick tonight, for the Godfather and the Renegade. */
  victim: PlayerId | null
  /** The cards left in the centre, for the Chameleon. */
  spare: RoleId[]
  /** Who the Detective looked at tonight and what they are, on his phone, for the rest of the night. */
  looked: { target: PlayerId; roleId: RoleId } | null
}
```

`acting` is true for a living seat whose role is the step; at the Family's
step, for every living crew member but an Associate who has not joined (the
same set the narrator's card names). `eligible` is `legalTargets` for a
`player` step, the living for a pair or the split, and the Apothecary's
targets for the potion. `looked` is read off the pending Detective action
while the night lasts, the way the narrator's inspection card is.

Seat → relay → narrator, beside `join` and `vote`:

```ts
{ kind: 'mark'; target: PlayerId | null }      // a proposal, not a record: the Family's shared pick
{ kind: 'act'; action: SeatAction }
type SeatAction =
  | { kind: 'target'; target: PlayerId }
  | { kind: 'pair'; first: PlayerId; second: PlayerId }
  | { kind: 'potion'; target: PlayerId; potion: 'heal' | 'kill' }
  | { kind: 'split'; sectOne: PlayerId[] }
  | { kind: 'chooseRole'; newRole: RoleId }
  | { kind: 'confirm' }
  | { kind: 'skip' }
```

The relay checks shapes and sizes and forwards each with the socket's own
`cid`, as it does a vote. It learns nothing: a target is a seat number.

### 10.3 The narrator's phone

`acceptAction(state, seat, action)` in `src/room/actions.ts` is the pure
gate, tested on its own: the sender must be acting at the current step; a
target must be in `legalTargets`; a pair is two distinct living seats; a
potion respects the vials and `doomedTonight`; a split leaves someone on both
sides; a card taken must be in `spareCards`; the Associate may choose only
`KILLER` or `PLAIN`; `confirm` only where the step offers it. What passes is
recorded through `mutate` as a `'action'` timeline entry, exactly as a tap.
What fails is dropped and the phone is republished, so it sees the step
unchanged.

A `mark` from an acting seat sets the narrator's `picked` for a `player`
step, which every Family phone sees through `view.marked`: any of them can
move the mark, any of them confirms with `act`. The Godfather and the Renegade
see the recorded pick as `victim`, as today.

The night screen says who it is waiting for: when every seat named on the
card holds a phone, the situation line reads that they are choosing on their
phone, and the seats stay tappable underneath. The Detective's inspection card
is not shown on the narrator's device when the look came from a phone; it goes
to the Detective's phone as `looked`.

### 10.4 The phones

Every step, every phone: the step's role name and sigil, the plain circle, the
night's cold ground. The acting phone alone gets the chooser, mirroring the
narrator's: tap a seat for a `player` step (with "Nobody" where the narrator
has it); two taps for the pair; a seat then a vial for the Apothecary, the
vials locked the way hers are; tap the first faction then confirm for the
Cultist; the centre's cards for the Chameleon; take him in or let the hit go
for the Godfather; the two sides for the Associate. The Detective's phone shows
the card he looked at, the same card the narrator held up, for the rest of the
night. The dead see the night like everyone else and can do nothing.

By day nothing changes but polish: after voting, the phone says it is waiting
for the others; while the narrator counts, that the count is with the narrator.

### 10.5 The TV

Nothing new. The night is "the town sleeps" and the step being read; the
ballot is sealed with the count of how many have voted; Reveal shows counts
against seats and never who voted; the execution is the narrator's. The one
open dial is whether the per-seat count goes live as votes come in instead
of on Reveal; the decision of 2026-09-04 (sealed) stands until the user says
otherwise.

### 10.6 Decisions taken (recommendations, standing until the user objects)

1. Every phone is lit and identical through the night; only the actor's
   answers. No fake taps are asked of anyone.
2. The Family's hit is a shared mark that any Family phone may move and any
   may confirm. No vote among them, no seniority.
3. The narrator keeps every seat tappable and undo covers a phone's action.
   Nothing advances on a timer.
4. Mixed tables are first class: a seat without a phone plays as today.
5. The ballot stays sealed with a live count; Reveal shows counts, never
   voters.

### 10.7 Who builds what

**Session A** (engine, room, relay): the contract first, so B can build
against it: `SeatNight` on the projection with its leak tests in
`projections.test.ts` and `playthrough.test.ts`; `src/room/actions.ts` and its
tests; the relay's two new message kinds; the narrator's handler and the
"choosing on their phone" line; the relay deploy.

**Session B** (the phone and the screen): the seat page's night — the common
step screen, the chooser per step kind, the Detective's card, the wake lock,
the strings in both languages, the day's waiting lines — in `screens/seat.ts`
and `seat.ts`, on the contract above; the TV's night caption; `docs/DESIGN.md`
for the new screens.
