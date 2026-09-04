import { describe, expect, it } from 'vitest'
import { exportKeys, importKeys, makeKeys, seal, sharedKey, unseal } from './crypto'

describe('the seal on a player’s card', () => {
  it('lets two sides agree a key through public halves alone, and nobody else', async () => {
    const narrator = await makeKeys()
    const player = await makeKeys()
    const stranger = await makeKeys()

    const mine = await sharedKey(narrator.privateKey, player.pub)
    const theirs = await sharedKey(player.privateKey, narrator.pub)
    const sealed = await seal(mine, '{"roleId":"KILLER"}')

    expect(sealed).not.toContain('KILLER')
    expect(await unseal(theirs, sealed)).toBe('{"roleId":"KILLER"}')
    expect(await unseal(await sharedKey(stranger.privateKey, narrator.pub), sealed)).toBeNull()
  })

  it('survives a page reload as JSON', async () => {
    const player = await makeKeys()
    const back = await importKeys(await exportKeys(player))
    expect(back?.pub).toBe(player.pub)
    const narrator = await makeKeys()
    const a = await sharedKey(player.privateKey, narrator.pub)
    const b = await sharedKey(back!.privateKey, narrator.pub)
    expect(await unseal(b, await seal(a, 'hello'))).toBe('hello')
    expect(await importKeys('junk')).toBeNull()
  })
})
