/** Escapes text before it goes near innerHTML. Player names are user input. */
export const esc = (value: string): string =>
  value.replace(/[&<>"']/g, (c) =>
    c === '&' ? '&amp;'
    : c === '<' ? '&lt;'
    : c === '>' ? '&gt;'
    : c === '"' ? '&quot;'
    : '&#39;',
  )

/**
 * Swaps screen content with a View Transition when the browser has one.
 *
 * Falls back to a plain swap, so a browser without the API still works — the
 * animation is an enhancement, never a requirement. Reduced-motion users get
 * near-zero durations from the tokens, so this stays honest for them too.
 */
export const swap = (paint: () => void): void => {
  const doc = document as Document & {
    startViewTransition?: (cb: () => void) => { finished: Promise<void> }
  }

  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  // A hidden tab cannot run a transition, and starting one while another is
  // in flight aborts it with InvalidStateError. In both cases the callback
  // must still run — otherwise the screen simply stops updating, which is
  // what happened when the app was backgrounded mid-render.
  if (reduced || document.hidden || typeof doc.startViewTransition !== 'function') {
    paint()
    return
  }
  let painted = false
  const paintOnce = (): void => {
    if (painted) return
    painted = true
    paint()
  }
  try {
    doc.startViewTransition(paintOnce).finished.catch(paintOnce)
  } catch {
    paintOnce()
  }
}

/**
 * A short haptic tap where the platform supports it. A pattern is
 * alternating buzz and rest lengths, for the few moments that deserve more
 * than a tick: the clock running out, the verdict.
 */
export const buzz = (pattern: number | number[] = 12): void => {
  try {
    navigator.vibrate?.(pattern)
  } catch {
    // Unsupported; silence is the correct fallback.
  }
}

export const on = <K extends keyof HTMLElementEventMap>(
  root: ParentNode,
  selector: string,
  type: K,
  handler: (event: HTMLElementEventMap[K], element: HTMLElement) => void,
): void => {
  root.querySelectorAll<HTMLElement>(selector).forEach((element) => {
    element.addEventListener(type, (event) => {
      handler(event as HTMLElementEventMap[K], element)
    })
  })
}
