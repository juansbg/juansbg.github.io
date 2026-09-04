import type { Random } from './deal'

/**
 * A seeded generator (mulberry32). The engine rolls very little on its own —
 * the paper's clues — and everything it rolls comes from `GameState.seed`
 * and the night number, so the same game state always rolls the same and an
 * undo never changes what the town was told. The simulator seeds its runs
 * with it too, so a balance failure can be replayed.
 */
export const seeded = (seed: number): Random => {
  let s = seed | 0
  return () => {
    s = (s + 0x6d2b79f5) | 0
    let t = Math.imul(s ^ (s >>> 15), 1 | s)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** One seed from several numbers, so night 3 of one game never rolls like night 3 of another. */
export const mix = (...parts: number[]): number => {
  let h = 0x811c9dc5
  for (const part of parts) {
    h ^= part | 0
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}
