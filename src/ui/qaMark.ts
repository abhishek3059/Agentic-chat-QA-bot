/**
 * src/ui/qaMark.ts
 * ----------------------------------------------------------------
 * QA Assistant logo mark — SINGLE SOURCE OF TRUTH for the artwork.
 * ----------------------------------------------------------------
 * Concept: "one piece, resolved." An open bracket isolates a fragment
 * while a single solid node marks it understood. Geometric, single
 * color via `currentColor`, no gradients, one stroke weight.
 *
 * Rules (ADR-019):
 * - `media/qa-mark.svg` and `media/watermark-demo.html` carry copies of
 *   this exact markup. If the mark changes, update it HERE first, then
 *   re-export the copies. Never edit the copies by hand.
 * - viewBox is square (0 0 64 64) with generous padding; strokes stay
 *   >= 6 units so the mark survives 16px rendering.
 */

/** Inner SVG artwork (no <svg> wrapper). Uses currentColor only. */
export const QA_MARK_INNER: string =
  '<path d="M25 13 H15 V51 H25"/>' +
  '<path d="M33 25 H51"/>' +
  '<circle cx="42" cy="41" r="7.5" fill="currentColor" stroke="none"/>';

/**
 * Wraps the mark in an <svg> element.
 * @param size rendered width/height in px (SVG scales via viewBox)
 * @param label accessible label; empty string marks it decorative (aria-hidden)
 */
export function qaMarkSvg(size: number, label = 'QA Assistant mark'): string {
  const aria = label
    ? ` role="img" aria-label="${label}"`
    : ' aria-hidden="true"';
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"` +
    ` width="${size}" height="${size}" fill="none" stroke="currentColor"` +
    ` stroke-width="7" stroke-linecap="round" stroke-linejoin="round"${aria}>` +
    QA_MARK_INNER +
    `</svg>`
  );
}
