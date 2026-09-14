import type { Session, TimelineEntry } from '../../engine/state'
import type { GameState, Outcome, Player, PlayerId } from '../../engine/types'
import { outcomeAccent, renderOutcome, strings, type Locale } from '../../i18n'
import { accentOf, outcomeAccentOf, type Accent } from '../accent'
import { sigilMarkup } from '../sigils'
import { esc } from '../dom'

/**
 * The full log of the game, including steps that announced nothing.
 *
 * A narrator checking back on "did the detective already look at Beto?" needs
 * the silent steps most of all, so every recorded move appears here — not just
 * the public outcomes the morning report reads aloud.
 *
 * Every row is a ledger line: the night, a mark in the colour of the side
 * that made the move carrying the role's sigil, the sentence, and the way
 * back. v1 coloured its report cards per role and it was the most readable
 * thing about it; here the mark's colour carries the side and the sigil
 * carries the role (docs/DESIGN.md).
 */

const nameOf = (players: readonly Player[], id: PlayerId | undefined): string =>
  players.find((p) => p.id === id)?.name ?? '?'

export const describeEntry = (
  entry: TimelineEntry,
  players: readonly Player[],
  locale: Locale,
): string => {
  const t = strings(locale)
  const tl = t.ui.timeline
  const roleName = entry.roleId ? t.roles[entry.roleId].name : ''

  switch (entry.kind) {
    case 'nightStart':
      return tl.nightStart(entry.night)
    case 'nightEnd':
      return tl.nightEnd(entry.night)
    case 'lynch':
      return tl.lynch(nameOf(players, entry.target))
    case 'hunterShot':
      return tl.hunterShot(nameOf(players, entry.target))
    case 'vote':
      return entry.target === undefined
        ? tl.unvoted(nameOf(players, entry.voter))
        : tl.voted(nameOf(players, entry.voter), nameOf(players, entry.target))
    case 'setup':
      return ''
    case 'action': {
      const action = entry.action
      if (!action) return tl.acted(roleName)
      switch (action.kind) {
        case 'skip':
          return tl.skipped(roleName)
        case 'target':
          return tl.chose(roleName, nameOf(players, action.target))
        case 'pair':
          return tl.pairedUp(
            roleName,
            nameOf(players, action.first),
            nameOf(players, action.second),
          )
        case 'potion':
          return tl.potion(
            roleName,
            nameOf(players, action.target),
            action.potion === 'heal' ? t.ui.night.heal : t.ui.night.poison,
          )
        case 'chooseRole':
          return tl.became(roleName, t.roles[action.newRole].name)
        case 'confirm':
        case 'split':
          return tl.acted(roleName)
      }
    }
  }
}

/** The accent an entry should carry: its role's side, or the town for a lynching. */
const entryAccent = (entry: TimelineEntry): Accent => {
  if (entry.roleId) return accentOf(entry.roleId)
  if (entry.kind === 'lynch' || entry.kind === 'vote') return 'town'
  if (entry.kind === 'hunterShot') return accentOf('AVENGE')
  return 'system'
}

/** A glyph per kind of move, so rows scan without reading. */
const entryGlyph = (entry: TimelineEntry): string => {
  switch (entry.kind) {
    case 'nightStart': return '☾'
    case 'nightEnd': return '☀'
    case 'lynch': return '⚖'
    case 'vote': return '✓'
    case 'hunterShot': return '✦'
    case 'action':
      return entry.action?.kind === 'skip' ? '·' : '●'
    default: return ''
  }
}

/**
 * A phone turned away at the door.
 *
 * Nothing in the game changed, so a notice is not a timeline entry: it has no
 * state behind it and nothing to rewind to. It rides beside the entries and
 * sits where it happened, which is what a narrator needs — they were reading
 * the night aloud when somebody's phone said "no seat for that name", and
 * until now the only device that never heard about it was theirs.
 */
export interface Notice {
  readonly night: number
  /** How many entries the timeline had when it happened, so it sorts. */
  readonly at: number
  readonly name: string
  readonly reason: 'notOnList' | 'nameTaken' | 'tableFull'
}

export const timelineMarkup = (
  session: Session,
  locale: Locale,
  notices: readonly Notice[] = [],
): string => {
  const t = strings(locale)
  const players = session.current.players

  // Newest first: the narrator is almost always looking at what just happened.
  // Setup edits are kept in history so they can be rewound to, but they are
  // not moves in the game and would drown the log.
  const moves = session.timeline
    .map((entry, i) => ({ entry, i }))
    .filter(({ entry }) => entry.kind !== 'setup')
    .map(({ entry, i }) => {
      const divider = entry.kind === 'nightStart' || entry.kind === 'nightEnd'
      const mark = entry.roleId ? sigilMarkup(entry.roleId) : entryGlyph(entry)
      return {
        at: i,
        html: `
        <li class="log__row${divider ? ' log__row--divider' : ''}${
          entry.action?.kind === 'skip' ? ' log__row--quiet' : ''
        }"
            data-night="${entry.night}"
            data-accent="${entryAccent(entry)}">
          <span class="log__night" aria-hidden="true">N${entry.night}</span>
          <span class="mark" aria-hidden="true">${mark}</span>
          <span class="log__text">${esc(describeEntry(entry, players, locale))}</span>
          <button class="icon-btn log__revert" type="button" data-revert="${i}"
                  aria-label="${esc(`${t.ui.timeline.revertHere} · ${describeEntry(entry, players, locale)}`)}"
                  title="${esc(t.ui.timeline.revertHere)}">↶</button>
        </li>
      `,
      }
    })

  // The door's own lines, in the same order, with no rewind: there is
  // nothing behind them to go back to.
  const turned = notices.map((notice) => ({
    // `at` is how long the timeline was when the door said no, so the notice
    // belongs just before whatever became that entry.
    at: notice.at - 0.5,
    html: `
      <li class="log__row log__row--quiet" data-night="${notice.night}" data-accent="system">
        <span class="log__night" aria-hidden="true">N${notice.night}</span>
        <span class="mark" aria-hidden="true">✕</span>
        <span class="log__text">${esc(t.ui.timeline[notice.reason](notice.name))}</span>
      </li>
    `,
  }))

  // Newest first: the narrator is almost always looking at what just happened.
  const rows = [...moves, ...turned]
    .sort((a, b) => b.at - a.at)
    .map((row) => row.html)
    .join('')

  return `
    <div class="sheet" data-sheet>
      <div class="sheet__panel sheet__panel--tall" role="dialog" aria-modal="true" aria-label="${esc(t.ui.timeline.title)}">
        <div class="sheet__head">
          <span class="sheet__handle" aria-hidden="true"></span>
          <p class="sheet__title">${esc(t.ui.timeline.title)}</p>
        </div>
        <ul class="log">${rows}</ul>
        <button class="btn btn--ghost" type="button" data-log-close>${esc(t.ui.common.close)}</button>
      </div>
    </div>
  `
}

/** The sentence with the subject's name set bold, so the narrator sees it first. */
const emphasise = (line: string, subject: string | undefined): string => {
  const at = subject ? line.indexOf(subject) : -1
  if (subject === undefined || at === -1) return esc(line)
  return `${esc(line.slice(0, at))}<span class="report__badge">${esc(subject)}</span>${esc(
    line.slice(at + subject.length),
  )}`
}

/**
 * One public outcome as a line of newsprint — the unit of the morning report
 * and of the end-of-game history. Direct descendant of v1's `displayCards`:
 * the mark's colour carries the side that caused it, its sigil the role.
 */
export const outcomeCardMarkup = (
  outcome: Outcome,
  players: readonly Player[],
  locale: Locale,
  index = 0,
): string | null => {
  const line = renderOutcome(outcome, players, locale)
  if (line === null) return null
  const source = outcomeAccent(outcome)
  // The town's accent covers two different things: what the town decided,
  // which is the scales, and what somebody let slip, which is a paragraph
  // mark. The dawn reading and the paper have always told them apart; the
  // morning report and the record did not, so a rumour from a neighbour
  // carried the same scales of justice as the execution above it — and on a
  // day with both, the report showed two verdicts.
  const mark = source !== 'town' ? sigilMarkup(source) : outcome.type === 'clue' ? '¶' : '⚖'

  const subject =
    'target' in outcome ? players.find((p) => p.id === outcome.target)?.name : undefined

  return `
    <li class="report__card" data-accent="${outcomeAccentOf(outcome)}" style="--i: ${index}" data-kind="${outcome.type}">
      <span class="mark" aria-hidden="true">${mark}</span>
      <span class="report__line">${emphasise(line, subject)}</span>
    </li>
  `
}

/**
 * Every public outcome of the whole game, grouped by night. This is v1's
 * `finishGame()` view — the one thing the old app did that people liked.
 */
export const historyMarkup = (state: GameState, locale: Locale): string => {
  const t = strings(locale)
  const nights = [...new Set(state.log.map((o) => o.night))].sort((a, b) => a - b)

  const groups = nights
    .map((night) => {
      const cards = state.log
        .filter((o) => o.night === night && o.public)
        .map((o, i) => outcomeCardMarkup(o, state.players, locale, i))
        .filter((c): c is string => c !== null)
        .join('')
      return `
        <section class="history__night">
          <h3 class="history__title">${esc(t.ui.timeline.nightStart(night))}</h3>
          <ul class="report">${cards || `<li class="report__card report__card--quiet">${esc(t.phase.quietNight)}</li>`}</ul>
        </section>
      `
    })
    .join('')

  return `<div class="history">${groups}</div>`
}
