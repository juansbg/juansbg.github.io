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

- Night actions from the phones (phase 4 in the roadmap). The narrator reading
  the night aloud is most of the atmosphere; a phone that lights up during the
  night also says who is awake. Not designed here.
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
   sprint.
3. **Votes from seats**: small once 2 exists; the engine side is already done.

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
