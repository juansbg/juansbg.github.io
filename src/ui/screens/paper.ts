import { ROLES } from '../../engine/roles'
import { winner } from '../../engine/state'
import type { GameState, Outcome, Player } from '../../engine/types'
import { renderOutcome, renderWinner, strings, type Locale } from '../../i18n'
import { esc } from '../dom'
import { deathLines } from './dawn'

/**
 * The morning paper: the whole game as a front page.
 *
 * v1's end-of-game view listed every public outcome by night, and it was
 * the one thing people liked. This is that list set as newsprint: the
 * winner as the banner, every death as a headline with the line the town
 * was read at dawn, who was who, and the record night by night. The same
 * page is drawn onto a canvas for the share sheet, so what leaves the phone
 * is what was on it.
 */

export interface Story {
  night: number
  name: string
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

const nameOf = (players: readonly Player[], id: number): string =>
  players.find((p) => p.id === id)?.name ?? '?'

export const paperOf = (state: GameState, locale: Locale): Paper => {
  const t = strings(locale)
  const bank = t.ui.dawn.death
  const lines = deathLines(state.log, (cause) => bank[cause].length)
  const isCrew = (roleId: Player['roleId']): boolean => ROLES[roleId].team === 'crew'

  const stories: Story[] = state.log
    .filter((o): o is Extract<Outcome, { type: 'death' }> => o.type === 'death' && o.public)
    .map((o) => {
      const name = nameOf(state.players, o.target)
      const victim = state.players.find((p) => p.id === o.target)
      return {
        night: o.night,
        name,
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

/** The front page as it appears on the game-over screen. */
export const paperMarkup = (state: GameState, locale: Locale): string => {
  const t = strings(locale)
  const paper = paperOf(state, locale)
  const stories = paper.stories
    .map(
      (s) => `
        <li class="paper__story">
          <span class="paper__night">N${s.night}</span>
          <h3 class="paper__headline">${esc(s.name)}</h3>
          <p class="paper__line">${esc(s.line)}</p>
        </li>`,
    )
    .join('')
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
      <header class="paper__masthead">
        <p class="paper__name">${esc(paper.masthead)}</p>
        <p class="paper__edition">${esc(paper.edition)}</p>
      </header>
      <h2 class="paper__banner">${esc(paper.banner)}</h2>
      ${stories ? `<ul class="paper__stories">${stories}</ul>` : ''}
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
const LEDGER = '#f7f6f2'
const MIDNIGHT = '#000029'
const VENDETTA = '#ff0f0f'
const MUTED = '#62627a'
const RULE = '#cfcfd4'

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
  ctx.fillStyle = LEDGER
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
