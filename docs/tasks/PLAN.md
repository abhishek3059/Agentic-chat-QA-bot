# Implementation Plan — Council Recommendations (Tasks)

## Document Details
- **Created:** 2026-09-12
- **Source:** Council Meeting 1 (architecture review) + Council Meeting 2 (scope guardrail debate)
- **Status:** Phases A–C complete (packaged 2026-09-12); manual F5 smoke test left to the user
- **Tracking:** Phase A → B → C ✅, then Phase D (future)

---

## Overview

Two council sessions produced a unified plan:

1. **Meeting 1 — Architecture Review** (4 members, `general` subagent type):
   Agreed the core pipeline (in-memory array + hybrid RRF + structural chunking +
   clean XML injection) is sound. Flagged SidebarProvider as a God Object,
   missing cancellation semantics, no LLM retry, silent embedding failures,
   BM25 re-tokenization on every query, and ONNX cold-start risk.
2. **Meeting 2 — Scope Guardrail Debate** (4 members, `explore` subagent type):
   3 of 4 members agreed to **remove the scope pre-check gate entirely**.
   `isMetaQuery()` (30+ regex patterns) is deleted. The LLM's own system-prompt
   refusal becomes the single relevance judge. This matches every major RAG
   product (NotebookLM, Perplexity, ChatGPT file upload) and the research
   consensus: *filter chunks, not questions* (Self-RAG, CRAG, ScoreGate).

---

## Phase A: Pre-Ship Cleanup (blocking packaging)

| # | Task | File(s) | Details | Council source |
|---|------|---------|---------|----------------|
| A1 | Remove unused `sharp` dependency | `package.json` | Delete `"@img/sharp-win32-x64"` from `dependencies`. Saves ~12 MB from the VSIX. Verify with `npm run compile`. | Pragmatist |
| A2 | Add generation cancellation guard | `src/ui/SidebarProvider.ts` | Add `private generationCounter = 0`. Increment in `setCapturedResponse`. Snapshot at start of `handleUserQuestion`; discard stale results when the counter changed. Fixes wrong-context answers on rapid captures. | Architect + Skeptic |
| A3 | Add LLM retry with exponential backoff | `src/llm/generator.ts` | Retry 429/5xx up to 3 attempts (1s, 2s, 4s + jitter). Never retry 401. Applies to both `generateAnswer` and `generateAnswerStreaming`. | Architect |
| A4 | Surface embedding failures to UI | `src/ui/SidebarProvider.ts` | In the `embedChunks` catch block, post a webview warning (`showError` / assistant message) instead of only `console.error`. Retrieval degrades to BM25-only visibly. | Architect + Skeptic |
| A5 | Remove scope guardrail | `src/rag/retriever.ts`, `src/ui/SidebarProvider.ts`, `test/unit/retriever.test.ts` | Delete `isMetaQuery()` + scope pre-check block. Delete `DEFAULT_SCOPE_THRESHOLD`. Remove `isOutOfScope` early-exit in `handleUserQuestion`. Keep `isOutOfScope` field in `RetrievalResult` as always-`false` for interface compatibility. Remove guardrail unit tests. | Meeting 2 consensus |
| A6 | Strengthen system prompt refusal | `src/llm/prompt.ts` | Make rule 3 explicit: when retrieved context does not address the question, say so plainly instead of answering from general knowledge without disclosure. | Skeptic mitigation |

**Definition of Done:** `npm run compile` clean, `npm test` green, no `isMetaQuery` references remain.

---

## Phase B: Reliability Hardening

| # | Task | File(s) | Details | Council source |
|---|------|---------|---------|----------------|
| B1 | Pre-warm ONNX model on activation | `src/extension.ts` | Fire-and-forget `getEmbeddingPipeline()` in `activate()` with `try/catch` + log. Eliminates first-query cold-start (model download + ONNX init). | Skeptic |
| B2 | Cache tokenized chunks during ingestion | `src/ui/SidebarProvider.ts`, `src/rag/retriever.ts` | Store `tokenizeCodeAndProse()` results at capture time; pass pre-tokenized arrays into `computeBM25Scores` via optional param. Avoids re-tokenizing all chunks on every query. | Architect |

**Definition of Done:** Activation triggers background model load; BM25 path accepts cached tokens.

---

## Phase C: Packaging & Smoke Test ✅ (packaged; manual smoke test pending)

| # | Task | File(s) | Details | State |
|---|------|---------|---------|-------|
| C1 | Package extension | — | `@vscode/vsce package` → `agentic-chat-qa-bot-0.1.0.vsix` (3,083 files, 76 MB incl. ONNX runtime) | ✅ Done 2026-09-12 |
| C2 | Smoke test in Extension Development Host | — | Install `.vsix`, F5: sidebar renders, capture works, ONNX loads, API-key prompt appears, streaming works, off-topic question gets an LLM-level refusal (not a pre-filter banner) | ⏳ User action (see checklist below) |
| C3 | Verify tests pass | — | `npm test` + `npm run compile` clean | ✅ 51 passing |

### Packaging fixes applied during C1
- Added `.vscodeignore` (excludes `src/`, `test/`, `docs/`, `.agents/`, `.claude/`,
  `scripts/`, `tsconfig.json`, maps, the `.vsix` itself).
- Installed `@vscode/vsce` as a dev dependency for repeatable packaging.
- Packaged WITH `node_modules` (first attempt used `--no-dependencies`, which would
  have shipped a broken extension — the ONNX runtime is required at activation).
- Deleted stale `out/ui/panelManager.js(.map)` left over from the ADR-015 rename.
- Verified: `media/qa-mark.svg` + demo + all compiled `out/` files inside the VSIX;
  rendered webview HTML contains QA Assistant branding, watermark layer,
  `forced-colors` rule, and zero "Agentic" leftovers.

### C2 smoke-test checklist (run in VS Code)
1. `code --install-extension agentic-chat-qa-bot-0.1.0.vsix` (or Extensions view → Install from VSIX).
2. Press F5 (or reload) → QA Assistant icon appears in the Activity Bar.
3. Copy any AI response → `Ctrl+Alt+Q` → sidebar shows scoped context preview.
4. Ask "Explain this simpler" → streams a grounded answer (proves ADR-017: no gate).
5. Ask an off-topic question → polite LLM-level refusal (not a pre-filter banner).
6. Check the faint bracket-node watermark behind the chat; toggle light/dark theme.

---

## Phase D: Future Improvements (non-blocking, logged)

| # | Task | Rationale |
|---|------|-----------|
| D1 | Extract `RagPipeline` service from `SidebarProvider` | 378-line God Object: chunks/vectors/indexing/retrieval deserve their own class |
| D2 | Extract `ChatSession` service | Move chatHistory, intent classification, message assembly out of the provider |
| D3 | Optional JSON persistence for captured chunks | Serialize chunks to `globalState` so context survives reloads |
| D4 | Add `contextQa.captureCount` usage counter | Ship-confidence signal without telemetry |

---

## Execution Order

```text
Phase A (cleanup) → Phase B (reliability) → Phase C (ship)
```

Each phase is independently testable. Phases A–B in one session; Phase C is the ship gate.

## Council Decision Log

- `docs/council-meetings/meetings_1.md` — Context rigidity vs conversational usefulness.
- `docs/council-meetings/meetings_2.md` — Architecture review + scope guardrail removal.
- `docs/decisions.md` — ADR-017 (scope gate removal), ADR-018 (cancellation + retry + pre-warm).
