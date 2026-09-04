# Omertà design language

The visual identity of the v3 app. This is the authority for any UI change;
`src/ui/tokens.css` is its executable form and `docs/design-language.html`
is the same spec rendered as a page (open it in a browser; it also lives at
https://claude.ai/code/artifact/3d1fa747-13b0-47c7-b890-ae49b7c3c262).

**One sentence:** a case file the narrator holds in the dark. Hard edges,
hairline rules, one red for anything that draws blood, and type that does the
theatre so colour doesn't have to.

## Four rules everything answers to

1. **The room is dark.** One hand, one thumb, one voice reading aloud.
   Nothing flashes white. Nothing to hit is smaller than 48px. Contrast is a
   feature, not a compliance box.
2. **Colour is evidence.** Every colour on screen means something: whose
   side, who's dead, what's lethal. A colour that is only there to look nice
   gets removed. Red in particular is rationed.
3. **Type does the theatre.** Bebas Neue at poster size carries the mood so
   the interface underneath can be plain, fast and legible. Personality lives
   in the headline, never in gradients.
4. **The phone is a prop.** It is passed around a table. The reveal must not
   leak across the room, the bar vanishes while a player holds it, and a
   reload must not end the game.

## Palette

Five colours. Everything else is mixed from them with `color-mix()`. Nothing
gets invented outside this set, however "neutral".

| Name | Hex | Job |
|---|---|---|
| **Vendetta** | `#FF0F0F` | Blood, the crew, the button that kills. A verb, never decoration. |
| **Midnight** | `#000029` | The ground. Every night screen sits on this. Never pure black. |
| **Ash** | `#D8D4C0` | Secondary ink, hairlines, the town's colour, anything muted. |
| **Ledger** | `#F7F6F2` | Primary ink at night. The one bright surface by day. |
| **Neon** | `#54F4FF` | The role glyphs, and nothing else. A sign lit in a dark street. |

**Neon has one job.** It is the ink of a role's sigil (`--glyph`) on a dark
ground: a seat tile, the night card, a hollow mark. It is not a side, not a
state, not text, not a surface and not a button. On paper the same sigil is
Midnight ink, because Neon on Ledger is invisible (1.2:1). It never sits on
Vendetta (3:1) and never inside a filled mark, whose ink is already set by
the side. `--glyph-dim` is the only derived state, for the dead.

### Derived scale (see `tokens.css` for the exact mixes)

- **Surfaces** step up from Midnight with a little Ledger: `--bg`,
  `--surface`, `--surface-raised`; `--surface-sunken` steps down. `--bg-day`
  is Midnight with Ash for the daytime ground.
- **Paper** is Ledger with Midnight ink (`--paper`, `--on-paper`,
  `--paper-rule`). Used for the morning report, the held role card, and the
  end-of-game history. Nothing else.
- **Ink**: `--fg` Ledger, `--fg-2` Ash, `--fg-muted`, `--fg-faint`.
- **Lines**: `--hairline` (22% Ash), `--hairline-strong` (48% Ash).
- **Vendetta states**: `--lethal`, `--lethal-dim`, `--lethal-glow`. The only
  colour with states.
- **Glyph ink**: `--glyph` (Neon) and `--glyph-dim` (45% Neon on Midnight).

### Who gets which colour

- **Crew is Vendetta.** Seats glow red for the narrator at night; log marks
  are solid red squares.
- **Town is Ash.** Solid Ash squares in the log; plain hairline seats.
- **The two occult roles (`MEDIC`, `SPLIT`) are hollow.** An Ash outline
  instead of a fill. Same palette, visibly other. They are still town.
- **The dead are faint**, with one dim Vendetta strike across the seat.
  Never removed, never hidden.
- **The narrator's hand is Ledger.** Selected, focused, primary: all invert
  to Ledger-on-Midnight. No third colour for "you are here".
- **The role is Neon.** Its sigil, drawn in straight lines, in `--glyph` on
  a dark ground. Colour still says the side (the fill, the glow); the
  sigil says who. Neon on its own never means a side.

### Contrast, measured

| Pair | Ratio | Use |
|---|---|---|
| Ledger on Midnight | 18.8:1 | any size |
| Ash on Midnight | 13.7:1 | any size |
| Midnight on Ledger | 18.8:1 | any size |
| Vendetta on Midnight | 5.2:1 | body text OK |
| Midnight on Vendetta | 5.2:1 | body text OK |
| Ledger on Vendetta | 3.6:1 | display size only |
| Vendetta on Ash or Ledger | 2.7:1 | **never for text** |
| Neon on Midnight | 15.3:1 | glyphs, any size |
| Neon on Vendetta | 3.0:1 | **never**; a sigil on red is Midnight |
| Neon on Ash or Ledger | 1.1–1.2:1 | **invisible**; a sigil on paper is Midnight |

The two that bite: **text on a red button is Midnight, not white**, and
**red on paper is a rule or a strike-through, never small text.**

## Typography

Three faces, one job each. All three are self-hosted through `@fontsource`
(imported in `src/main.ts`, latin subsets) because the PWA rule bans CDNs.

| Role | Face | Where |
|---|---|---|
| Display | **Bebas Neue** | Titles, buttons, seat names, menu items, the marks. Always caps, tracked `0.02–0.05em`, line-height `0.9`. Never below `1.25rem` (`--text-display-min`). Never for a sentence that is read aloud. |
| Body | **IBM Plex Sans** 400 / 500 / 600 | Anything the narrator reads aloud: the night prompt, the report, outcome text. Never caps. |
| Data | **IBM Plex Mono** 400 / 500 | Seat numbers, night counters, timestamps, eyebrow labels. Always `tabular-nums`. |

Rules:

- Every button label is Bebas. Every sentence is Plex Sans. Every number is
  Plex Mono, even inside a sentence.
- No italics. Emphasis is weight 600.
- Scale is `--text-xs` … `--text-hero` in `tokens.css`, all `clamp()`.
- If lowercase titles are ever wanted, the swap is Big Shoulders Display.
  Bebas first.

## Shape and surface

- **Radius is zero. Everywhere.** The `--radius-*` tokens exist so a stray
  reference resolves, and they resolve to `0`.
- **Lines, not shadows.** Depth is a 1px Ash hairline and a step up the
  surface scale. `--shadow-*` is reserved for the menu sheet and the held
  role card, the two things that physically sit on top.
- **One ornament: register marks.** The L-shaped ticks in opposite corners of
  a file card (`.file`, `.card`). Only on things that represent a record,
  never on a button or a seat.
- **Hairline grids.** Groups of equal things sit in a 1px grid with the gap
  painted in `--hairline`, like ruled paper.
- **The stamp** (a rotated, outlined Vendetta word) at most once per screen:
  CASE CLOSED on the end-of-game report, BLOCKED across a failed kill. Never
  on a button.
- **Seats are squares**, kept upright. Chairs around a table, not avatars.

## Components

- **Buttons.** `.btn--primary` Ledger fill, Midnight ink. `.btn--ghost` a
  hairline. `.btn--danger` Vendetta fill, **Midnight** ink, and it exists for
  exactly three actions: confirm a kill, confirm a lynch, end the game.
  `.btn--ok` Ash fill. Disabled is transparent with a hairline.
- **Seats.** `.seat` is a square tile with the seat number top-left in mono.
  `[data-crew]` glows (narrator only). `[data-selected]` inverts to Ledger.
  `[data-dead]` goes faint with a strike. `[data-ineligible]` is dashed and
  dimmed, still there. The table is mirror-symmetric: seat 1 sits at the
  top for an odd count, and an even count straddles the top half a step
  either side. Tiles are sized from the chord between neighbours so upright
  squares never overlap (`--seat` in `styles.css` shows the algebra), down
  to a 2rem floor; past that the list layout is the answer.
- **The mark.** `.mark` is a 2rem square holding the role's sigil. Fill and
  ink come from `data-accent` (`crew` / `town` / `occult` / `system`), set
  from `src/ui/accent.ts`; the sigil is drawn in that ink. Colour says whose
  side; the sigil says who. Marks with no role (a lynching, a night
  boundary) keep a text glyph.
- **The sigils.** One per role in `src/ui/sigils.ts`, straight lines on a
  24-unit grid, judged on `docs/sigils.html`. They appear on the seat above
  the name (narrator views only), top-right of the night card, above the
  role name on the held card, the inspect card and the question card, and
  inside every mark. Neon on dark, Midnight on paper, the mark's ink inside
  a mark. The Family's fedora is the favicon.
- **Ledger lines.** The timeline (`.log__row`) is night · mark · sentence ·
  revert, with a hairline under each row and no background.
- **Newsprint.** `.report` is Ledger paper with Midnight ink; a killing's
  name is struck through in Vendetta. On paper the town mark becomes ink
  (Midnight), because Ash on Ledger is invisible.
- **The bottom bar.** One bar on `--surface` with a hairline on top; the
  timeline as quiet Plex text and ⋯ in a square. Never rendered during a
  reveal.
- **The held role card.** Paper for every role alike, with the side in mono
  text. A colour-coded card would tell the table the side before the reader.
  The same rule applies to the across-the-room inspect card.
- **The dawn slideshow.** `.screen--dawn` (`src/ui/screens/dawn.ts`) shows
  the night's public outcomes one full screen at a time. It starts by itself
  when the night ends and replays from the ▶ on the day screen. A death sets
  `data-lethal`: the whole ground goes Vendetta and
  every ink goes Midnight. It is the danger button at cinema size and **the
  only time Vendetta is a surface**. The mark inverts (Midnight block,
  Vendetta letters), primary becomes a Midnight block with Ledger, ghost a
  Midnight hairline; nothing white and nothing Ash touches the red. The name
  is Bebas at the display maximum; the sentence under it comes from a bank
  in the string tables (`ui.dawn.death`) picked by night and seat, never at
  random. Calm slides stay on the day ground. The bar is not rendered while
  a slide is up, for the same reason as the reveal: the timeline would show
  the town every move. The day table behind it is plain by default — names,
  the dead, the flagged — and the Roles toggle brings the narrator's board
  back.
- **The discussion clock.** `.clock` (`src/ui/screens/timer.ts`) sits under
  the day head: one wide hairline face with a mono eyebrow on the left and
  the digits on the right in Plex Mono at display size, `tabular-nums`, so
  the count reads from across the table with the phone propped up; the
  reset is the usual icon square beside it. Its states are the moves a seat
  makes: idle is Ash ink, running takes Ledger ink and a stronger hairline,
  done inverts to a Ledger block with Midnight ink. It never goes red: the
  clock is not lethal, the vote after it is. Its length is a segmented row
  in ⋯, label above and four choices across, because four Bebas choices do
  not fit beside a label on a phone.
- **The vote.** Votes against a seat are a `.seat__votes` badge in the
  bottom-right corner (the question flag keeps the top), an Ash block with
  a mono figure; the seat the town points at (`[data-leader]`) takes a
  Ledger edge and a Ledger badge, one step short of selected, because the
  narrator's tap is still what executes. While votes are being recorded the
  armed voter is selected (inverted) and the how-to replaces the mono
  question with a Plex sentence. The count (`.tally`) is a wrapping row of
  figure · name · voters: the figure in a hairline box that inverts for the
  leader, the name in Bebas, the voters in muted Plex; the Raven's extra is
  a bare +1. No red anywhere in it: a vote is the town's, and only the
  execution it leads to is lethal.

- **The morning paper.** `.paper` (`src/ui/screens/paper.ts`) is the
  game-over screen: Ledger paper, Midnight ink, the app's name as a masthead
  in Bebas at the hero size over a double rule, a mono dateline, the winner
  as a balanced Bebas banner over a thick Vendetta rule, then every death as
  a headline (night in mono, name in Bebas, the dawn line in Plex), who was
  who as a two-column list where the Family carries a solid Vendetta square,
  the town a hollow one, and the dead a Vendetta strike, and the record
  night by night in Plex. Red on paper stays a rule or a strike. The shared
  image is the same page drawn on a canvas with the same faces and colours.

## Sound

Three cues and nothing decorative, all synthesised in `src/ui/sound.ts` so
the offline shell carries no audio files:

- **The night** is a low wind — noise through a low-pass whose cutoff drifts
  every fourteen seconds — over two sines at 55 Hz a hair apart, so they
  beat slowly. It fades in over 2.5 s when a night screen appears and out
  over 1.5 s with the morning. It sits under the narrator's voice; it never
  competes with it.
- **The verdict** is one drum: a sine falling from 150 to 45 Hz under a short
  burst of noise around 200 Hz. Once, on the tap that executes.
- **A chosen seat** is a 25 ms triangle blip at 1.8 kHz: a pen on paper, not
  a beep. Also on a vote and on the Gunman's shot.

Nothing plays before the first tap on the page, and a mute in ⋯ turns all of
it off at the source: muted, no audio context is ever created. Haptics are
separate — a 12 ms tap on most moves, a three-beat pattern on the verdict and
when the clock runs out — and stop entirely under `prefers-reduced-motion`.

## Motion

Film cuts, not app fades. A page is turned, not dissolved. Nothing bounces
(`--ease-spring` was removed).

Entrances play once. `screen-in`, `seat-in`, `card-in` and `line-in` run
when a scene arrives (`.stage[data-enter]`) and never on a repaint of the
same scene: a pick, the menu, a toggle rebuild the same DOM and must not
bounce the table into place again. Screen to screen, the page itself only
fades; the screen inside it is what slides.

| Token | Use |
|---|---|
| `--dur-instant` 90ms | press: a 1px nudge and a colour swap |
| `--dur-fast` 150ms | screen to screen |
| `--dur-base` 220ms | things that slide up from the bottom: sheets, the role card; the ground turning red between slides |
| `--dur-slow` 600ms | **dawn only**: the ground colour at phase change, and the red draining out when the slideshow closes |
| 2.6s loop | the crew glow, the only looping animation; frozen under `prefers-reduced-motion` |

## Night and day

`html[data-phase='night']` paints `--bg` (Midnight). `html[data-phase='day']`
paints `--bg-day` (Midnight + Ash: warmer, still dark). The page never goes
light; the report card is the sunrise. Setup and the reveal are night.
`html[data-dawn='lethal']` is the one exception: a death slide paints the
page Vendetta for as long as it is on screen.

## Voice

Labels are stamps, sentences are testimony. Bebas labels are two or three
words (NIGHT 3, THE TABLE, CASE CLOSED). Buttons name the consequence
("Confirm the hit", not "OK"). Outcome sentences are past tense, active, one
clause, the same weight in both languages. No exclamation marks.

## Do / don't

**Do:** paint the gap in a grid rather than a border on each cell; use
`--surface` steps for depth; let the Bebas title be the biggest thing on
screen; leave Midnight ground visible around cards.

**Don't:** any `border-radius` above 0, pills included; gradients, blur,
glass, or glow on anything but the crew; icons where a Bebas word fits; a
sixth colour; a hue per role; Neon as text, as a button, as a surface or as
a side; white text on red; small red text on paper.
