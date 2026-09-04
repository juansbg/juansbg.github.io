import { ROLES, type RoleId } from '../../engine/roles'
import { revealedDead, winner } from '../../engine/state'
import type { DeathCause, GameState, Outcome, Player, PlayerId } from '../../engine/types'
import { outcomeAccent, renderOutcome, renderWinner, strings, type Locale } from '../../i18n'
import { accentOf, outcomeAccentOf, type Accent } from '../accent'
import { esc } from '../dom'
import { sigilMarkup } from '../sigils'
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
}

export interface Edition {
  masthead: string
  dateline: string
  day: number
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
  players: readonly Pick<Player, 'id' | 'name'>[]
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
  // The whole log, so a death keeps the line it was given at dawn.
  const lines = deathLines(log, (cause) => bank[cause].length)

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
      eyebrow: null,
      headline: p.headline[o.cause](who),
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
      case 'silenced': headline = p.event.silenced(name(o.target)); break
      case 'extraVote': headline = p.event.extraVote(name(o.target)); break
      case 'growl': headline = p.event.growl; break
      case 'cardTaken': headline = p.event.cardTaken(t.roles[o.role].name); break
      // The breadcrumb: the engine's line, nameless by construction, under a
      // headline that says only that somebody talked.
      case 'clue': headline = p.event.clue[o.night % p.event.clue.length] ?? ''; break
      default: return null
    }
    const dek = renderOutcome(o, src.players, locale)
    if (dek === null) return null
    return {
      kind: o.type === 'clue' ? 'clue' : 'event',
      eyebrow: null,
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
      eyebrow: null,
      headline: line(name(r.id)),
      dek: trade ? `${card} ${p.tradeLine(trade)}` : card,
      note: p.side[ROLES[r.roleId].team],
      mark: sigilMarkup(r.roleId),
      accent: accentOf(r.roleId),
      subject: null,
    })
  }
  for (const o of todays) {
    if (o.type !== 'clue') continue
    const article = eventArticle(o)
    if (article) articles.push(article)
  }

  // Colour: the n-th piece of the game, counting what earlier days used.
  let before = 0
  for (let d = 1; d < src.day; d++) before += colourWanted(log, d)
  const wanted = articles.length === 0 ? Math.max(1, colourCount(src.day)) : colourCount(src.day)
  for (let k = 0; k < wanted; k++) {
    const piece = p.colour[colourIndex(before + k, p.colour.length)]
    if (piece) {
      articles.push({
        kind: 'colour', eyebrow: null, headline: piece.headline, dek: piece.dek, note: null,
        mark: null, accent: null, subject: null,
      })
    }
  }

  const [lead = null, ...rest] = articles
  return { masthead: t.appName, dateline: p.daily(src.day), day: src.day, lead, rest }
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
 * The scribbles under an article: the body copy of a page that is mocked up
 * rather than written, three or four hairlines of varying length. Never
 * lorem ipsum. The pattern is picked by position so a page does not look
 * ruled.
 */
const SCRIBBLES: readonly (readonly number[])[] = [
  [1, 0.94, 0.98, 0.58],
  [1, 0.9, 0.42],
  [0.96, 1, 0.9, 0.7],
  [1, 0.97, 0.62],
]

const scribblesMarkup = (i: number): string =>
  `<span class="paper__scribbles" aria-hidden="true">${(SCRIBBLES[i % SCRIBBLES.length] ?? [])
    .map((w) => `<i class="paper__scribble" style="--w: ${w}"></i>`)
    .join('')}</span>`

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

const articleMarkup = (a: Article, i: number): string => `
  <article class="paper__article" data-kind="${a.kind}"${a.accent ? ` data-accent="${a.accent}"` : ''} style="--i: ${i}">
    <header class="paper__head">
      ${a.mark ? `<span class="mark paper__mark" aria-hidden="true">${a.mark}</span>` : ''}
      <div class="paper__title">
        ${a.eyebrow ? `<p class="paper__eyebrow">${esc(a.eyebrow)}</p>` : ''}
        <h3 class="paper__headline">${headlineMarkup(a)}</h3>
      </div>
    </header>
    <p class="paper__dek">${esc(a.dek)}</p>
    ${noteMarkup(a)}
    ${scribblesMarkup(i)}
  </article>`

const mastheadMarkup = (name: string, dateline: string): string => `
  <header class="paper__masthead">
    <p class="paper__name">${esc(name)}</p>
    <p class="paper__edition">${esc(dateline)}</p>
  </header>`

/** The lead across the top, the rest in two columns. */
const pageMarkup = (lead: Article | null, rest: readonly Article[]): string => `
  ${lead ? `<div class="paper__lead">${articleMarkup(lead, 0)}</div>` : ''}
  ${rest.length > 0 ? `<div class="paper__columns">${rest.map((a, i) => articleMarkup(a, i + 1)).join('')}</div>` : ''}`

/** A morning edition as the page. */
export const editionMarkup = (e: Edition, locale: Locale): string => {
  const t = strings(locale)
  return `
    <article class="paper paper--daily" data-paper data-edition="${e.day}" aria-label="${esc(t.ui.paper.title)}">
      ${mastheadMarkup(e.masthead, e.dateline)}
      ${pageMarkup(e.lead, e.rest)}
    </article>
  `
}

/**
 * The edition as a full screen, with its own Done. The bar is not rendered
 * while it is up (`app.ts`): the phone may be facing the town. Without
 * `controls` it is what a TV shows while the phone shows the paper.
 */
export const dailyMarkup = (e: Edition, locale: Locale, controls = true): string => {
  const t = strings(locale)
  return `
    <section class="screen screen--paper" data-daily>
      ${editionMarkup(e, locale)}
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
  edition: string
  banner: string
  stories: Story[]
  cast: Casting[]
  record: { title: string; lines: string[] }[]
}

export const paperOf = (state: GameState, locale: Locale): Paper => {
  const t = strings(locale)
  const bank = t.ui.dawn.death
  const lines = deathLines(state.log, (cause) => bank[cause].length)
  const isCrew = (roleId: Player['roleId']): boolean => ROLES[roleId].team === 'crew'

  const stories: Story[] = state.log
    .filter((o): o is Death => o.type === 'death' && o.public)
    .map((o) => {
      const name = nameIn(state.players, o.target)
      const victim = state.players.find((p) => p.id === o.target)
      return {
        night: o.night,
        name,
        cause: o.cause,
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
    masthead: t.appName,
    edition: t.ui.paper.edition(state.night, state.players.length),
    banner: renderWinner(winner(state), locale) ?? t.ui.over.title,
    stories,
    cast,
    record,
  }
}

/** The front page as it appears on the game-over screen: the same paper, final edition. */
export const paperMarkup = (state: GameState, locale: Locale): string => {
  const t = strings(locale)
  const paper = paperOf(state, locale)
  const [lead = null, ...rest] = paper.stories.map((s): Article => {
    const cause: Outcome = { type: 'death', night: s.night, target: -1, cause: s.cause, public: true }
    return {
      kind: s.cause === 'lynch' ? 'verdict' : 'death',
      eyebrow: t.ui.timeline.nightStart(s.night),
      headline: t.ui.paper.headline[s.cause](s.name),
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
      ${mastheadMarkup(paper.masthead, paper.edition)}
      <h2 class="paper__banner">${esc(paper.banner)}</h2>
      ${pageMarkup(lead, rest)}
      <section class="paper__section">
        <h3 class="paper__label">${esc(t.ui.paper.whoWasWho)}</h3>
        <ul class="paper__cast">${cast}</ul>
      </section>
      <section class="paper__section">
        <h3 class="paper__label">${esc(t.ui.over.history)}</h3>
        <dl class="paper__record">${record}</dl>
      </section>
    </article>
  `
}

// ---------------------------------------------------------------------------
// The image
// ---------------------------------------------------------------------------

const WIDTH = 1080
const MARGIN = 72
const COLUMN = WIDTH - MARGIN * 2
/** `--newsprint` resolved: Ash with a little Midnight. The canvas cannot read a token. */
const NEWSPRINT = '#c7c3b4'
const MIDNIGHT = '#000029'
const VENDETTA = '#ff0f0f'
const MUTED = '#4f4f62'
const RULE = '#9c9a90'

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
export const sharePaper = async (state: GameState, locale: Locale): Promise<ShareResult> => {
  const blob = await paperImage(state, locale)
  if (blob === null) return { kind: 'unavailable' }
  const t = strings(locale)
  const file = new File([blob], `${t.appName.toLowerCase()}-${Date.now()}.png`, { type: 'image/png' })
  const nav = navigator as Navigator & { canShare?: (data: ShareData) => boolean }
  if (typeof nav.share === 'function' && nav.canShare?.({ files: [file] })) {
    try {
      await nav.share({ files: [file], title: t.ui.paper.title })
    } catch {
      // Cancelled, or refused mid-way: theirs to decide.
    }
    return { kind: 'shared' }
  }
  return { kind: 'shown', url: URL.createObjectURL(blob) }
}
