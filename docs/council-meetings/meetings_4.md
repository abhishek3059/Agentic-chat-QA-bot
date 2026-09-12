# Council Meeting 4 — OpenRouter 400+ Model List UX

**Date:** 2026-09-12
**Question:** OpenRouter's `/v1/models` returns 400+ models in the sidebar picker. How to make it feel curated without breaking provider-agnosticism?
**Method:** 4 parallel subagent perspectives (Architect, Skeptic, Pragmatist, Researcher) + industry research (Cline, Roo Code, Continue, Copilot). User chose the recommended option.

## Perspectives

### A — The Architect
Three-layer pipeline: enrich `ModelItem` with pricing/context metadata at parse time, add a pure `filterModels(models, provider)` in `modelList.ts`, cap display at ~50. Filtering belongs server-side (testable), never in the CSP-constrained webview. Avoid hardcoded allowlists.

### B — The Skeptic (red team)
Don't filter — every filter rule is an exclusion rule with an invisible failure mode (user never finds `mistralai/mixtral-8x7b-instruct`, blames the tool). Pricing rotates, `context_length` is unreliable, curated lists rot. It is 80% a UX problem: group by `owned_by`, show counts, keep the text filter.

### C — The Pragmatist
Group by namespace prefix in `renderModelList()` — ~15 lines of JS, zero backend changes. Show a count badge. Cut first: the badge; collapsibles can be flat headers. Do not build provider-specific filter modules.

### D — The Researcher (key finding)
OpenRouter's `/v1/models` accepts server-side params (`output_modalities=text`, `sort=most-popular`, `supported_parameters`, `max_price`, `q`, `model_authors`). Other extensions: **Cline** (flat 400+ list + Fuse.js fuzzy search + star favorites), **Roo Code** (same, + pinning), **Continue** (no auto-discovery, manual config), **Copilot** (curated ~10-15 + Auto routing). None group or filter — the industry pattern is **search + pin**.

## Peer review (chairman synthesis of cross-critiques)
- Architect's `filterModels()` accepted as the right seam *if* filtering is ever needed — but Skeptic's invisibility argument won: no exclusion rules in v1.
- Pragmatist's grouping is cheap but Researcher showed grouping solves nothing Cline users asked for — search + pin is the proven pattern.
- Consensus: follow the industry pattern. Server-side params stay a documented future option (no code now).

## Decision
**Search + Pin** (user-confirmed): debounced substring search on `id` + `name`, star/pin favorites to top persisted via webview state, count badge. Zero backend changes, zero exclusion risk. Logged as ADR-021.
