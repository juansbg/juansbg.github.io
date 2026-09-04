/**
 * Sound.
 *
 * Three cues, all synthesised: the night as a low wind and a drone under the
 * narrator's voice, one drum on the town's verdict, a tick when a seat is
 * chosen. Nothing is fetched and nothing is precached — the app is offline
 * and every asset is a cost on first launch — and a filtered noise loop
 * sounds more like a dark room than any file this size would.
 *
 * Browsers refuse to start audio outside a user gesture, so the context is
 * made in the first tap or key press on the page and whatever the app asked
 * for before that (a night resumed from a save) starts then. The mute is
 * the narrator's preference and lives under its own key.
 */

const KEY = 'omerta:sound'

/** The corner of the Web Audio API this module uses, for a test double. */
export interface Ctx {
  readonly currentTime: number
  readonly destination: AudioNode
  readonly sampleRate: number
  readonly state: string
  resume(): Promise<void>
  createGain(): GainNode
  createOscillator(): OscillatorNode
  createBiquadFilter(): BiquadFilterNode
  createBufferSource(): AudioBufferSourceNode
  createBuffer(channels: number, length: number, sampleRate: number): AudioBuffer
}

export interface Sound {
  muted(): boolean
  setMuted(muted: boolean): void
  /** The night ambience: on while the narrator runs a night, off by day. */
  night(on: boolean): void
  drum(): void
  tick(): void
  /** Called from inside a user gesture: makes the context and applies what is pending. */
  unlock(): void
}

const loadMuted = (): boolean => {
  try {
    return localStorage.getItem(KEY) === 'muted'
  } catch {
    return false
  }
}

const saveMuted = (muted: boolean): void => {
  try {
    if (muted) localStorage.setItem(KEY, 'muted')
    else localStorage.removeItem(KEY)
  } catch {
    // Private mode. The choice holds until the page closes.
  }
}

/** Two seconds of noise, with a little memory so it sits low like wind. */
const noiseBuffer = (ctx: Ctx): AudioBuffer => {
  const length = ctx.sampleRate * 2
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate)
  const data = buffer.getChannelData(0)
  let last = 0
  for (let i = 0; i < length; i++) {
    const white = Math.random() * 2 - 1
    last = (last + 0.02 * white) / 1.02
    data[i] = last * 3.5
  }
  return buffer
}

export const createSound = (make: () => Ctx | null): Sound => {
  let muted = loadMuted()
  let ctx: Ctx | null = null
  /** The night loop's master gain, while one is running. */
  let bed: GainNode | null = null
  let wantNight = false

  const context = (): Ctx | null => {
    if (muted) return null
    if (ctx === null) ctx = make()
    if (ctx !== null && ctx.state === 'suspended') void ctx.resume()
    return ctx
  }

  const startNight = (): void => {
    const c = context()
    if (c === null || bed !== null) return
    const now = c.currentTime
    const master = c.createGain()
    master.gain.setValueAtTime(0.0001, now)
    master.gain.exponentialRampToValueAtTime(0.5, now + 2.5)
    master.connect(c.destination)

    // Wind: the noise through a low-pass whose cutoff drifts.
    const wind = c.createBufferSource()
    wind.buffer = noiseBuffer(c)
    wind.loop = true
    const low = c.createBiquadFilter()
    low.type = 'lowpass'
    low.frequency.setValueAtTime(260, now)
    low.Q.setValueAtTime(0.7, now)
    const drift = c.createOscillator()
    drift.type = 'sine'
    drift.frequency.setValueAtTime(0.07, now)
    const depth = c.createGain()
    depth.gain.setValueAtTime(140, now)
    drift.connect(depth)
    depth.connect(low.frequency)
    const windGain = c.createGain()
    windGain.gain.setValueAtTime(0.35, now)
    wind.connect(low)
    low.connect(windGain)
    windGain.connect(master)

    // The drone: two low sines a little apart, so they beat slowly.
    const droneGain = c.createGain()
    droneGain.gain.setValueAtTime(0.12, now)
    droneGain.connect(master)
    for (const hz of [55, 55.4]) {
      const osc = c.createOscillator()
      osc.type = 'sine'
      osc.frequency.setValueAtTime(hz, now)
      osc.connect(droneGain)
      osc.start(now)
    }
    wind.start(now)
    drift.start(now)
    bed = master
  }

  const stopNight = (): void => {
    if (bed === null || ctx === null) return
    const now = ctx.currentTime
    const gone = bed
    bed = null
    gone.gain.cancelScheduledValues(now)
    gone.gain.setValueAtTime(Math.max(gone.gain.value, 0.0001), now)
    gone.gain.exponentialRampToValueAtTime(0.0001, now + 1.5)
    // The sources keep running into a silent gain until the graph is
    // collected; a disconnect after the fade is cleaner.
    setTimeout(() => gone.disconnect(), 1600)
  }

  return {
    muted: () => muted,
    setMuted(next) {
      muted = next
      saveMuted(next)
      if (next) stopNight()
      else if (wantNight) startNight()
    },
    night(on) {
      wantNight = on
      if (on) startNight()
      else stopNight()
    },
    drum() {
      const c = context()
      if (c === null) return
      const now = c.currentTime
      // The skin: a sine falling from 150 to 45 Hz in 0.4s.
      const skin = c.createOscillator()
      skin.type = 'sine'
      skin.frequency.setValueAtTime(150, now)
      skin.frequency.exponentialRampToValueAtTime(45, now + 0.4)
      const skinGain = c.createGain()
      skinGain.gain.setValueAtTime(0.9, now)
      skinGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.6)
      skin.connect(skinGain)
      skinGain.connect(c.destination)
      skin.start(now)
      skin.stop(now + 0.6)
      // The stick: a short burst of noise around 200 Hz.
      const stick = c.createBufferSource()
      stick.buffer = noiseBuffer(c)
      const band = c.createBiquadFilter()
      band.type = 'bandpass'
      band.frequency.setValueAtTime(200, now)
      band.Q.setValueAtTime(1, now)
      const stickGain = c.createGain()
      stickGain.gain.setValueAtTime(0.6, now)
      stickGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.15)
      stick.connect(band)
      band.connect(stickGain)
      stickGain.connect(c.destination)
      stick.start(now)
      stick.stop(now + 0.15)
    },
    tick() {
      const c = context()
      if (c === null) return
      const now = c.currentTime
      // A 1.8 kHz blip, 25 ms: a pen on paper, not a beep.
      const osc = c.createOscillator()
      osc.type = 'triangle'
      osc.frequency.setValueAtTime(1800, now)
      const gain = c.createGain()
      gain.gain.setValueAtTime(0.18, now)
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.025)
      osc.connect(gain)
      gain.connect(c.destination)
      osc.start(now)
      osc.stop(now + 0.03)
    },
    unlock() {
      if (muted) return
      const c = context()
      if (c !== null && wantNight && bed === null) startNight()
    },
  }
}

/** The real thing, or null where the browser has no Web Audio. */
const realContext = (): Ctx | null => {
  const Ctor =
    typeof AudioContext !== 'undefined'
      ? AudioContext
      : (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  if (!Ctor) return null
  try {
    return new Ctor() as unknown as Ctx
  } catch {
    return null
  }
}

export const sound: Sound = createSound(realContext)

/**
 * Every gesture on the page nudges the audio context: the first one opens
 * it, and later ones resume it after iOS has suspended it behind a phone
 * call or a trip to the home screen. iOS only honours a resume inside a
 * gesture, and a render inside a view transition is not one. The listener
 * stays: it is a property check when there is nothing to do.
 */
export const unlockOnGesture = (target: EventTarget = window): void => {
  const open = (): void => sound.unlock()
  target.addEventListener('pointerdown', open)
  target.addEventListener('keydown', open)
}
