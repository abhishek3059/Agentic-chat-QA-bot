# 🏛️ Council Deliberation: Rename to QA Assistant + Logo Mark & Watermark

## Meeting Details
- **Date:** 2026-09-12
- **Members:** The Architect, The Skeptic, The Pragmatist, The Researcher
- **Method:** 4 parallel `explore` subagents (independent contexts) + chairman synthesis
- **Trigger:** Final pre-ship phase — (1) rename product to "QA Assistant",
  (2) design brief: single-color SVG mark + translucent watermark behind chat

---

## The Questions
1. What exactly changes (and what must NOT change) when renaming to "QA Assistant"?
2. How should the logo mark be delivered given vanilla TS, no bundler, strict webview CSP?
3. Which mark concept fits the brief, and how is the watermark made legibility-safe?

---

## 🏗️ The Architect's Perspective
- **Rename:** freeze IDs (`name`, `contextQa.*` commands/config, view/container IDs,
  `getWebviewHtml` signature). Change display strings only: `displayName`,
  container/view titles, webview `<title>`, bot card header, notification text,
  README/docs H1 (keep an ID-compat note).
- **Asset:** new `src/ui/qaMark.ts` exporting the SVG inner markup + a
  `qaMarkSvg()` wrapper. `webviewHtml.ts` imports and injects it twice (header
  icon + watermark). Zero CSP/loader changes, mark is versioned and unit-testable.
  Keep the activity-bar codicon as-is.

## 🔴 The Skeptic's Perspective
- **Rename:** IDs are contract — renaming breaks keybindings, `when` clauses,
  stored settings, existing users. Display strings only.
- **Watermark:** 4% opacity alone fails under dense text and is ignored under
  `forced-colors` (solid blob). Requires: bottom-right cropped positioning
  (never centered), `forced-colors: display:none`, `aria-hidden`,
  `pointer-events:none`.
- **Drift:** standalone file + demo + webview copies will fork. Single source
  of truth required.
- **CSP:** inline `<svg>` is fine; `data:`-URI backgrounds are BLOCKED by
  `default-src 'none'`. Kills the CSS-background approach.
- **16px:** only bold geometric marks survive — 2px+ effective strokes, filled
  shapes, no fine detail.

## 🔧 The Pragmatist's Perspective
- Ship in 5 touches: `media/qa-mark.svg` as source of truth, rename labels in
  `package.json`, wire via `asWebviewUri` + `localResourceRoots`, use `<img>`
  twice in the template, standalone `media/demo.html`. Deliberately no bundler,
  no ID renames, no external assets.

## 📚 The Researcher's Perspective
- **VS Code:** `viewsContainers.activitybar[].icon` must be a **file path** —
  codicons are not allowed there (current `$(comment-discussion)` is invalid).
  Point it at the real SVG file.
- **Concepts** (64-grid, currentColor, padding 8, stroke ≥ 6):
  1. *Bracket + Extracted Node* — open bracket isolates rows, one solid dot =
     the understood piece. "One piece, resolved."
  2. *Lens on One Point* — 3×3 fragment dots + focus ring. "Many fragments,
     one in focus."
- **Watermark CSS:** fixed layer, `place-items:center`→(chairman: bottom-right
  per Skeptic), `opacity:.04`, chat at `z-index:1`; never put
  `transform/filter` on ancestors (breaks `fixed`); color from theme variable,
  no animation.

---

## 📊 Chairman's Synthesis & Decisions

| # | Decision | Rationale | Overruled |
|---|----------|-----------|-----------|
| 1 | Rename display strings only; freeze all IDs | Unanimous — IDs are API contract | — |
| 2 | `src/ui/qaMark.ts` is the single source of truth (inline SVG string) | Zero CSP/loader changes; testable (Architect). `data:`-URI blocked, `<img>` needs plumbing (Skeptic) | Pragmatist's `<img>`+`asWebviewUri` |
| 3 | `media/qa-mark.svg` + `media/watermark-demo.html` carry copies stamped "generated from `qaMark.ts`" | Standalone deliverables required by brief; activity-bar icon needs a real file (Researcher); drift controlled by documented rule | — |
| 4 | Mark = Bracket + Extracted Node (concept 1) | Best 16px survival (bold bracket + solid dot), closest to "fragment made legible" | Concept 2 (ring+dots busier at 16px) |
| 5 | Watermark: fixed, bottom-right cropped, opacity .05, `aria-hidden`, `pointer-events:none`, hidden under `forced-colors` | Skeptic's legibility hardening over Researcher's centered placement | Centered placement |
| 6 | Activity-bar container icon → `media/qa-mark.svg` | Current codicon value is invalid per platform convention (Researcher) | Architect's "keep codicon" |

### Rationale (one line)
An open bracket isolates a fragment while a single solid node marks it
understood — one piece, resolved.

### Risks & Mitigations
- **SVG copy drift** (`qaMark.ts` vs `media/` vs demo): header comments + ADR-019
  rule that `qaMark.ts` is canonical.
- **Watermark vs dense text:** bottom-right cropped placement + 5% opacity +
  `forced-colors` kill-switch; chat content stacked above.
- **Marketplace name collision** ("QA Assistant" is generic): IDs and publisher
  unchanged; revisit only if publishing collides.
