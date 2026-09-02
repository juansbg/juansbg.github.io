import type { RoleId } from '../engine/roles'

/**
 * One sigil per role, drawn on a 24-unit grid in straight lines only:
 * horizontals, verticals and 45° diagonals. Square caps, mitred joins, a
 * 1.5-unit stroke. Nothing else in the language has a curve, so neither do
 * these. The ink is `currentColor`, so the wrapper decides: Neon on a dark
 * ground, Midnight on paper, the mark's own ink inside a filled mark
 * (docs/DESIGN.md, "Neon has one job").
 *
 * The drawings are the ones judged on docs/sigils.html. Keep both in step.
 */
export const SIGILS: Record<RoleId, string> = {
  KILLER: 'M2 16 H22 M7 16 V8 H17 V16 M7 12 H17',
  CONVERT: 'M3 20 H21 V9 L16.5 13 L12 5 L7.5 13 L3 9 Z',
  ROGUE: 'M3 21 L15 9 M12 6 L18 12 M15 9 L20 4',
  PICK_SIDE: 'M12 21 V12 L5 5 M12 12 L19 5',
  PLAIN: 'M4 11 L12 3 L20 11 V21 H4 Z M10 21 V15 H14 V21',
  INSPECT: 'M2 12 L12 5 L22 12 L12 19 Z M10 10 H14 V14 H10 Z',
  GUARD: 'M12 3 L20 6 V12 L12 21 L4 12 V6 Z',
  MEDIC: 'M9 3 H15 M10 3 V8 L6 14 V21 H18 V14 L14 8 V3 M6 16 H18',
  SURVIVE: 'M5 8 L12 13 L19 8 M5 14 L12 19 L19 14',
  SILENCE: 'M12 3 L16 9 L14 12 L18 16 L12 21 L6 16 L10 12 L8 9 Z',
  EXTRA_VOTE: 'M4 4 H20 V20 H4 Z M12 8 V16 M8 12 H16',
  PAIR: 'M3 8 H13 V18 H3 Z M11 6 H21 V16 H11 Z',
  PROTEGE: 'M3 12 L12 4 L21 12 H3 M12 12 V21 M12 21 H8 V18',
  SENSE: 'M6 7 H9 V10 H6 Z M11 4 H14 V7 H11 Z M16 7 H19 V10 H16 Z M8 13 H17 V20 H8 Z',
  AVENGE: 'M3 7 H21 V12 H10 V18 H5 V12 H3 Z M14 12 V15',
  MARTYR: 'M3 3 H21 V21 H3 Z M8 8 H16 V16 H8 Z M11 11 H13 V13 H11 Z',
  SWAP: 'M4 8 H17 M14 5 L17 8 L14 11 M20 16 H7 M10 13 L7 16 L10 19',
  PEEK: 'M9 4 H15 V9 L18 20 H6 L9 9 Z',
  SPLIT: 'M12 3 L17.6 20.2 L3 9.56 L21 9.56 L6.4 20.2 Z',
}

/**
 * The sigil as inline SVG. Decorative: the role's name is always nearby in
 * text, so the drawing is hidden from assistive tech rather than labelled
 * twice. Sized by its wrapper; `.sigil` makes it fill whatever holds it.
 */
export const sigilMarkup = (roleId: RoleId): string =>
  `<svg class="sigil" viewBox="0 0 24 24" data-sigil="${roleId}" aria-hidden="true" focusable="false"><path d="${SIGILS[roleId]}"/></svg>`
