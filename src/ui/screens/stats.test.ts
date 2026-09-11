import { describe, expect, it } from 'vitest'
import { statsMarkup } from './stats'
import type { GameSummary, SeatRecord } from '../../engine/summary'
import { LOCALES, strings } from '../../i18n'

const seat = (
  name: string,
  roleId: SeatRecord['roleId'],
  team: SeatRecord['team'],
  alive: boolean,
  death: SeatRecord['death'],
  won: boolean,
): SeatRecord => ({ name, roleId, team, trade: null, alive, death, won })

/** Two evenings: the town won a three-night game, then the Family took a two-night one. */
const games: GameSummary[] = [
  {
    version: 1, seed: 1, endedAt: Date.UTC(2026, 8, 1), winner: 'town', players: 3, nights: 3, looks: 2, hits: 1,
    seats: [
      seat('Ana', 'KILLER', 'crew', false, { night: 2, cause: 'lynch' }, false),
      seat('Beto', 'PLAIN', 'town', true, null, true),
      seat('Caro', 'INSPECT', 'town', false, { night: 1, cause: 'killers' }, true),
    ],
  },
  {
    version: 1, seed: 2, endedAt: Date.UTC(2026, 8, 5), winner: 'crew', players: 2, nights: 2, looks: 1, hits: 0,
    seats: [
      seat('ana', 'PLAIN', 'town', false, { night: 1, cause: 'killers' }, false),
      seat('Beto', 'KILLER', 'crew', true, null, true),
    ],
  },
]

const text = (html: string): string => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')

describe('the ledger', () => {
  it.each(LOCALES)('adds the table up and lists every name once, most games first (%s)', (locale) => {
    const t = strings(locale).ui.stats
    const html = statsMarkup(games, locale)
    const flat = text(html)
    expect(html).toContain('data-stats-screen')
    expect(flat).toContain(t.games(2))
    expect(flat).toContain('2026')
    // The table's line: one win each, two and a half nights a game, one hit in three looks.
    expect(flat).toContain(`1 ${t.table.town} 50%`)
    expect(flat).toContain(`1 ${t.table.family} 50%`)
    expect(flat).toContain(`2.5 ${t.table.nights}`)
    expect(flat).toContain(`1/3 ${t.table.looks} 33%`)
    // "Ana" and "ana" are one person; Beto has played every game and won both.
    const rows = html.match(/ledger__row/g) ?? []
    expect(rows).toHaveLength(3)
    expect(html.indexOf('Beto')).toBeLessThan(html.indexOf('Caro'))
    const beto = text(html.slice(html.indexOf('Beto'), html.indexOf('Caro')))
    expect(beto).toContain(`2 ${t.columns.games}`)
    expect(beto).toContain(`2 ${t.columns.wins}`)
    expect(beto).toContain(`1 ${t.columns.family}`)
    expect(beto).toContain(`2 ${t.columns.survived}`)
    // Ana was hanged once and killed once.
    const ana = text(html.slice(html.indexOf('ledger__row'), html.indexOf('Beto')))
    expect(ana).toContain(`1 ${t.columns.hanged}`)
    expect(ana).toContain(`1 ${t.columns.killed}`)
    expect(html).toContain('data-stats-close')
    expect(html).toContain('data-stats-clear')
  })

  it('puts tonight’s names first, in the order they were typed, then the rest by games', () => {
    const html = statsMarkup(games, 'en', ['Caro', ' ANA '])
    const order = [...html.matchAll(/ledger__name">([^<]+)</g)].map((m) => m[1])
    expect(order).toEqual(['Caro', 'ana', 'Beto'])
  })

  it.each(LOCALES)('says so when nothing has been played, with nothing to clear (%s)', (locale) => {
    const t = strings(locale).ui.stats
    const html = statsMarkup([], locale)
    expect(text(html)).toContain(t.empty)
    expect(html).not.toContain('ledger__row')
    expect(html).not.toContain('data-stats-clear')
    expect(html).toContain('data-stats-close')
  })

  it('leaves out a side that never won and a Detective that never looked', () => {
    const quiet: GameSummary[] = [{ ...games[0]!, looks: 0, hits: 0 }]
    const flat = text(statsMarkup(quiet, 'en'))
    const t = strings('en').ui.stats
    expect(flat).not.toContain(t.table.pair)
    expect(flat).not.toContain(t.table.martyr)
    expect(flat).not.toContain(t.table.looks)
    expect(flat).not.toContain('!')
  })
})
