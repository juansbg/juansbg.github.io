// @vitest-environment jsdom
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { createSound, type Ctx } from './sound'

beforeAll(() => {
  const data = new Map<string, string>()
  const shim: Storage = {
    get length() { return data.size },
    clear: () => data.clear(),
    getItem: (k) => data.get(k) ?? null,
    key: (i) => [...data.keys()][i] ?? null,
    removeItem: (k) => { data.delete(k) },
    setItem: (k, v) => { data.set(k, String(v)) },
  }
  Object.defineProperty(globalThis, 'localStorage', { value: shim, configurable: true })
})

beforeEach(() => localStorage.clear())

/**
 * A context that records what was built. Every node is the same loose
 * object: params take scheduled values, connections are counted, and the
 * ramps on the night bed's master gain are what the tests read.
 */
interface Fake extends Ctx {
  made: number
  ramps: number[]
}

const param = (log?: number[]) => ({
  value: 0,
  setValueAtTime(v: number) { log?.push(v); return this },
  exponentialRampToValueAtTime(v: number) { log?.push(v); return this },
  cancelScheduledValues() { return this },
})

const fakeContext = (): Fake => {
  const ramps: number[] = []
  let gains = 0
  const node = (extra: object = {}) => ({
    connect() { return this },
    disconnect() {},
    start() {},
    stop() {},
    ...extra,
  })
  const fake = {
    made: 0,
    ramps,
    currentTime: 0,
    destination: node() as unknown as AudioNode,
    sampleRate: 8000,
    state: 'running',
    resume: () => Promise.resolve(),
    // The first gain of a night bed is its master: its ramps are the fade.
    createGain: () => node({ gain: param(gains++ === 0 ? ramps : undefined) }) as unknown as GainNode,
    createOscillator: () =>
      node({ type: 'sine', frequency: param() }) as unknown as OscillatorNode,
    createBiquadFilter: () =>
      node({ type: 'lowpass', frequency: param(), Q: param() }) as unknown as BiquadFilterNode,
    createBufferSource: () => node({ buffer: null, loop: false }) as unknown as AudioBufferSourceNode,
    createBuffer: (_c: number, length: number) =>
      ({ getChannelData: () => new Float32Array(length) }) as unknown as AudioBuffer,
  }
  return fake as unknown as Fake
}

describe('sound', () => {
  it('makes no context at all while muted, and remembers the mute', () => {
    let made = 0
    const s = createSound(() => { made++; return fakeContext() })
    s.setMuted(true)
    s.night(true)
    s.drum()
    s.tick()
    expect(made).toBe(0)
    expect(localStorage.getItem('omerta:sound')).toBe('muted')
    // A fresh instance reads the preference back.
    expect(createSound(() => null).muted()).toBe(true)
  })

  it('fades the night in once, and out when the day comes', () => {
    const ctx = fakeContext()
    const s = createSound(() => ctx)
    s.night(true)
    s.night(true)
    expect(ctx.ramps).toEqual([0.0001, 0.5])
    s.night(false)
    expect(ctx.ramps.at(-1)).toBe(0.0001)
  })

  it('starts a night asked for before the first gesture when it is unlocked', () => {
    let ctx: Fake | null = null
    const s = createSound(() => (ctx = fakeContext()))
    // Nothing can be built before a gesture; the request is kept.
    s.setMuted(true)
    s.night(true)
    expect(ctx).toBeNull()
    s.setMuted(false)
    expect(ctx!.ramps).toEqual([0.0001, 0.5])
  })

  it('survives a browser with no Web Audio', () => {
    const s = createSound(() => null)
    expect(() => { s.night(true); s.drum(); s.tick(); s.unlock() }).not.toThrow()
  })
})
