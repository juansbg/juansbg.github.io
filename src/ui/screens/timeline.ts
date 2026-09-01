import type { Session, TimelineEntry } from '../../engine/state'
import type { Player, PlayerId } from '../../engine/types'
import { strings, type Locale } from '../../i18n'
import { esc } from '../dom'

/**
 * The full log of the game, including steps that announced nothing.
 *
 * A narrator checking back on "did the detective already look at Beto?" needs
 * the silent steps most of all, so every recorded move appears here — not just
 * the public outcomes the morning report reads aloud.
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
          return tl.acted(roleName)
        case 'confirm':
          return tl.acted(roleName)
        case 'split':
          return tl.acted(roleName)
      }
    }
  }
}

export const timelineMarkup = (session: Session, locale: Locale): string => {
  const t = strings(locale)
  const players = session.current.players

  // Newest first: the narrator is almost always looking at what just happened.
  // Setup edits are kept in history so they can be rewound to, but they are
  // not moves in the game and would drown the log.
  const rows = session.timeline
    .map((entry, i) => ({ entry, i }))
    .filter(({ entry }) => entry.kind !== 'setup')
    .reverse()
    .map(
      ({ entry, i }) => `
        <li class="log__row" data-night="${entry.night}">
          <span class="log__text">${esc(describeEntry(entry, players, locale))}</span>
          <button class="log__revert" type="button" data-revert="${i}">
            ${esc(t.ui.timeline.revertHere)}
          </button>
        </li>
      `,
    )
    .join('')

  return `
    <div class="sheet" data-sheet>
      <div class="sheet__panel sheet__panel--tall" role="dialog" aria-modal="true">
        <p class="subtitle subtitle--sm">${esc(t.ui.timeline.title)}</p>
        <ul class="log">${rows}</ul>
        <button class="btn btn--ghost" type="button" data-log-close>${esc(t.ui.common.close)}</button>
      </div>
    </div>
  `
}
