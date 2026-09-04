import { describe, expect, it } from 'vitest'
import { normalizeRelay, parseFragment, tvUrl } from './client'

describe('the room address', () => {
  it('puts the code in the fragment, where no server sees it', () => {
    const url = tvUrl({ code: 'AB2CD', secret: 's', relay: 'https://relay.example' }, 'https://juansbg.github.io/')
    expect(url).toBe('https://juansbg.github.io/tv.html#room=AB2CD&relay=https%3A%2F%2Frelay.example')
    expect(url).not.toContain('secret')
  })

  it('reads the fragment back, and rejects a code that is not one', () => {
    expect(parseFragment('#room=AB2CD&relay=https://relay.example/')).toEqual({
      room: 'AB2CD',
      relay: 'https://relay.example',
    })
    expect(parseFragment('#room=ab').room).toBeNull()
    expect(parseFragment('').room).toBeNull()
  })

  it('normalises a relay address', () => {
    expect(normalizeRelay(' https://relay.example// ')).toBe('https://relay.example')
  })
})
