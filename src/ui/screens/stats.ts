import { aggregate, nameKey, type GameSummary } from '../../engine/summary'
import { strings, type Locale } from '../../i18n'
import { esc } from '../dom'

/**
 * The ledger: what the record of finished games adds up to, for the people
 * who keep sitting at this table. A dark screen in the timeline's voice,
 * ledger lines under hairlines: one line for the table (who wins, how long a
 * game runs, how the Detective does) and one row per name, most games
 * first, the people on tonight's names list ahead of everyone else in the
 * list's own order. The figures come from `aggregate()`; only the shares
 * are worked out here. Opened from ⋯ and closed by its own Done; the bar
 * stays, since no player ever sees this screen.
 */
export const statsMarkup = (games: readonly GameSummary[], locale: Locale, roster: readonly string[] = []): string => {
  const t = strings(locale)
  const s = t.ui.stats
  const done = `<div class="actions"><button class="btn btn--primary" type="button" data-stats-close>${esc(t.ui.common.done)}</button></div>`
  const head = (line: string | null): string => `
    <header class="ledger__head">
      <h1 class="title title--sm">${esc(s.title)}</h1>
      ${line === null ? '' : `<p class="label">${esc(line)}</p>`}
    </header>`

  if (games.length === 0) {
    return `
      <section class="screen screen--stats" data-stats-screen>
        ${head(null)}
        <p class="ledger__empty">${esc(s.empty)}</p>
        ${done}
      </section>
    `
  }

  const { table, names } = aggregate(games)
  const first = games.reduce((earliest, g) => Math.min(earliest, g.endedAt), Infinity)
  const since = new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'long', year: 'numeric' }).format(first)
  const fig = (n: string | number, label: string, share: number | null = null): string =>
    `<span class="ledger__fig"><b>${esc(String(n))}</b> ${esc(label)}${
      share === null ? '' : ` <b>${Math.round(share * 100)}%</b>`
    }</span>`

  const line = [
    fig(table.town, s.table.town(table.town), table.town / table.games),
    fig(table.crew, s.table.family(table.crew), table.crew / table.games),
    table.lovers > 0 ? fig(table.lovers, s.table.pair, table.lovers / table.games) : '',
    table.martyr > 0 ? fig(table.martyr, s.table.martyr, table.martyr / table.games) : '',
    fig((table.nights / table.games).toFixed(1), s.table.nights),
    table.looks > 0 ? fig(`${table.hits}/${table.looks}`, s.table.looks, table.hits / table.looks) : '',
  ].join('')

  // Tonight's people first, in the order the narrator typed them; then
  // everyone the record remembers, most games first.
  const rank = new Map(roster.map((name, i) => [nameKey(name), i]))
  const ordered = [...names].sort((a, b) => {
    const ra = rank.get(nameKey(a.name)) ?? Infinity
    const rb = rank.get(nameKey(b.name)) ?? Infinity
    return ra - rb
  })

  // Only what happened to them. Every figure used to be printed whether or
  // not it had ever occurred, so after one game a citizen read "1 game 1 win
  // 0 times in the Family 0 hanged 0 killed 1 stood" over five wrapped
  // lines — a dump nobody at the table would read aloud. The games played
  // stay whatever the number, as the count the rest is measured against.
  const rows = ordered
    .map((n) => {
      const figs = [
        fig(n.games, s.columns.games(n.games)),
        n.wins > 0 ? fig(n.wins, s.columns.wins(n.wins)) : '',
        n.family > 0 ? fig(n.family, s.columns.family(n.family)) : '',
        n.hanged > 0 ? fig(n.hanged, s.columns.hanged(n.hanged)) : '',
        n.killed > 0 ? fig(n.killed, s.columns.killed(n.killed)) : '',
        n.survived > 0 ? fig(n.survived, s.columns.survived(n.survived)) : '',
      ].join('')
      return `
        <li class="ledger__row">
          <span class="ledger__name">${esc(n.name)}</span>
          <span class="ledger__figs">${figs}</span>
        </li>`
    })
    .join('')

  return `
    <section class="screen screen--stats" data-stats-screen>
      ${head(`${s.games(table.games)} · ${s.since(since)}`)}
      <div class="ledger" data-ledger>
        <p class="ledger__table">${line}</p>
        <ul class="ledger__names">${rows}</ul>
        <button class="btn btn--ghost ledger__clear" type="button" data-stats-clear>${esc(s.clear)}</button>
      </div>
      ${done}
    </section>
  `
}
