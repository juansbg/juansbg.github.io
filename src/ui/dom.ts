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
  if (reduced || typeof doc.startViewTransition !== 'function') {
    paint()
    return
  }
  doc.startViewTransition(paint)
}

/** A short haptic tap where the platform supports it. */
export const buzz = (ms = 12): void => {
  try {
    navigator.vibrate?.(ms)
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
