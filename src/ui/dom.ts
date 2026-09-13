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
    startViewTransition?: (cb: () => void) => {
      finished: Promise<void>
      ready: Promise<void>
      updateCallbackDone: Promise<void>
    }
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
    const t = doc.startViewTransition(paintOnce)
    t.finished.catch(paintOnce)
    // A transition started while another is in flight aborts the first, and
    // every one of its three promises rejects. Only `finished` is ours to
    // act on; the other two are still rejections nobody handles, which the
    // browser reports as uncaught — one to three per deal, enough noise to
    // bury a real exception. Swallow them deliberately.
    t.ready.catch(() => {})
    t.updateCallbackDone.catch(() => {})
  } catch {
    paintOnce()
  }
}

/**
 * The edge of a scrolling region says whether there is more.
 *
 * The page itself never scrolls, so a handful of regions scroll instead, and
 * on a short phone one of them clips mid-tile or mid-sentence. Cut with a
 * hard edge that reads as a paint fault rather than as a list, which is how
 * a seven-seat day screen came to show three seats and a morning report
 * sliced through a word. Every region carries `data-scroll` naming the edges
 * that have something past them, and the stylesheet fades exactly those: a
 * region that fits keeps the clean edge it always had.
 */
const SCROLLERS = [
  '.report--scroll',
  '.table',
  '.log',
  '.history',
  '.ledger',
  '.paper',
  '.name-list',
  '.dealt',
  '.menu',
  '.reveal__card',
  '.inspect__scroll',
].join(',')

const edgesOf = (el: HTMLElement): string => {
  // Sub-pixel heights round the wrong way on a scaled viewport, so a region
  // that fits can measure a stray fraction of overflow; a pixel of slack
  // keeps a fitting region unmarked.
  const slack = el.scrollHeight - el.clientHeight
  if (slack <= 1) return ''
  const up = el.scrollTop > 1
  const down = el.scrollTop < slack - 1
  return [up ? 'up' : '', down ? 'down' : ''].filter(Boolean).join(' ')
}

const mark = (el: HTMLElement): void => {
  const next = edgesOf(el)
  if (el.dataset['scroll'] !== next) el.dataset['scroll'] = next
}

/**
 * Marks every scrolling region under `root`. Call it after each paint, the
 * way `fitTables` is called: the elements are new on every paint, so the
 * scroll listener each one gets goes with it.
 */
export const markEdges = (root: ParentNode): void => {
  root.querySelectorAll<HTMLElement>(SCROLLERS).forEach((el) => {
    mark(el)
    // A resize marks the same elements again; one listener each, not one per
    // call. The elements are replaced on every paint, so the flag and the
    // listener go with them.
    if (el.dataset['edged'] === undefined) {
      el.dataset['edged'] = ''
      el.addEventListener('scroll', () => mark(el), { passive: true })
    }
  })
}

/**
 * A short haptic tap where the platform supports it. A pattern is
 * alternating buzz and rest lengths, for the few moments that deserve more
 * than a tick: the clock running out, the verdict.
 */
export const buzz = (pattern: number | number[] = 12): void => {
  try {
    // Reduced motion covers the phone shaking as much as the screen.
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
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

/**
 * Swipe a sheet down to put it away.
 *
 * Every sheet in the app wears the grab handle a phone user reads as "drag
 * me", and none of them could be dragged: the one gesture everybody tries
 * first did nothing, anywhere. The handle is not decoration, so it is wired
 * rather than removed — the narrator is one-handed in the dark, and a thumb
 * already resting at the bottom of the screen should not have to travel to a
 * Close button.
 *
 * The gesture lives on the sheet's head, never on its body: the panels
 * scroll, and a drag that fought the scroll would be worse than no drag. Call
 * it after every paint, like `markEdges`; the elements are new each time and
 * the listeners go with them.
 */
export const bindSheetDrag = (root: ParentNode, dismiss: () => void): void => {
  root.querySelectorAll<HTMLElement>('.sheet__head').forEach((head) => {
    const panel = head.closest<HTMLElement>('.sheet__panel')
    if (panel === null) return
    let from: number | null = null

    const settle = (): void => {
      from = null
      panel.style.removeProperty('transform')
      panel.style.removeProperty('transition')
    }

    head.addEventListener('pointerdown', (event) => {
      from = event.clientY
      panel.style.transition = 'none'
      head.setPointerCapture(event.pointerId)
    })

    head.addEventListener('pointermove', (event) => {
      if (from === null) return
      // Down only: an upward drag on a sheet that is already at the top of
      // its travel should not lift it off the bottom edge.
      panel.style.transform = `translateY(${Math.max(0, event.clientY - from)}px)`
    })

    head.addEventListener('pointerup', (event) => {
      if (from === null) return
      // A quarter of the panel, and never more than a thumb's reach: a tall
      // sheet must not need a longer gesture than a short one.
      const far = Math.min(panel.offsetHeight * 0.25, 96)
      const gone = event.clientY - from > far
      settle()
      if (gone) dismiss()
    })

    head.addEventListener('pointercancel', settle)
  })
}
