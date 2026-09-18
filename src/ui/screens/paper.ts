import { ROLES, type RoleId } from '../../engine/roles'
import { revealedDead, winner, type Winner } from '../../engine/state'
import type { DeathCause, GameState, Outcome, Player, PlayerId } from '../../engine/types'
import { outcomeAccent, renderOutcome, renderWinner, strings, type Locale } from '../../i18n'
import { accentOf, outcomeAccentOf, type Accent } from '../accent'
import { esc } from '../dom'
import { sigilMarkup } from '../sigils'
import { formatClock, type TimerView } from './timer'
import { deathLines } from './dawn'

/**
 * The town's paper.
 *
 * One newspaper, printed every morning and once more when the game ends.
 * The daily edition (`edition`) sets the night's public outcomes as a page of
 * short articles in the paper's own voice: the dead by name with the line
 * the town was read at dawn, the verdict with its count, the fire, the mark,
 * the growl, a card gone from the centre; a day after a death the police
 * name what the dead were; and zero to two colour pieces that never name a
 * trade, a person or a role, so nothing on the page can be mistaken for a
 * clue that is not one. The paper never lies: every article about the game
 * is built from the log, and `paper.test.ts` holds the colour bank to it.
 *
 * The final edition (`paperOf`) is the whole game as a front page — v1's
 * end-of-game list, the one thing people liked, set as newsprint: the winner
 * as the banner, every death a headline, who was who, and the record night
 * by night. The same page is drawn onto a canvas for the share sheet, so
 * what leaves the phone is what was on it.
 */

// ---------------------------------------------------------------------------
// The daily edition
// ---------------------------------------------------------------------------

export type ArticleKind = 'death' | 'verdict' | 'event' | 'investigation' | 'clue' | 'colour'

export interface Article {
  kind: ArticleKind
  /** A mono line over the headline: the night, on the final page. */
  eyebrow: string | null
  headline: string
  dek: string
  /** A mono line under the dek: the count on a verdict, the side on an investigation. */
  note: string | null
  /**
   * The mark beside the headline, as on the report and the dawn slides: the
   * sigil of the role that caused it, the town's scales, or the pilcrow of
   * a breadcrumb. Markup, not text. Colour pieces carry none.
   */
  mark: string | null
  /** Whose side the mark is coloured by. */
  accent: Accent | null
  /** The dead, to strike through in the headline as the report does. */
  subject: string | null
  /**
   * The name under the lead's plate. Usually the struck-through one, but
   * an investigation names somebody it does not strike — the town already
   * buried them — and that is still whose picture the page would run.
   */
  who?: string | null
}

/** One name in the day's roll, in seating order, as the ring has it. */
export interface Standing {
  name: string
  alive: boolean
  /** Raised a question about their card; the day table already shows it. */
  asking: boolean
}

export interface Edition {
  masthead: string
  dateline: string
  day: number
  /**
   * The town, down the side of the page.
   *
   * The room used to read who was dead off the seating ring, and the ring
   * is not on the wall while the edition is — which, now the page stays up
   * for the whole discussion, is the length of the argument. A front page
   * has a column for exactly this: a register, in seating order, the dead
   * struck. It carries no fact the ring did not carry a minute earlier.
   */
  roll: Standing[] | null
  /** The first article, across the top of the page. */
  lead: Article | null
  /** The rest, in two columns. */
  rest: Article[]
}

/** A dead player the investigation rule has already made public. */
export interface Revealed {
  id: PlayerId
  roleId: RoleId
  trade: number | null
}

/**
 * What an edition is built from: public facts only, in the shape the TV
 * projection carries them, so the phone and a screen on the relay set the
 * same page from the same data.
 */
export interface EditionSource {
  day: number
  /**
   * `alive` and `hasQuestion` are what the day's roll is set from. They
   * are optional because a test may build a source without them and the
   * roll is then simply not printed — never guessed, because a roll that
   * says everybody is alive is a lie on the one page the town reads.
   * Both are already public: the ring shows them all day.
   */
  players: readonly (Pick<Player, 'id' | 'name'> & Partial<Pick<Player, 'alive' | 'hasQuestion'>>)[]
  /** Public outcomes; anything else in here is ignored. */
  log: readonly Outcome[]
  revealed: readonly Revealed[]
}

type Death = Extract<Outcome, { type: 'death' }>
const isDeath = (o: Outcome): o is Death => o.type === 'death'

/**
 * The investigation rule is the engine's `revealedDead`: a player who died
 * on night N or day N may be named for what they were from the morning of
 * day N + 1. That list is cumulative, and it is what the projection carries
 * for the TV; the paper prints each investigation once, in the edition of
 * day N + 1 and never again, which `editionOf` decides from the death's
 * night in the log. Nothing new is written for it.
 */
export const revealedBy = (state: GameState): Revealed[] =>
  revealedDead(state).map((p) => ({ id: p.id, roleId: p.roleId, trade: p.trade }))

/** How many colour pieces each day gets, cycling; seeded by the day, never drawn. */
const COLOUR_BY_DAY = [2, 1, 2, 0, 1] as const
const colourCount = (day: number): number => COLOUR_BY_DAY[(day - 1) % COLOUR_BY_DAY.length] ?? 1

/** Whether the day's edition has anything to say about the game. */
const newsOn = (log: readonly Outcome[], day: number): boolean =>
  log.some((o) => o.public && (o.night === day || (isDeath(o) && o.night === day - 1)))

/** A quiet night with no colour scheduled still gets a page: one piece. */
const colourWanted = (log: readonly Outcome[], day: number): number =>
  newsOn(log, day) ? colourCount(day) : Math.max(1, colourCount(day))

/**
 * Which piece of the bank the n-th colour article of the game gets. A stride
 * coprime with the bank walks every piece once before any repeats, so no
 * game short of thirty pieces reads the same council notice twice.
 */
const colourIndex = (n: number, size: number): number => (n * 7 + 3) % size

const nameIn = (players: readonly Pick<Player, 'id' | 'name'>[], id: PlayerId): string =>
  players.find((p) => p.id === id)?.name ?? '?'

/** The mark an outcome carries everywhere else: its cause's sigil, the scales, or the pilcrow. */
const markOf = (o: Outcome): string => {
  const source = outcomeAccent(o)
  if (source !== 'town') return sigilMarkup(source)
  return o.type === 'clue' ? '¶' : '⚖'
}

/** One morning's articles, in page order: deaths, the verdict, events, investigations, clues, colour. */
export const editionOf = (src: EditionSource, locale: Locale): Edition => {
  const t = strings(locale)
  const p = t.ui.paper
  const bank = t.ui.dawn.death
  const name = (id: PlayerId): string => nameIn(src.players, id)
  const log = src.log.filter((o) => o.public)
  // The whole log, so a death keeps the line it was given at dawn, and the
  // headline it was set under: both unique in the game while the bank lasts.
  const lines = deathLines(log, (cause) => bank[cause].length)
  const headlines = deathLines(log, (cause) => p.headline[cause].length)
  const pick = <T>(from: readonly T[], n: number): T | undefined => from[n % from.length]

  // The day's record splits where the night turned into the day, as the
  // dawn reading does: the town's vote is the first thing that happens by
  // daylight, so the verdict and what it dragged along come after the night.
  const todays = log.filter((o) => o.night === src.day)
  const cut = todays.findIndex((o) => o.type === 'tally' || (isDeath(o) && o.cause === 'lynch'))
  const night = cut === -1 ? todays : todays.slice(0, cut)
  const daytime = cut === -1 ? [] : todays.slice(cut)
  const tallied = daytime.find((o) => o.type === 'tally')
  const count = tallied ? renderOutcome(tallied, src.players, locale) : null

  const deathArticle = (o: Death): Article => {
    const who = name(o.target)
    const verdict = o.cause === 'lynch'
    return {
      kind: verdict ? 'verdict' : 'death',
      eyebrow: verdict ? p.kicker.verdict : p.kicker.death,
      headline: p.headline[o.cause][headlines.get(o) ?? 0]?.(who) ?? '',
      dek: bank[o.cause][lines.get(o) ?? 0]?.(who) ?? '',
      note: verdict ? count : null,
      mark: markOf(o),
      accent: outcomeAccentOf(o),
      subject: who,
    }
  }

  const eventArticle = (o: Outcome): Article | null => {
    let headline: string
    switch (o.type) {
      // A bank each, picked by the night (and the seat, where one is named),
      // so the Arsonist's third fire is not headlined like the first.
      case 'silenced': headline = pick(p.event.silenced, o.night + o.target)?.(name(o.target)) ?? ''; break
      case 'extraVote': headline = pick(p.event.extraVote, o.night + o.target)?.(name(o.target)) ?? ''; break
      case 'growl': headline = pick(p.event.growl, o.night) ?? ''; break
      case 'cardTaken': headline = pick(p.event.cardTaken, o.night)?.(t.roles[o.role].name) ?? ''; break
      // The breadcrumb: the engine's line, nameless by construction, under a
      // headline that says only that somebody talked.
      case 'clue': headline = pick(p.event.clue, o.night) ?? ''; break
      default: return null
    }
    const dek = renderOutcome(o, src.players, locale)
    if (dek === null) return null
    const named = o.type === 'silenced' || o.type === 'extraVote' ? name(o.target) : null
    return {
      kind: o.type === 'clue' ? 'clue' : 'event',
      who: named,
      eyebrow: o.type === 'clue' ? p.kicker.clue : p.kicker.event,
      headline,
      dek,
      note: null,
      mark: markOf(o),
      accent: outcomeAccentOf(o),
      subject: null,
    }
  }

  // Each investigation runs once: the edition after the death, not every
  // edition the dead stay dead.
  const diedOn = (id: PlayerId): number | null => log.find((o) => isDeath(o) && o.target === id)?.night ?? null
  const investigated = src.revealed.filter((r) => diedOn(r.id) === src.day - 1)

  const articles: Article[] = []
  for (const o of night) if (isDeath(o)) articles.push(deathArticle(o))
  for (const o of daytime) if (isDeath(o)) articles.push(deathArticle(o))
  for (const o of todays) {
    if (o.type === 'clue') continue
    const article = eventArticle(o)
    if (article) articles.push(article)
  }
  for (const r of investigated) {
    const options = p.investigation[r.roleId]
    const line = options[(r.id * 3 + src.day) % options.length]
    if (!line) continue
    const trade = r.trade === null ? null : t.tradesNamed[r.trade]
    const card = p.cardOn(name(r.id), t.roles[r.roleId].name)
    articles.push({
      kind: 'investigation',
      eyebrow: p.kicker.investigation,
      headline: line(name(r.id)),
      dek: trade ? `${card} ${p.tradeLine(trade)}` : card,
      note: p.side[ROLES[r.roleId].team],
      mark: sigilMarkup(r.roleId),
      accent: accentOf(r.roleId),
      subject: null,
      who: name(r.id),
    })
  }
  for (const o of todays) {
    if (o.type !== 'clue') continue
    const article = eventArticle(o)
    if (article) articles.push(article)
  }

  // A morning with no news at all leads on the fact that there is none, and
  // not on a council notice about a bridge toll. The dawn reading already
  // opens this way; the page did not, so the front of a quiet edition was
  // whichever colour piece came up and the one thing the town wanted confirmed
  // appeared nowhere on it. The dek is the very line the town was read at
  // dawn, so the page and the reading agree.
  //
  // `newsOn` and not "no death article": a day that names a dead player in an
  // investigation has news, and leading it with "everybody woke up" would push
  // the page's actual story off the top.
  if (!newsOn(log, src.day)) {
    articles.unshift({
      kind: 'event',
      eyebrow: p.kicker.event,
      headline: p.allWell[(src.day - 1) % p.allWell.length] ?? p.allWell[0] ?? '',
      dek: t.phase.quietNight,
      note: null,
      mark: null,
      accent: null,
      subject: null,
    })
  }

  // Colour: the n-th piece of the game, counting what earlier days used.
  let before = 0
  for (let d = 1; d < src.day; d++) before += colourWanted(log, d)
  const wanted = articles.length === 0 ? Math.max(1, colourCount(src.day)) : colourCount(src.day)
  for (let k = 0; k < wanted; k++) {
    const piece = p.colour[colourIndex(before + k, p.colour.length)]
    if (piece) {
      articles.push({
        kind: 'colour', eyebrow: p.kicker.colour, headline: piece.headline, dek: piece.dek, note: null,
        mark: null, accent: null, subject: null,
      })
    }
  }

  const [lead = null, ...rest] = articles
  const roll = src.players.every((seat) => typeof seat.alive === 'boolean')
    ? src.players.map(
        (seat): Standing => ({
          name: seat.name,
          alive: seat.alive === true,
          asking: seat.hasQuestion === true,
        }),
      )
    : null
  return { masthead: t.ui.paper.masthead, dateline: p.daily(src.day), day: src.day, lead, rest, roll }
}

/** The edition of a day, from the narrator's own state. */
export const edition = (state: GameState, day: number, locale: Locale): Edition =>
  editionOf(
    {
      day,
      players: state.players,
      log: state.log.filter((o) => o.public),
      revealed: revealedBy(state),
    },
    locale,
  )

// ---------------------------------------------------------------------------
// The page
// ---------------------------------------------------------------------------

/**
 * The body copy of a page that is mocked up rather than written.
 *
 * It was four hairlines at 94%, 98% and 58% of the column, evenly spaced —
 * which at a phone's size reads as body text and, blown up onto a wall,
 * reads as three loading bars under every headline. A printed page is
 * mostly type: the grey mass of it is what tells a room across the sofa
 * that it is looking at a newspaper before it has read a word.
 *
 * So the greek is set like type instead: a long run of short rules with a
 * ragged right, broken into paragraphs — a shorter line where one ends and
 * an indent where the next begins — and the block is allowed to stretch,
 * which is what lets a column fill the frame at three stories or at ten
 * without the page inventing copy the engine never wrote. Never lorem
 * ipsum: it says nothing, in no language, and cannot be mistaken for a
 * clue.
 *
 * The widths are a fixed table walked from a per-article offset, so the
 * same edition sets the same page every time it is painted.
 */
const GREEK: readonly number[] = [
  0.97, 0.84, 1, 0.91, 0.58,
  0.93, 1, 0.8, 0.96, 0.44,
  0.88, 0.99, 0.82, 1, 0.67,
  0.95, 0.79, 1, 0.9, 0.39,
  1, 0.86, 0.94, 0.81, 0.62,
]

/**
 * How a line breaks into words.
 *
 * A line was one rule running the whole measure, and a critic watching a
 * 1920x1080 screen from a sofa named it straight away: nothing a press has
 * ever produced is an unbroken horizontal rule five hundred pixels long,
 * forty times in a row. That is a lined pad, or a ledger, or a row of
 * loading bars — and it was two thirds of the page. What makes a block of
 * type read as type is the gaps: words.
 *
 * So a line is set as words off a fixed table, walked from the line's own
 * position, cut to the line's width. Fixed, not drawn, so the same edition
 * sets the same page every time it is painted.
 */
const WORDS: readonly number[] = [
  0.09, 0.05, 0.13, 0.07, 0.16, 0.04, 0.11, 0.06, 0.19, 0.08,
  0.12, 0.05, 0.15, 0.1, 0.06, 0.21, 0.07, 0.14, 0.05, 0.17,
  0.08, 0.11, 0.06, 0.13, 0.09, 0.18, 0.05, 0.1, 0.15, 0.07,
  0.2, 0.06, 0.12, 0.04, 0.16, 0.09, 0.07, 0.14, 0.05, 0.11,
  0.08, 0.17, 0.06, 0.1, 0.13, 0.05, 0.22,
]

/** The gap between two words, as a share of the measure. */
const SPACE = 0.022

/**
 * How long a paragraph runs.
 *
 * Every paragraph in the page used to be exactly five lines, because the
 * rule was `i % 5`. At a glance that is invisible; held on a wall for the
 * length of an argument it is the last artefact left in the greek — the
 * eye finds periodic structure before it finds anything else, and the
 * beat ran in parallel down every column at once: indent, four lines,
 * short line, six times over. Real paragraphs run two to nine lines with
 * no period at all.
 *
 * A fixed table walked by a step coprime with it, the same way the word
 * widths are: no randomness, the same page every paint, and no beat.
 */
const PARAGRAPHS: readonly number[] = [3, 6, 4, 8, 5, 3, 7, 4, 6, 2, 5, 9]
const PARAGRAPH_STEP = 5

/**
 * How many lines every block carries. A television gives the lead half a
 * metre of column and a busy day's fourth story two centimetres, and the
 * block is clipped to whatever its column can hold — so this is the tallest
 * a column could ever be, not the number anybody sees.
 */
const GREEK_LINES = 44

const lineMarkup = (seed: number, i: number, ends: boolean, opens: boolean): string => {
  const width = GREEK[(i + seed * 7) % GREEK.length] ?? 1
  const measure = ends ? Math.min(width, 0.66) : width
  const indent = opens ? 0.06 : 0

  const words: string[] = []
  let at = indent
  // Thirteen and forty-seven are coprime, so consecutive lines start a
  // long way apart in the table and the pattern does not come back into
  // step for a whole column. Stepping by three through thirty put the same
  // word lengths under each other every few lines and opened rivers down
  // the type — which real setting has and this kind of setting should not
  // advertise.
  let w = (i * 13 + seed * 29) % WORDS.length
  while (at < measure) {
    const word = Math.min(WORDS[w % WORDS.length] ?? 0.1, measure - at)
    if (word < 0.03) break
    words.push(`<i class="paper__scribble" style="--w: ${word.toFixed(3)}"></i>`)
    at += word + SPACE
    w++
  }
  return `<span class="paper__line" style="--x: ${indent}">${words.join('')}</span>`
}

const greekMarkup = (seed: number, lines = GREEK_LINES): string => {
  // Where the paragraphs fall in this block, before any line is set.
  const ends = new Set<number>()
  const opens = new Set<number>()
  let at = 0
  let p = seed * PARAGRAPH_STEP
  while (at < lines) {
    const run = PARAGRAPHS[p % PARAGRAPHS.length] ?? 4
    at += run
    if (at - 1 < lines) ends.add(at - 1)
    if (at < lines) opens.add(at)
    p += PARAGRAPH_STEP
  }
  const out: string[] = []
  for (let i = 0; i < lines; i++) out.push(lineMarkup(seed, i, ends.has(i), opens.has(i)))
  return `<span class="paper__scribbles" aria-hidden="true">${out.join('')}</span>`
}

/** The headline with the dead struck through, as the report strikes a killing's name. */
const headlineMarkup = (a: Article): string => {
  const text = esc(a.headline)
  if (a.subject === null) return text
  const struck = `<s class="paper__struck">${esc(a.subject)}</s>`
  return text.split(esc(a.subject)).join(struck)
}

const noteMarkup = (a: Article): string => {
  if (a.note === null) return ''
  if (a.kind === 'investigation') {
    return `<p class="paper__note paper__note--side" data-side="${a.accent === 'crew' ? 'crew' : 'town'}">${esc(a.note)}</p>`
  }
  if (a.kind === 'verdict') return `<p class="paper__note paper__note--count">${esc(a.note)}</p>`
  return `<p class="paper__note">${esc(a.note)}</p>`
}

/**
 * The lead's cut.
 *
 * A front page has a picture on it, and this one has never had anything to
 * put there — the engine writes no images and the room may see no face.
 * What it does have is the mark the rest of the app already puts beside
 * this very outcome: the sigil of the role that caused it. Blown up inside
 * a ruled box with the name under it, that is an engraving, which is what a
 * paper of this vintage would have printed anyway.
 *
 * It leaks nothing: the mark is on the article either way, and the caption
 * is the name already struck through in the headline above it. Only the
 * lead gets one, only when it has both, and only where there is a wall to
 * put it on — the phone's page hides it, the way it hides the columns.
 */
const cutMarkup = (a: Article): string => {
  const who = a.who === undefined ? a.subject : a.who
  if (a.mark === null || who === null) return ''
  return `
    <figure class="paper__cut" aria-hidden="true">
      <span class="paper__engraving">${a.mark}</span>
      <figcaption class="paper__caption">${esc(who)}</figcaption>
    </figure>`
}

/**
 * One story. `tier` is how loudly it is set: 1 is the lead, 2 the story
 * that follows it at the top of the first column, 3 everything else. It is
 * not decoration — a front page ranks its news by the size of the type, and
 * the rank here is the page order the edition was built in, which is the
 * order the town cares about.
 */
const articleMarkup = (a: Article, i: number, tier = 3, said = false): string => `
  <article class="paper__article" data-kind="${a.kind}" data-tier="${tier}"${a.accent ? ` data-accent="${a.accent}"` : ''} style="--i: ${i}; --chars: ${Math.max(
    1,
    a.headline.length,
  )}">
    <header class="paper__head">
      ${a.mark ? `<span class="mark paper__mark" aria-hidden="true">${a.mark}</span>` : ''}
      <div class="paper__title">
        ${a.eyebrow ? `<p class="paper__eyebrow"${said ? ' data-said' : ''}>${esc(a.eyebrow)}</p>` : ''}
        <h3 class="paper__headline">${headlineMarkup(a)}</h3>
      </div>
    </header>
    ${tier === 1 ? cutMarkup(a) : ''}
    <div class="paper__body">
      <p class="paper__dek">${esc(a.dek)}</p>
      ${noteMarkup(a)}
      ${greekMarkup(i, tier === 1 ? GREEK_LINES * 2 : GREEK_LINES)}
    </div>
  </article>`

/** What sits either side of the nameplate: the price, and the day's number. */
export interface Flanks {
  left: string
  right: string
}

/**
 * The masthead. A `short` dateline is the same line with the player count
 * dropped: the full one broke onto two lines under 390px, which on a
 * newspaper reads as a page that did not fit rather than as a design.
 *
 * `flanks` are the mono lines either side of the name — the price and the
 * edition's number, which is the oldest thing on a newspaper's front and
 * the cheapest way to say "printed" rather than "card with a title". They
 * are hidden on a phone, where the nameplate has no room for them; the
 * right-hand one is also the only slot on the page a live thing could sit
 * in, if the room ever keeps the page up while a clock runs.
 */
const mastheadMarkup = (
  name: string,
  dateline: string,
  short: string | null = null,
  flanks: Flanks | null = null,
  /** The right flank is already markup, not a string to escape. */
  rightIsMarkup = false,
  /** The one live thing on the sheet, hung off the end of the dateline. */
  ear = '',
): string => `
  <header class="paper__masthead">
    <p class="paper__nameplate">
      <span class="paper__side paper__side--left">
        <span class="paper__flank paper__flank--left">${flanks ? esc(flanks.left) : ''}</span>
        <span class="paper__rule"></span>
      </span>
      <span class="paper__name">${esc(name)}</span>
      <span class="paper__side paper__side--right">
        <span class="paper__rule"></span>
        <span class="paper__flank paper__flank--right">${flanks ? (rightIsMarkup ? flanks.right : esc(flanks.right)) : ''}</span>
      </span>
    </p>
    <p class="paper__edition">
      <span class="paper__side paper__side--left"><span class="paper__rule"></span></span>
      <span class="paper__dateline">${
        short === null
          ? esc(dateline)
          : `<span class="paper__edition-long">${esc(dateline)}</span><span class="paper__edition-short">${esc(short)}</span>`
      }</span>
      <span class="paper__side paper__side--right"><span class="paper__rule"></span>${ear}</span>
    </p>
  </header>`

/**
 * How a page of `rest` follow-ups is set: how many columns the sheet is
 * ruled into, and how many of them the lead takes.
 *
 * This is the whole answer to the thing that made the page look unfinished
 * on a wall. The engine's output swings by a factor of four — a quiet
 * morning is one story and a colour piece; a bad one is three deaths, a
 * verdict, two investigations and a breadcrumb — and a page set to one
 * shape for both has to look wrong for one of them. It was set for the
 * busy end, so a quiet day ran one 1440px column of 83-character lines
 * with 274px of blank newsprint under it.
 *
 * A real front page answers this by re-ruling: fewer stories, fewer and
 * wider columns, and a lead given the room the others are not using. The
 * lead always takes two, because a lead that is one column wide is not a
 * lead.
 */
export interface Plan {
  /** Columns the whole page is ruled into. */
  cols: number
  /** How many of them the lead spans. */
  lead: number
}

/**
 * How much bigger the news is set when there is less of it.
 *
 * Re-ruling the sheet answers half the question: fewer stories, fewer and
 * wider columns. The other half is that a real front page shouts louder on
 * a thin day — one story at ninety points, not three at thirty with the
 * rest of the sheet given over to body copy. This is the multiplier on the
 * headlines and the deks, and only on those: the type block behind them
 * keeps its reading size, so the share of the page that is actually news
 * goes up rather than everything growing together.
 */
const air = (rest: number): number => (rest <= 1 ? 1.25 : rest <= 2 ? 1.16 : rest <= 4 ? 1.08 : 1)

export const planFor = (rest: number, tracks = 5): Plan => {
  if (rest === 0) return { cols: 1, lead: 1 }
  if (rest <= 2) return { cols: 3, lead: 2 }
  if (rest <= 4) return { cols: Math.min(4, tracks), lead: 2 }
  return { cols: Math.min(5, tracks), lead: 2 }
}

/**
 * How many columns a sheet this wide can honestly be ruled into.
 *
 * Five columns need sixteen hundred pixels. The plan used to come from the
 * story count alone, so a busy morning on a 1024px frame was ruled into
 * five columns of 176px beside the register — twenty-two characters of
 * dek, where a newspaper column is thirty-five to forty-five — and the
 * lead, two of those columns wide with a plate in it, broke its own
 * headline mid-word: THE / FAMILY' / S / REGARD / S. A 720p television
 * got the same page. A sheet under sixteen hundred is ruled into four at
 * most, which at 1280 is a 234px column, and under twelve hundred the
 * stylesheet sets it as a tabloid and does not read the count at all.
 *
 * Mirrored in `styles.css` ("The paper on a tablet") the way `fitTables`
 * mirrors the seat algebra: the frame decides, and the page is re-set when
 * the frame crosses the line.
 */
export const tracksFor = (width: number): number => (width >= 1600 ? 5 : 4)

const sheetTracks = (): number => (typeof window === 'undefined' ? 5 : tracksFor(window.innerWidth))

/**
 * The follow-ups dealt into `k` columns, in reading order: down the first,
 * then down the second, the way a page is read and the way this game's
 * record runs — night 2 above night 3, never beside it.
 *
 * Balanced by count rather than by height, because height is not knowable
 * here and a column that is one story short of its neighbour is what a
 * newspaper looks like anyway. The earlier columns take the extra, so the
 * news is heaviest on the left.
 */
export const columnsOf = <T>(items: readonly T[], k: number): T[][] => {
  const width = Math.max(1, k)
  const cols: T[][] = Array.from({ length: width }, () => [])
  if (items.length === 0) return cols
  // Each column takes the floor, and the leftover goes one apiece to the
  // ones on the left, so the news is heaviest where the page is read
  // first. Filling each column to the ceiling before starting the next
  // dealt seven stories as three, three and one — two crowded columns
  // beside one holding a single item and a metre of type block.
  const base = Math.floor(items.length / width)
  const extra = items.length % width
  let at = 0
  let room = base + (extra > 0 ? 1 : 0)
  for (const item of items) {
    while (room === 0 && at < width - 1) {
      at++
      room = base + (at < extra ? 1 : 0)
    }
    cols[at]?.push(item)
    room--
  }
  return cols
}

/**
 * Whether the page's last story runs across the foot of the columns
 * instead of down one of them.
 *
 * Nothing on a morning edition crossed a gutter except the nameplate:
 * every column started under the dateline and ended at the foot, five
 * mornings running, which a room reads as a template rather than as an
 * edited page. A front page has one horizontal cut in it, and one is
 * enough — so once there is enough news to spare a story, the last one
 * (the colour piece, by the order the edition is built in) runs two or
 * three columns wide across the bottom with the columns above it stopping
 * on a rule.
 */
const FOOT_FROM = 4

const pageMarkup = (
  lead: Article | null,
  rest: readonly Article[],
  plan = planFor(rest.length),
  roll?: string,
): string => {
  // A lead as wide as the page has no room beside it, so the columns fall
  // to the row underneath: that is the final edition, which runs in half
  // the sheet with "who was who" alongside.
  const stack = plan.lead >= plan.cols
  const foot = !stack && rest.length >= FOOT_FROM ? rest[rest.length - 1] : undefined
  const down = foot === undefined ? rest : rest.slice(0, -1)
  const body = columnsOf(down, stack ? plan.cols : plan.cols - plan.lead).filter((c) => c.length > 0)
  let n = 0
  // A label over every headline made a column read NOTICES over NOTICES,
  // which is a template repeating itself rather than an edited page. The
  // label says what KIND of thing follows, so it only has to say it when
  // the kind changes — counted down the whole page, not down each column,
  // because a phone sets the same articles in one flow. A repeat is still
  // in the markup, marked `data-said`: the phone hides it, and a sheet
  // shows it again at the top of a column, because a column whose first
  // story has no kicker starts its headline a line above its neighbours'
  // and the whole deck reads as mis-set.
  let said: string | null = null
  return `
    <div class="paper__page"${stack ? ' data-stack' : ''}${foot ? ' data-foot' : ''}${roll ? ' data-roll' : ''} style="--cols: ${plan.cols}; --lead: ${plan.lead}; --foot-from: ${plan.lead + 1}; --air: ${air(rest.length)}">
      ${lead ? `<div class="paper__lead">${articleMarkup(lead, 0, 1)}</div>` : ''}
      ${
        rest.length > 0
          ? `<div class="paper__columns"${rest.length >= 3 ? ' data-many' : ''}>${body
              .map(
                (col) =>
                  `<div class="paper__col">${col
                    .map((a) => {
                      n++
                      const same = said !== null && said === a.eyebrow
                      said = a.eyebrow
                      return articleMarkup(a, n, n === 1 ? 2 : 3, same)
                    })
                    .join('')}</div>`,
              )
              .join('')}</div>`
          : ''
      }
      ${
        foot === undefined
          ? ''
          : `<div class="paper__foot">${articleMarkup(foot, n + 1, 3, said !== null && said === foot.eyebrow)}</div>`
      }
      ${roll ?? ''}
    </div>`
}

/**
 * The town, down the side of the page.
 *
 * Seating order, so it reads against the ring the room was looking at a
 * minute ago; the dead struck the way they are struck everywhere else on
 * this paper; a mono question mark on anyone who has asked about their
 * card, which the day table already flags. Printed on a wall only — a
 * phone has the ring behind the page and no width to spare.
 */
const rollMarkup = (roll: readonly Standing[], locale: Locale): string => {
  const t = strings(locale)
  return `
    <aside class="paper__roll">
      <h3 class="paper__label">${esc(t.ui.paper.roll)}</h3>
      <ol class="paper__standing" style="--seats: ${roll.length}">
        ${roll
          .map(
            (seat) => `
          <li class="paper__seat"${seat.alive ? '' : ' data-dead'}>
            <span class="paper__seat-name">${
              seat.alive ? esc(seat.name) : `<s class="paper__struck">${esc(seat.name)}</s>`
            }</span>
            ${seat.asking ? `<span class="paper__asking" aria-hidden="true">?</span>` : ''}
          </li>`,
          )
          .join('')}
      </ol>
    </aside>`
}

/**
 * A morning edition as the page.
 *
 * `clock` is the discussion timer, and it is the only live thing on the
 * sheet. The room used to watch it count down under the seating ring, and
 * the ring is not on the wall while the page is — so the page carries it,
 * in the one slot on a broadsheet front where a live thing has ever sat:
 * the right-hand end of the nameplate's own line, where the edition
 * number goes when there is nothing better there. It is a dateline's
 * cousin and it reads as one.
 */
export const editionMarkup = (e: Edition, locale: Locale, clock: TimerView | null = null): string => {
  const t = strings(locale)
  const ct = t.ui.timer
  // The same word the day screen is showing, so the two never disagree.
  const said =
    clock === null
      ? null
      : clock.phase === 'done'
        ? ct.timeUp
        : clock.phase === 'paused'
          ? ct.paused
          : ct.label
  // Hung off the end of the dateline's rule, not off the nameplate's.
  // In the nameplate's ear it evicted the edition number — so the twelve
  // pages a room stares at lost the one piece of furniture that says this
  // is a numbered edition, while the ending, which nobody argues over,
  // kept it. The dateline is the line that already describes this edition
  // at this moment, which is exactly what a clock is.
  const ear =
    clock === null || said === null
      ? ''
      : `<span class="paper__clock" data-phase="${clock.phase}"><span class="paper__clock-said">${esc(said)}</span><span class="paper__clock-digits" data-timer-digits>${esc(formatClock(clock.seconds))}</span></span>`
  return `
    <article class="paper paper--daily" data-paper data-edition="${e.day}" aria-label="${esc(t.ui.paper.title)}">
      ${mastheadMarkup(e.masthead, e.dateline, null, { left: t.ui.paper.price, right: t.ui.paper.number(e.day) }, false, ear)}
      ${pageMarkup(e.lead, e.rest, planFor(e.rest.length, sheetTracks()), e.roll === null ? undefined : rollMarkup(e.roll, locale))}
    </article>
  `
}

/**
 * Make the page fit the frame it is on, and say so when it cannot.
 *
 * On every sheet, not only the television's: the narrator's own copy is one
 * from a tablet's width up (`styles.css`, "The paper on a sheet"), and it
 * is what a table with no television looks at. A television has no scrollbar and nobody within reach of it, so a page
 * that runs past the bottom edge has not been pushed down, it has been
 * thrown away. The final edition was doing exactly that — a whole story
 * and its dek entirely below the frame — and `scrollHeight === clientHeight`
 * reported nothing wrong, because the clipping happened two boxes further
 * out. A layout that can lose a story quietly is worse than one that
 * obviously does not fit.
 *
 * The broadsheet cannot lose one to VOLUME: the greek under each story
 * takes up the slack, so a column fills whether it holds two stories or
 * five. What it can still be beaten by is LENGTH — a Spanish headline at
 * a twelve-seat table, a short frame, a name nobody expected — and that is
 * what this is for. It steps the type down until the real news fits, and
 * if it runs out of steps it marks the page `data-fit-over` and says so
 * once, rather than printing a tidy page with the end missing.
 *
 * Measured per column, not per page: each column hides its own overflow so
 * that the greek can stop at the foot of it, which means the sheet's own
 * `scrollHeight` is exactly the number that lied last time.
 *
 * Cached on what actually decides the layout — the frame, the edition, how
 * many stories and how many characters — because the room's screen repaints
 * on every one of the narrator's paints, and this forces a reflow.
 */
const FIT_STEPS = [1, 0.92, 0.85, 0.78, 0.7] as const

/**
 * What the last measurement decided, and for which page.
 *
 * A television repaints whenever the narrator's phone does — which,
 * once the room can keep the edition on the wall while the day is run
 * underneath it, is for the length of an argument. Every reading below
 * forces a layout, so they are taken once per page and replayed on every
 * paint after it: the key carries everything that decides the answer, so
 * the same key is the same page and the same answer.
 */
let fitKey = ''
let fitStep = 0
let fitFill: string | null = null
let fitThin: number[] = []
let fitBeaten = false
let fitWarned = ''
let fitName = 0
let fitEars = false

/** The nameplate's ladder: the name steps down until it clears its ears. */
const NAME_STEPS = [1, 0.9, 0.8, 0.72, 0.64] as const

export const fitPaper = (root: ParentNode): void => {
  // A sheet is a paper that fills its frame and does not scroll, and the
  // stylesheet decides which papers are: the television's, always, and the
  // morning edition on any frame from a tablet up. It is read off the box
  // rather than off a class or a media query mirrored here, so this and
  // the stylesheet cannot disagree about which page is being measured. A
  // page that scrolls is the phone's and has a hand on it; measuring it
  // would find real type below the fold and shrink the page to fit a
  // frame it was never asked to fit.
  const paper = root.querySelector<HTMLElement>('.paper')
  const plate = paper?.querySelector<HTMLElement>('.paper__nameplate') ?? null
  if (!paper || getComputedStyle(paper).overflowY !== 'hidden') {
    fitKey = ''
    // A frame that has just stopped being a sheet keeps nothing the last
    // measurement left on it.
    if (paper) {
      paper.style.removeProperty('--paper-fit')
      paper.style.removeProperty('--name-fit')
      paper.removeAttribute('data-fit-over')
      plate?.removeAttribute('data-no-ears')
      for (const block of paper.querySelectorAll('.paper__scribbles')) block.removeAttribute('data-thin')
    }
    return
  }

  const blocks = (): HTMLElement[] => [...paper.querySelectorAll<HTMLElement>('.paper__scribbles')]
  const head = paper.querySelector<HTMLElement>('.paper__lead .paper__headline')

  const key = [
    window.innerWidth,
    window.innerHeight,
    paper.dataset['edition'] ?? 'final',
    paper.querySelectorAll('.paper__article').length,
    (paper.textContent ?? '').length,
    document.documentElement.lang,
    // A page measured before its own faces have arrived is measured in the
    // fallback's metrics, which are wider and taller — and the answer would
    // then be cached against a key that never changes again, so the room
    // would read an evening at the smallest step for no reason. This is the
    // trap the stylesheet's own note calls "a region measured mid-paint
    // keeps a lie all morning", and the fonts are the version of it that
    // fires on the very first page.
    typeof document.fonts === 'undefined' ? 'nofonts' : document.fonts.status,
  ].join('/')

  if (key === fitKey) {
    // Same page, same answers. Nothing here reads a layout.
    paper.style.setProperty('--paper-fit', String(FIT_STEPS[fitStep]))
    paper.style.setProperty('--name-fit', String(NAME_STEPS[fitName]))
    if (fitEars) plate?.setAttribute('data-no-ears', '')
    else plate?.removeAttribute('data-no-ears')
    if (head !== null) {
      if (fitFill === null) head.style.removeProperty('--fill')
      else head.style.setProperty('--fill', fitFill)
    }
    const all = blocks()
    for (const [at, block] of all.entries()) {
      if (fitThin.includes(at)) block.setAttribute('data-thin', '')
      else block.removeAttribute('data-thin')
    }
    if (fitBeaten) paper.setAttribute('data-fit-over', '')
    else paper.removeAttribute('data-fit-over')
    return
  }

  /**
   * Whether any real type on the page is cut off.
   *
   * Three readings before this one, each wrong in the direction that costs
   * the room the page.
   *
   * `scrollHeight` on its own counts a box's scrollable overflow, and every
   * article carries the `line-in` entrance — a `translateY(4px)` held by
   * `animation-fill-mode: both` until its stagger delay runs out. A
   * transformed box counts towards that overflow, so the first paint always
   * read four pixels too tall, at every step of the ladder, and the answer
   * was cached against a key that never changes again: the room read a
   * whole evening at the smallest type on a page that fit at full size. So
   * the entrance is held off for the length of the measurement, the way
   * `fitTables` holds a seat's transition.
   *
   * Summing the children's `offsetHeight` dodged the transform and was
   * wrong about the lead, which is a grid — the words, the plate beside
   * them and the type block under both are not a column of boxes.
   *
   * And asking the boxes at all was the wrong question. The lead's body
   * hides its own overflow, because the type block behind the copy is
   * *meant* to stop at the foot of the column — so a dek clipped inside it
   * was invisible to every ancestor's `scrollHeight`, and the page reported
   * that it fit while two thirds of a sentence was gone. Measured on a
   * twelve-seat Spanish ending: `--paper-fit: 0.78`, no box overflowing,
   * and 66% of the lead's dek cut.
   *
   * So the question is the one that matters: is any run of real type not
   * entirely inside every box that clips it, and inside the frame. The
   * greek is not asked, because the greek is supposed to be cut.
   */
  /**
   * Every run of real type on the page, and the list has to be complete
   * or the pass is blind to whatever is missing from it. The roll was:
   * measured on an 1100x620 window, `--paper-fit` sat at 1 and reported
   * the page fitting while Lucía and Max were cut off the foot of the
   * register — which is the one thing on the sheet that is worse missing
   * than absent, because a roll that omits two players is a roll the room
   * will believe.
   */
  const INK =
    '.paper__headline, .paper__dek, .paper__note, .paper__eyebrow, .paper__caption,' +
    '.paper__who, .paper__role, .paper__banner, .paper__label, .paper__entry, .paper__name,' +
    '.paper__seat-name, .paper__asking,' +
    // The masthead, for the same reason the register is here: a list that
    // leaves something out is blind to exactly that thing, and the page
    // has no other way to notice.
    '.paper__flank, .paper__dateline, .paper__clock-said, .paper__clock-digits'

  const cut = (el: HTMLElement): boolean => {
    const box = el.getBoundingClientRect()
    if (box.width === 0 || box.height === 0) return false
    let top = box.top
    let bottom = box.bottom
    let left = box.left
    let right = box.right
    for (let up = el.parentElement; up !== null; up = up.parentElement) {
      const style = getComputedStyle(up)
      if (style.overflowY === 'visible' && style.overflowX === 'visible') continue
      const clip = up.getBoundingClientRect()
      top = Math.max(top, clip.top)
      bottom = Math.min(bottom, clip.bottom)
      left = Math.max(left, clip.left)
      right = Math.min(right, clip.right)
    }
    top = Math.max(top, 0)
    bottom = Math.min(bottom, window.innerHeight)
    left = Math.max(left, 0)
    right = Math.min(right, window.innerWidth)
    // Edges, with a pixel of slack on each, rather than a share of the
    // area. Area against a two-square-pixel tolerance is no tolerance at
    // all for a run of type two hundred pixels wide: a column track that
    // lands on 226.391px clips a dek by a twentieth of a pixel and loses
    // ten square pixels, which read as "cut" and would have had the page
    // shrink itself over nothing. A run is cut when an edge of it is
    // somewhere nobody can see, which is what the question was.
    const SLACK = 1
    return (
      box.top < top - SLACK ||
      box.bottom > bottom + SLACK ||
      box.left < left - SLACK ||
      box.right > right + SLACK
    )
  }

  /**
   * Whether the lead's dek has been broken across its two columns.
   *
   * The dek is the lead's first paragraph and it flows into column one,
   * with `break-inside: avoid` — which a browser honours only when the
   * paragraph is shorter than the column. On a tablet a fifteen-seat
   * Spanish dek was taller than the lead's body, so it broke anyway:
   * "...Para el" in column one and "pueblo, el estanquero." at the top of
   * column two, with nothing cut and nothing for the check above to find.
   * A dek whose lines do not share a left edge has been split, and a split
   * dek is a page that does not fit.
   */
  const split = (): boolean => {
    const dek = paper.querySelector<HTMLElement>('.paper__lead .paper__dek')
    if (dek === null) return false
    const range = document.createRange()
    range.selectNodeContents(dek)
    let least = Infinity
    let most = -Infinity
    for (const rect of range.getClientRects()) {
      if (rect.width === 0 || rect.height === 0) continue
      least = Math.min(least, rect.left)
      most = Math.max(most, rect.left)
    }
    return most - least > 8
  }

  const over = (): boolean => split() || [...paper.querySelectorAll<HTMLElement>(INK)].some(cut)

  fitKey = key
  paper.setAttribute('data-measuring', '')
  paper.style.setProperty('--paper-fit', '1')
  head?.style.removeProperty('--fill')
  for (const block of blocks()) block.removeAttribute('data-thin')

  /**
   * The nameplate and its ears.
   *
   * The name sits in an `auto` track between two `1fr` sides, so the
   * hairlines take the slack and the name never moves off the sheet's axis
   * — and so, when the name is wider than the sheet can spare, the sides
   * go to zero and the ears overflow them into the name. That is not a cut
   * the pass above can see: nothing clips a side, so a flank drawn under
   * THE FAMILY is entirely visible and entirely unreadable. Every frame
   * from 768 to 1280px on the narrator's own copy shipped like that,
   * PRICE 5¢ half under the name and NO. 1 clipped to NO. at the edge.
   *
   * So the name is asked directly whether it clears both ears, and stepped
   * down until it does. It is measured rather than computed from a
   * character count, because the ears are set in a different face and
   * another language is seventy pixels wider. If it will not clear them at
   * the last step, the ears go, the way a phone's do — a nameplate with
   * no price on it is a nameplate; one with the price under the name is a
   * misprint.
   */
  fitName = 0
  fitEars = false
  paper.style.setProperty('--name-fit', '1')
  plate?.removeAttribute('data-no-ears')
  const name = plate?.querySelector<HTMLElement>('.paper__name') ?? null
  if (plate !== null && name !== null) {
    const flanks = [...plate.querySelectorAll<HTMLElement>('.paper__flank')]
    const clash = (): boolean => {
      const n = name.getBoundingClientRect()
      if (n.width === 0) return false
      return flanks.some((flank) => {
        const box = flank.getBoundingClientRect()
        if (box.width === 0) return false
        const holder = flank.parentElement
        const side = holder?.getBoundingClientRect()
        // Into the name, or out of its own side — either way it is
        // somewhere the plate did not set it. The side's own overflow
        // counts too: its hairline has a minimum length, so a side that
        // cannot hold the ear AND a rule is a side the name is crowding.
        return (
          (box.right > n.left + 1 && box.left < n.right - 1) ||
          (side !== undefined && (box.left < side.left - 1 || box.right > side.right + 1)) ||
          (holder !== null && holder.scrollWidth > holder.clientWidth + 1)
        )
      })
    }
    for (let i = 0; i < NAME_STEPS.length; i++) {
      fitName = i
      paper.style.setProperty('--name-fit', String(NAME_STEPS[i]))
      if (!clash()) break
    }
    if (clash()) {
      fitEars = true
      plate.setAttribute('data-no-ears', '')
    }
  }

  /**
   * The lead's headline, sized off its own character count, corrected by
   * looking at what the count could not know.
   *
   * A count does not know the measure exists. Too big and the head clears
   * the line and lands on a rag — "A word from a neighbour" filled 61% and
   * 43% on two lines, doubling the void it was meant to close. Too small
   * and it simply sits in the middle of its box: the same head, stepped
   * down once, set on ONE line at 60% of the measure and stopped there,
   * because a loop that only steps down cannot see 60% on one line as a
   * failure. The quietest morning in the paper then had the smallest
   * display head in it, which tells a room the thinnest day matters least.
   *
   * So the guard runs both ways and picks its direction once: down while
   * the head runs long and ends short, up while it sits on one line and
   * leaves the measure open. That is what a sub does — the largest size
   * that still sets in an acceptable number of lines. Bounded at three,
   * and it stops the moment the two conditions would fight.
   */
  if (head !== null) {
    const range = document.createRange()
    // The first guess is the character count: a head of about thirty-four
    // sets at the base size, a short one is thrown high and a long one is
    // held back, with a floor so a long head still sets and a ceiling so a
    // two-word morning does not shout off the sheet. It is set here and
    // not in the stylesheet because the guard has to be able to read it
    // back, and a custom property holding a `clamp()` reads back as the
    // `clamp()`.
    const chars = Number(head.closest<HTMLElement>('.paper__article')?.style.getPropertyValue('--chars')) || 34
    let fill = Math.min(1.55, Math.max(0.85, 34 / chars))
    head.style.setProperty('--fill', String(fill))
    let going = 0
    for (let step = 0; step < 3; step++) {
      range.selectNodeContents(head)
      // One visual line can be several rects when the head carries a
      // struck name, so they are grouped by where they sit.
      const rows = new Map<number, { left: number; right: number }>()
      for (const rect of range.getClientRects()) {
        if (rect.width === 0) continue
        const at = Math.round(rect.top)
        const row = rows.get(at)
        if (row === undefined) rows.set(at, { left: rect.left, right: rect.right })
        else {
          row.left = Math.min(row.left, rect.left)
          row.right = Math.max(row.right, rect.right)
        }
      }
      const measure = head.clientWidth
      if (rows.size === 0 || measure === 0) break
      const inOrder = [...rows.entries()].sort((a, b) => a[0] - b[0])
      const last = inOrder[inOrder.length - 1]
      if (last === undefined) break
      const fills = (last[1].right - last[1].left) / measure
      const want = rows.size > 1 ? (fills < 0.5 ? -1 : 0) : fills < 0.8 ? 1 : 0
      // Settled, or caught between two steps it cannot both satisfy.
      if (want === 0 || (going !== 0 && want !== going)) break
      going = want
      const next = Math.min(2.4, Math.max(0.85, fill + want * 0.14))
      if (next === fill) break
      fill = next
      head.style.setProperty('--fill', String(fill))
    }
    fitFill = String(fill)
  } else {
    fitFill = null
  }

  /**
   * The type blocks that got too little to be blocks.
   *
   * A column shares its slack between the stories in it, so a column with
   * four short stories gives each of them one line of greek — and one line
   * is not a block of type, it is a rule stuck under the dek. Taking it
   * off gives its space back to the blocks that can use it.
   *
   * Marked one at a time and never cleared between rounds, because hiding
   * one feeds the rest: reading a height after setting the attribute
   * forces the layout, so each answer already knows what the last one gave
   * away. The first version cleared every mark at the top of each round
   * and simply re-derived the same answer twice.
   *
   * The leading is measured off a line rather than read from the custom
   * property: `--greek-leading` holds `round(calc(...))`, and an
   * unregistered custom property comes back from `getComputedStyle` as that
   * token stream and not as a length — so `parseFloat` returned NaN and the
   * whole rule did nothing at all, quietly.
   */
  const MIN_LINES = 3
  const all = blocks()
  const thin = (): void => {
    for (const block of all) block.removeAttribute('data-thin')
    for (let pass = 0; pass < 2; pass++) {
      let changed = false
      for (const block of all) {
        if (block.hasAttribute('data-thin')) continue
        const line = block.querySelector<HTMLElement>('.paper__line')
        if (!line) continue
        const leading = line.offsetHeight + parseFloat(getComputedStyle(line).marginBottom)
        if (!(leading > 0)) continue
        if (block.clientHeight < leading * MIN_LINES) {
          block.setAttribute('data-thin', '')
          changed = true
        }
      }
      if (!changed) break
    }
  }

  /**
   * The ladder, with the thin pass inside each step rather than after the
   * last one. Taking a type block off moves every story in its column —
   * the articles share the column by flex and may shrink below their own
   * content — so the page the room gets is not the page the step measured.
   * On a 1024x768 Spanish morning the ladder stopped at 0.85 with nothing
   * cut, the thin pass then hid two blocks, and a dek was clipped by its
   * column on a page that had just been passed. The answer a step gives is
   * only an answer for the page that step leaves behind, so it is asked
   * again after the blocks have been taken off.
   */
  fitStep = 0
  for (let i = 0; i < FIT_STEPS.length; i++) {
    fitStep = i
    paper.style.setProperty('--paper-fit', String(FIT_STEPS[i]))
    for (const block of all) block.removeAttribute('data-thin')
    if (over()) continue
    thin()
    if (!over()) break
  }
  fitThin = all.flatMap((block, at) => (block.hasAttribute('data-thin') ? [at] : []))

  fitBeaten = fitStep === FIT_STEPS.length - 1 && over()
  paper.removeAttribute('data-measuring')
  if (fitBeaten) paper.setAttribute('data-fit-over', '')
  else paper.removeAttribute('data-fit-over')
  // Once per page, not once per paint: the room's screen repaints whenever
  // the narrator's phone does.
  if (fitBeaten && fitWarned !== key) {
    fitWarned = key
    console.warn(`[paper] the page still does not fit at ${FIT_STEPS[FIT_STEPS.length - 1]}; a story is being cut`)
  }
}

/**
 * The edition as a full screen, with its own Done. The bar is not rendered
 * while it is up (`app.ts`): the phone may be facing the town. Without
 * `controls` it is what a TV shows while the phone shows the paper.
 */
export const dailyMarkup = (
  e: Edition,
  locale: Locale,
  controls = true,
  clock: TimerView | null = null,
): string => {
  const t = strings(locale)
  return `
    <section class="screen screen--paper" data-daily>
      ${editionMarkup(e, locale, clock)}
      ${controls ? `<div class="actions"><button class="btn btn--primary" type="button" data-paper-close>${esc(t.ui.common.done)}</button></div>` : ''}
    </section>
  `
}

// ---------------------------------------------------------------------------
// The final edition
// ---------------------------------------------------------------------------

export interface Story {
  night: number
  name: string
  cause: DeathCause
  /** The headline the death was set under, from the bank for its cause. */
  headline: string
  line: string
  crew: boolean
}

export interface Casting {
  name: string
  role: string
  crew: boolean
  alive: boolean
}

export interface Paper {
  masthead: string
  /** The night the game ended on: the nameplate's edition number. */
  night: number
  edition: string
  /** The edition line without the player count, for a phone under 390px. */
  editionShort: string
  banner: string
  stories: Story[]
  cast: Casting[]
  record: { title: string; lines: string[] }[]
}

/**
 * Everything the final edition is built from, shaped so a projection can carry
 * it (the same trick `EditionSource` plays for the morning). Every field is
 * public by the time this page exists: the deaths are the ones the town was
 * read at dawn, the cast is what the ring reveals beside it once the game is
 * over, and the record is the public log.
 */
export interface PaperSource {
  night: number
  players: readonly { id: PlayerId; name: string; alive: boolean; roleId: RoleId }[]
  /** Public outcomes; anything else in here is ignored. */
  log: readonly Outcome[]
  winner: Winner
}

export const paperOf = (state: GameState, locale: Locale): Paper =>
  paperFrom(
    {
      night: state.night,
      players: state.players.map((p) => ({ id: p.id, name: p.name, alive: p.alive, roleId: p.roleId })),
      log: state.log,
      winner: winner(state),
    },
    locale,
  )

export const paperFrom = (state: PaperSource, locale: Locale): Paper => {
  const t = strings(locale)
  const bank = t.ui.dawn.death
  const lines = deathLines(state.log, (cause) => bank[cause].length)
  const headlines = deathLines(state.log, (cause) => t.ui.paper.headline[cause].length)
  const isCrew = (roleId: RoleId): boolean => ROLES[roleId].team === 'crew'

  const stories: Story[] = state.log
    .filter((o): o is Death => o.type === 'death' && o.public)
    .map((o) => {
      const name = nameIn(state.players, o.target)
      const victim = state.players.find((p) => p.id === o.target)
      return {
        night: o.night,
        name,
        cause: o.cause,
        headline: t.ui.paper.headline[o.cause][headlines.get(o) ?? 0]?.(name) ?? '',
        line: bank[o.cause][lines.get(o) ?? 0]?.(name) ?? '',
        crew: victim ? isCrew(victim.roleId) : false,
      }
    })

  const cast: Casting[] = state.players.map((p) => ({
    name: p.name,
    role: t.roles[p.roleId].name,
    crew: isCrew(p.roleId),
    alive: p.alive,
  }))

  const nights = [...new Set(state.log.map((o) => o.night))].sort((a, b) => a - b)
  const record = nights.map((night) => ({
    title: t.ui.timeline.nightStart(night),
    lines: state.log
      .filter((o) => o.night === night && o.public)
      .map((o) => renderOutcome(o, state.players, locale))
      .filter((l): l is string => l !== null),
  }))

  return {
    masthead: t.ui.paper.masthead,
    night: state.night,
    edition: t.ui.paper.edition(state.night, state.players.length),
    editionShort: t.ui.paper.editionShort(state.night),
    // Nobody won: the narrator ended it early. The page used to fall back to
    // "Game over", which is also the screen's own title, so the same two
    // words sat above and below the masthead saying nothing.
    banner: renderWinner(state.winner, locale) ?? t.ui.over.endedOn(state.night),
    stories,
    cast,
    record,
  }
}

/** The front page as it appears on the game-over screen: the same paper, final edition. */
export const paperMarkup = (state: GameState, locale: Locale): string => paperPage(paperOf(state, locale), locale)

/** The same page, from a paper that has already been built (the room's own). */
export const paperPage = (paper: Paper, locale: Locale): string => {
  const t = strings(locale)
  const [lead = null, ...rest] = paper.stories.map((s): Article => {
    const cause: Outcome = { type: 'death', night: s.night, target: -1, cause: s.cause, public: true }
    return {
      kind: s.cause === 'lynch' ? 'verdict' : 'death',
      // An execution happened in daylight, in front of everybody. Filing it
      // under "Night 1" on a newspaper — the one artefact of this game that
      // leaves the room — reads as a paper that does not know its own dates.
      eyebrow: s.cause === 'lynch' ? t.ui.table.day(s.night) : t.ui.timeline.nightStart(s.night),
      headline: s.headline,
      dek: s.line,
      note: null,
      mark: markOf(cause),
      accent: outcomeAccentOf(cause),
      subject: s.name,
    }
  })
  const cast = paper.cast
    .map(
      (c) => `
        <li class="paper__casting"${c.crew ? ' data-crew' : ''}${c.alive ? '' : ' data-dead'}>
          <span class="paper__who">${esc(c.name)}</span>
          <span class="paper__role">${esc(c.role)}</span>
        </li>`,
    )
    .join('')
  const record = paper.record
    .map(
      (n) => `
        <dt class="paper__label">${esc(n.title)}</dt>
        ${
          n.lines.length > 0
            ? n.lines.map((l) => `<dd class="paper__entry">${esc(l)}</dd>`).join('')
            : `<dd class="paper__entry paper__entry--quiet">${esc(t.phase.quietNight)}</dd>`
        }`,
    )
    .join('')

  return `
    <article class="paper" data-paper aria-label="${esc(t.ui.paper.title)}">
      ${mastheadMarkup(paper.masthead, paper.edition, paper.editionShort, { left: t.ui.paper.price, right: t.ui.paper.number(paper.night) })}
      <h2 class="paper__banner">${esc(paper.banner)}</h2>
      ${
        // The last page runs in half the sheet, with who was who beside it,
        // so it is ruled for that: the lead across its own width and the
        // evening's deaths in columns under it. Three of them once the
        // evening has run long — a twelve-seat game in Spanish reached
        // nine deaths, which in two columns beat the fit pass all the way
        // to the bottom of its ladder and still cut a third off a dek.
        pageMarkup(lead, rest, rest.length >= 6 ? { cols: 3, lead: 3 } : { cols: 2, lead: 2 })
      }
      <section class="paper__section">
        <h3 class="paper__label">${esc(t.ui.paper.whoWasWho)}</h3>
        <ul class="paper__cast">${cast}</ul>
      </section>
      ${
        // A game ended on the first night has nothing to record yet, and the
        // heading with its rule and nothing under it read as a template with
        // the data missing.
        paper.record.length === 0
          ? ''
          : `<section class="paper__section">
        <h3 class="paper__label">${esc(t.ui.over.history)}</h3>
        <dl class="paper__record">${record}</dl>
      </section>`
      }
    </article>
  `
}

// ---------------------------------------------------------------------------
// The image
// ---------------------------------------------------------------------------

const WIDTH = 1080
const MARGIN = 72
const COLUMN = WIDTH - MARGIN * 2
/**
 * The page's inks. A canvas cannot read a token by name, so `resolveInks()`
 * asks the stylesheet for each one through a probe element before the
 * image is drawn and keeps these as the fallback for a document with no
 * styles (a test, a canvas that refuses modern colour syntax). The values
 * here are the tokens as they resolved when written; the tokens win.
 */
let NEWSPRINT = '#c7c3b4'
let MIDNIGHT = '#000029'
let VENDETTA = '#ff0f0f'
let MUTED = '#4f4f62'
let RULE = '#9c9a90'

const resolveInks = (ctx: CanvasRenderingContext2D): void => {
  const probe = document.createElement('span')
  probe.style.position = 'absolute'
  probe.style.visibility = 'hidden'
  document.body.append(probe)
  const ink = (token: string, fallback: string): string => {
    probe.style.color = `var(${token})`
    const value = getComputedStyle(probe).color
    // A colour the canvas cannot parse leaves fillStyle where it was.
    ctx.fillStyle = '#010203'
    ctx.fillStyle = value
    return ctx.fillStyle === '#010203' ? fallback : value
  }
  NEWSPRINT = ink('--newsprint', NEWSPRINT)
  MIDNIGHT = ink('--on-newsprint', MIDNIGHT)
  VENDETTA = ink('--lethal', VENDETTA)
  MUTED = ink('--on-newsprint-muted', MUTED)
  RULE = ink('--newsprint-rule', RULE)
  probe.remove()
}

const BEBAS = '"Bebas Neue", Impact, "Arial Narrow", sans-serif'
const PLEX = '"IBM Plex Sans", system-ui, sans-serif'
const MONO = '"IBM Plex Mono", ui-monospace, monospace'

/** Breaks text into lines that fit the width, on spaces. */
const wrap = (ctx: CanvasRenderingContext2D, text: string, width: number): string[] => {
  const words = text.split(/\s+/).filter((w) => w !== '')
  const lines: string[] = []
  let line = ''
  for (const word of words) {
    const next = line === '' ? word : `${line} ${word}`
    if (ctx.measureText(next).width > width && line !== '') {
      lines.push(line)
      line = word
    } else {
      line = next
    }
  }
  if (line !== '') lines.push(line)
  return lines
}

/**
 * Lays the page out top to bottom and returns its height. Dry, it only
 * measures; the second pass draws on a canvas cut to that height.
 */
const paint = (ctx: CanvasRenderingContext2D, paper: Paper, t: ReturnType<typeof strings>, dry: boolean): number => {
  let y = MARGIN
  const text = (
    value: string, font: string, size: number, colour: string,
    { align = 'left', x = MARGIN, tracking = 0 }: { align?: CanvasTextAlign; x?: number; tracking?: number } = {},
  ): void => {
    if (dry) return
    ctx.font = `${size}px ${font}`
    ctx.fillStyle = colour
    ctx.textAlign = align
    ctx.textBaseline = 'alphabetic'
    ctx.letterSpacing = `${tracking}px`
    ctx.fillText(value, x, y)
  }
  const measure = (font: string, size: number, tracking = 0): void => {
    ctx.font = `${size}px ${font}`
    ctx.letterSpacing = `${tracking}px`
  }
  const rule = (weight: number, colour: string): void => {
    if (!dry) {
      ctx.fillStyle = colour
      ctx.fillRect(MARGIN, y, COLUMN, weight)
    }
    y += weight
  }
  const paragraph = (
    value: string, font: string, size: number, colour: string, leading: number,
    opts: { align?: CanvasTextAlign; x?: number; width?: number; tracking?: number } = {},
  ): void => {
    measure(font, size, opts.tracking ?? 0)
    for (const line of wrap(ctx, value, opts.width ?? COLUMN)) {
      y += size
      text(line, font, size, colour, opts)
      y += leading - size
    }
  }

  // Masthead.
  y += 110
  text(paper.masthead.toUpperCase(), BEBAS, 132, MIDNIGHT, { align: 'center', x: WIDTH / 2, tracking: 6 })
  y += 28
  rule(3, MIDNIGHT)
  y += 10
  rule(1, MIDNIGHT)
  y += 36
  text(paper.edition.toUpperCase(), MONO, 22, MUTED, { align: 'center', x: WIDTH / 2, tracking: 3 })
  y += 56

  // Banner.
  paragraph(paper.banner.toUpperCase(), BEBAS, 96, MIDNIGHT, 92, { align: 'center', x: WIDTH / 2, tracking: 2 })
  y += 28
  rule(6, VENDETTA)
  y += 44

  // Headlines.
  for (const story of paper.stories) {
    y += 44
    text(`N${story.night}`, MONO, 22, MUTED)
    text(story.name.toUpperCase(), BEBAS, 52, MIDNIGHT, { x: MARGIN + 70, tracking: 1 })
    y += 14
    paragraph(story.line, PLEX, 28, MIDNIGHT, 38, { x: MARGIN + 70, width: COLUMN - 70 })
    y += 22
    rule(1, RULE)
  }
  if (paper.stories.length > 0) y += 40

  // Who was who: two columns.
  y += 22
  text(t.ui.paper.whoWasWho.toUpperCase(), MONO, 22, MUTED, { tracking: 3 })
  y += 16
  rule(1, MIDNIGHT)
  y += 12
  const half = Math.ceil(paper.cast.length / 2)
  const rowHeight = 60
  const top = y
  paper.cast.forEach((c, i) => {
    const col = i < half ? 0 : 1
    const x = MARGIN + col * (COLUMN / 2 + 24)
    y = top + (i % half) * rowHeight + 44
    if (!dry) {
      if (c.crew) {
        ctx.fillStyle = VENDETTA
        ctx.fillRect(x, y - 26, 22, 22)
      }
      ctx.font = `36px ${BEBAS}`
      ctx.letterSpacing = '1px'
      ctx.fillStyle = MIDNIGHT
      ctx.textAlign = 'left'
      ctx.fillText(c.name.toUpperCase(), x + 36, y)
      const width = ctx.measureText(c.name.toUpperCase()).width
      if (!c.alive) {
        ctx.fillStyle = VENDETTA
        ctx.fillRect(x + 32, y - 12, width + 8, 3)
      }
      ctx.font = `20px ${MONO}`
      ctx.letterSpacing = '0px'
      ctx.fillStyle = MUTED
      ctx.fillText(c.role.toUpperCase(), x + 36 + width + 16, y)
    }
  })
  y = top + half * rowHeight + 40

  // The record.
  y += 22
  text(t.ui.over.history.toUpperCase(), MONO, 22, MUTED, { tracking: 3 })
  y += 16
  rule(1, MIDNIGHT)
  for (const night of paper.record) {
    y += 40
    text(night.title.toUpperCase(), BEBAS, 34, MIDNIGHT, { tracking: 1 })
    y += 8
    const lines = night.lines.length > 0 ? night.lines : [t.phase.quietNight]
    for (const line of lines) {
      y += 6
      paragraph(line, PLEX, 24, night.lines.length > 0 ? MIDNIGHT : MUTED, 32)
    }
  }

  y += MARGIN
  return y
}

/** The page as a PNG, or null where there is no canvas to draw on. */
export const paperImage = async (state: GameState, locale: Locale): Promise<Blob | null> => {
  if (typeof document === 'undefined') return null
  const t = strings(locale)
  const paper = paperOf(state, locale)
  try {
    await Promise.all(
      [`132px ${BEBAS}`, `28px ${PLEX}`, `22px ${MONO}`].map((f) => document.fonts.load(f)),
    )
  } catch {
    // Fallback faces are declared on every font stack.
  }
  const canvas = document.createElement('canvas')
  const probe = canvas.getContext('2d')
  if (probe) resolveInks(probe)
  if (!probe) return null
  canvas.width = WIDTH
  const height = paint(probe, paper, t, true)
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  ctx.fillStyle = NEWSPRINT
  ctx.fillRect(0, 0, WIDTH, height)
  paint(ctx, paper, t, false)
  return new Promise((resolve) => canvas.toBlob((blob) => resolve(blob), 'image/png'))
}

export type ShareResult =
  | { kind: 'shared' }
  /** No share sheet for files here: the image is handed back to be shown. */
  | { kind: 'shown'; url: string }
  | { kind: 'unavailable' }

/**
 * Hands the page to the share sheet as an image. Where the browser has no
 * share sheet for files, the image comes back as an object URL for the
 * screen to show: a long press on it saves or shares it on every phone,
 * where a download link in a standalone window goes nowhere obvious.
 * `unavailable` means there was no canvas to draw on at all.
 */
export const sharePaper = async (
  state: GameState,
  locale: Locale,
  /**
   * Called the moment the page exists, before any share sheet is asked for.
   * `navigator.share` can settle neither way, and a caller that has to give
   * up needs something to show for the tap: this is that something, and it
   * is the same object URL a `shown` result carries, so nothing is drawn or
   * created twice.
   */
  onDrawn?: (url: string) => void,
): Promise<ShareResult> => {
  const blob = await paperImage(state, locale)
  if (blob === null) return { kind: 'unavailable' }
  const drawn = URL.createObjectURL(blob)
  onDrawn?.(drawn)
  const t = strings(locale)
  const file = new File([blob], `${t.appName.toLowerCase().replace(/\s+/g, '-')}-${Date.now()}.png`, { type: 'image/png' })
  const nav = navigator as Navigator & { canShare?: (data: ShareData) => boolean }
  if (typeof nav.share === 'function' && nav.canShare?.({ files: [file] })) {
    try {
      await nav.share({ files: [file], title: t.ui.paper.title })
      return { kind: 'shared' }
    } catch (error) {
      // AbortError is the one rejection that means the share worked as
      // designed: the sheet opened and they closed it. Every other rejection
      // means no sheet appeared at all — iOS refuses when the gesture has
      // lapsed — and swallowing those left the button simply coming back,
      // which reads as the app being broken. Fall through to the image.
      if (error instanceof Error && error.name === 'AbortError') return { kind: 'shared' }
    }
  }
  return { kind: 'shown', url: drawn }
}
