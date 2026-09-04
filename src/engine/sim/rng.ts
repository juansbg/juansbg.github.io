import type { Random } from '../deal'

// The generator is the engine's own (engine/rng.ts): one implementation, so
// a simulated game and a real one roll their clues the same way.
export { seeded } from '../rng'

/** One element, uniformly. The list must not be empty. */
export const pick = <T>(items: readonly T[], random: Random): T =>
  items[Math.floor(random() * items.length)] as T
