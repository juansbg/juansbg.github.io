/**
 * Saying things to sockets that may already be gone.
 *
 * The hibernation API hands back every socket carrying a tag, and some of
 * them are already closing: a phone whose battery died, somebody who walked
 * out of the room, a television that was switched off. `send()` on one of
 * those throws — and every broadcast in this file was a bare `for` loop, so
 * the throw stopped the loop where it stood. **Everyone after the dead socket
 * never heard the message**, and the exception escaped into `fetch`.
 *
 * That is worse than a crash on its own, because it is silent and it is
 * order-dependent: a room with one stale phone in the list simply stopped
 * being told the narrator had arrived, and which sockets missed out depended
 * on where the dead one happened to sit. Under eight concurrent tables it
 * also killed the worker, twice.
 *
 * No critic found this, and none could have: it needs many rooms and sockets
 * churning at once, and a playthrough is one tidy table. The load found it.
 *
 * These are deliberately free of Workers types — they need nothing but
 * `send` and `close` — so they can be tested without a runtime.
 */

/** As much of a WebSocket as fanning out actually needs. */
export interface Sendable {
  send(text: string): void
  close(code?: number, reason?: string): void
}

/**
 * Say one thing to one socket. Never throws.
 *
 * A socket that refuses is closed rather than left in the set, so the runtime
 * stops handing it back on the next broadcast. Closing something already
 * closed is not worth an exception either, so that is guarded too.
 */
export const say = (ws: Sendable, text: string): boolean => {
  try {
    ws.send(text)
    return true
  } catch {
    try {
      ws.close(1011, 'gone')
    } catch {
      // There is nothing further to do to it.
    }
    return false
  }
}

/**
 * Say one thing to everyone listening, and return how many heard it.
 *
 * One dead socket cannot silence the rest, whatever order it arrives in.
 */
export const tell = (sockets: Iterable<Sendable>, text: string): number => {
  let heard = 0
  for (const ws of sockets) if (say(ws, text)) heard += 1
  return heard
}

/**
 * Close a whole set of sockets, and never let a dead one take the rest with it.
 *
 * The same shape as `tell`, for the operations that end sockets rather than
 * speak to them: a room expiring, a narrator closing the evening, a phone or a
 * screen being replaced by its own newer socket. These were the last callers
 * still looping by hand.
 *
 * Stated plainly, because the commit that routes them through here is
 * consistency and not a bug fix: **nobody has shown that closing an already
 * closed socket throws here.** It is guarded because every other multi-socket
 * operation in the relay is, and because the cost of being wrong about it is a
 * room that half-ends — some screens told the evening is over and the rest
 * left watching a table that will never move again.
 */
export const shut = (sockets: Iterable<Sendable>, code: number, reason: string): number => {
  let closed = 0
  for (const ws of sockets) {
    try {
      ws.close(code, reason)
      closed += 1
    } catch {
      // Already gone, which is the outcome this was asking for.
    }
  }
  return closed
}
