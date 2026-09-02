import { describe, expect, it } from 'vitest'
import { spareCards } from './cards'
import { ROLES } from './roles'
import { createGame, type PlayerSetup } from './state'
import type { RoleId } from './roles'

const cast = (roles: RoleId[]): PlayerSetup[] => roles.map((roleId, i) => ({ name: `P${i}`, roleId }))

describe('the cards left in the centre', () => {
  const players = createGame(cast(['SWAP', 'KILLER', 'INSPECT', 'GUARD', 'PLAIN'])).players

  it('offers town cards nobody holds', () => {
    const spare = spareCards(players)
    expect(spare).toContain('MEDIC')
    expect(spare).toContain('SURVIVE')
    expect(spare).toContain('AVENGE')
  })

  it('never offers a card someone at the table holds, dead or alive', () => {
    expect(spareCards(players)).not.toContain('INSPECT')
    const withDead = players.map((p) => (p.roleId === 'GUARD' ? { ...p, alive: false } : p))
    expect(spareCards(withDead)).not.toContain('GUARD')
  })

  it('never offers the Family, the Chameleon or a plain Citizen', () => {
    const spare = spareCards(players)
    for (const id of spare) expect(ROLES[id].team).toBe('town')
    expect(spare).not.toContain('SWAP')
    expect(spare).not.toContain('PLAIN')
  })

  it('never offers a card whose only move was on the first night', () => {
    // The Chameleon acts after those steps; the card would do nothing.
    const spare = spareCards(players)
    expect(spare).not.toContain('PROTEGE')
    expect(spare).not.toContain('PAIR')
    expect(spare).not.toContain('SPLIT')
  })
})
