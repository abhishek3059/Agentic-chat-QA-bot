# PROGRESS.md

Append-only. Newest entry on top. Do not delete or rewrite earlier
entries — if a decision changes, add a new entry saying so and why.

---

## Template for new entries
### [YYYY-MM-DD] Session N — <one-line summary>
**Built:** what actually got written/working this session.
**Decided:** any decision made and the reasoning (so it isn't re-litigated).
**Wrong/wasted time on:** anything that seemed right but wasn't — the
  exact failure, not just "X didn't work."
**Known issues:** anything left broken or fragile, and where.
**Next:** the next concrete step, not a vague direction.

---

### [2026-09-12] Session 13 — Marketplace Prep: CHANGELOG + Walkthrough + README

**Built:**
- `CHANGELOG.md` (Keep-a-Changelog, 0.1.0 entry covering Sessions 1–12).
- Get Started walkthrough (`contributes.walkthroughs` + 4 step files under
  `walkthroughs/`): provider → API key → capture → ask, with command links.
  Shows on the Welcome page after install.
- Manifest polish: `keywords`, `license: MIT`, dark `galleryBanner`.
- README: new Install + 2-minute Getting Started + What's New sections;
  fixed the architecture diagram's removed scope gate (ADR-017) and the stale
  "Scope Pre-Check" step text.
- Verified via `vsce ls`: CHANGELOG + all 4 walkthrough files pack into the vsix.
  72 tests passing, compile clean.
**Known issue / follow-up:** marketplace `icon` not set — `media/qa-mark.svg`
  is SVG and the Marketplace needs a PNG. Rasterize to `media/qa-icon.png`
  (128×128) and add `"icon"` before publishing.
**Next:** commit + push to GitHub, then `vsce publish`.

---

### [2026-09-12] Session 12 — Phase F: Model Picker Search + Pin (ADR-021)
**Built (plan: `.opencode/plans/MODEL-PICKER-UX-PLAN.md`, Council Meeting 4):**
- Convened 4-person council (Architect/Skeptic/Pragmatist/Researcher subagents)
  on the OpenRouter 400+ list problem; researched Cline, Roo Code, Continue,
  Copilot. Industry pattern: search + pin, never filter/group. User confirmed.
- Webview-only change in `src/ui/webviewHtml.ts`: debounced (150ms) re-render
  search over `id` + `name`; star/pin favorites persisted via
  `vscode.getState()`; favorites sort first; count badge ("47 of 312 models");
  autofocus on search (free-text input on fetch failure). Zero backend changes.
- Tests: `webviewModels.test.ts` extended (count element, favorites wiring,
  debounce, badge text). **72 passing**, compile clean.
**Decided:** no exclusion rules (Skeptic's invisibility argument); re-render over
  DOM hide/show (required for favorites-first sort); skipped clear button
  (Escape closes); server-side OpenRouter params stay a future option.
**Next:** repackage `.vsix` + install on machine, user smoke-tests pin/search.

---

### [2026-09-12] Session 11 — Phase E: Provider Presets + Live Model Picker (ADR-020)
**Built (plan: `.opencode/plans/PROVIDER-UX-PLAN.md`, phases E1→E3):**
- E1: `contextQa.provider` enum setting (openai/openrouter/deepseek/ollama/custom);
  `apiBaseUrl` now custom-only (default `""`); new `src/llm/providers.ts` single
  preset table + pure resolvers; `SidebarProvider` resolves URLs via preset;
  API-key prompt de-branded; OpenRouter referral headers conditional in generator.
- E2: new `src/llm/modelList.ts` (`GET /models`, 8s timeout, never throws);
  sidebar model selector rebuilt as an in-webview dropdown (spinner, filter box,
  display names, current-model highlight, free-text fallback). New protocol:
  `fetchModels` → `modelsLoading`/`modelsList`/`modelsError`; `changeModel`
  accepts `modelId`. **71 passing** (51 + 20 new), compile clean.
- E3: `contextQa.configureProvider` quick-pick command + config-change watcher
  refreshing the sidebar on Settings edits.
**Decided (refinements over the plan):**
- Unknown provider ids fall back to the OpenRouter preset instead of an empty URL.
- Single `resolveExtraHeaders()` helper instead of inline conditionals in two places.
- Picker opens **upward** (`bottom: 100%`) — the plan's `top: 100%` would render
  off-screen below the footer.
- AbortController timeout (extension-host safe) over `AbortSignal.timeout`;
  `parseModelsResponse` split out for HTTP-free unit tests; added filter input
  for 400-item OpenRouter lists; `listProviderOptions()` keeps the provider
  table in one place.
**Wrong/wasted time on:** one test assertion assumed insertion order instead of
  the alphabetical sort the implementation guarantees — fixed the test, not the code.
**Known issues:** none. Live model fetch needs a real key/provider to smoke-test.
**Next:** user smoke-tests provider switch + model picker, then repackage `.vsix`.

---

### [2026-09-12] Session 10 — Phase C: Packaging (.vsix) + Ship Verification
**Built:**
- Installed `@vscode/vsce` (dev dep) and packaged `agentic-chat-qa-bot-0.1.0.vsix`
  (3,083 files, 76 MB — bulk is the ONNX runtime in `node_modules`, required at activation).
- Added `.vscodeignore` (drops `src/`, `test/`, `docs/`, `.agents/`, `.claude/`,
  `scripts/`, `tsconfig.json`, maps, `.vsix` itself from the package).
- Deleted stale `out/ui/panelManager.js(.map)` left from the ADR-015 rename.
- Verified VSIX contents (`media/qa-mark.svg`, demo, all compiled `out/` files) and
  rendered webview HTML server-side (QA Assistant branding, watermark layer,
  `forced-colors` rule present, zero "Agentic" leftovers).
- Final `npm test`: **51 passing**, compile clean. Updated `docs/tasks/PLAN.md`
  (Phase C status + C2 checklist).
**Decided:**
- Ship WITH `node_modules`: the first `--no-dependencies` package would have been
  broken at activation (ONNX import). 76 MB is the honest cost of local embeddings.
- Stale `out/` artifacts are a real hygiene item — `tsc` never deletes renamed outputs.
**Wrong/wasted time on:**
- `node ./node_modules/@vscode/vsce/out/vsce` — wrong entry path; the bin is the
  extensionless `node_modules/@vscode/vsce/vsce` file.
- One `node -e` quoting failure in PowerShell (nested double quotes) — used
  single-quoted outer command on retry.
**Known issues:** none in packaging. Manual F5 smoke test still needs the user.
**Next:** user runs the C2 checklist (install VSIX → F5 → capture → explain-simpler →
  off-topic refusal → watermark/theme check), then ship.

---

### [2026-09-12] Session 9 — Final Pre-Ship Phase: Rename to QA Assistant + Logo & Watermark (ADR-019)
**Built:**
- Council Meeting 3 (`docs/council-meetings/meetings_3.md`): 4 parallel perspectives
  (rename scope, asset delivery, watermark safety, platform conventions) + chairman
  synthesis. Unanimous: display strings only, freeze all IDs.
- Renamed user-facing strings to "QA Assistant": `displayName`, container/view
  titles, command + config titles, webview `<title>`, bot card headers, status bar,
  notifications, logs, README H1. IDs frozen (`agentic-chat-qa-bot`, `contextQa.*`).
- Created `src/ui/qaMark.ts` (mark single source of truth, bracket-node concept),
  `media/qa-mark.svg` (standalone copy, now the real activity-bar container icon —
  the old `$(comment-discussion)` value was not a valid container icon),
  `media/watermark-demo.html` (dark+light legibility proof).
- Wired mark into webview: 16px header icon, 12px card-header icons, 300px fixed
  bottom-right cropped watermark (opacity .05, `aria-hidden`, `pointer-events:none`,
  chat stacked above, `forced-colors` kill-switch, no animation).
- Added `test/unit/qaMark.test.ts` (6 tests). **51 passing**, compile clean.
- Logged ADR-019, updated `docs/flow.md` file table.
**Decided:**
- Inline SVG string over `<img>`+`asWebviewUri`: `data:`-URIs are CSP-blocked and
  the `<img>` route needs extra plumbing; inline needs zero infrastructure changes.
- Bracket + Extracted Node over Lens concept: bolder at 16px, closest to the brief.
- Bottom-right cropped watermark over centered: legibility under dense text.
**Wrong/wasted time on:** one `python3` shell call broke on the `&` in the repo
  path (PowerShell call operator) — used `edit` with `replaceAll` instead; `workdir`
  param avoids the issue for read-only commands.
**Known issues:** `media/` copies can drift from `qaMark.ts` — controlled by header
  comments + ADR-019 rule (canonical source documented).
**Next:** `vsce package` + F5 smoke test, then ship.

---

### [2026-09-12] Session 8 — RAG Architecture Report for First-Time RAG Learning
**Built:** created `docs/RAG-ARCHITECTURE-REPORT.md` — 11-section report covering
  the 5-stage pipeline, 7 challenges with workarounds (code-destroying splitters,
  identifier-blind embeddings, stop-word BM25 poisoning, scope-gate saga, ONNX
  cold start, stale-vector races, native-dependency breakage), plus retry/token-cache
  notes and 7 lessons for the next RAG project. Verified `npm run compile` clean,
  `npm test` 45 passing.
**Decided:** report is narrative + grounded (exact constants: 200/256 tokens,
  384d, RRF k=60 normalized by 2/61, BM25 k1=1.2/b=0.75, retry 3× 1s/2s/4s+jitter).
**Wrong/wasted time on:** none.
**Known issues:** none new.
**Next:** Phase C — `vsce package` + F5 smoke test.

### [2026-09-12] Session 7 — Council Plan Execution: Scope Gate Removal + Reliability (ADR-017/ADR-018)
**Built:**
- Created `docs/tasks/PLAN.md`: phased implementation plan from both council meetings.
- Created `docs/council-meetings/meetings_2.md`: full architecture-review + scope-gate deliberation record (4 members, peer review, chairman synthesis).
- Removed scope guardrail: deleted `isMetaQuery()` + pre-check from `src/rag/retriever.ts`, removed `isOutOfScope` early-exit from `src/ui/SidebarProvider.ts`; `isOutOfScope` kept as always-`false` for interface compat.
- Added `generationCounter` cancellation guard in `SidebarProvider.ts` (capture/indexing/question/render all check it).
- Added `fetchWithRetry` + `isRetryableStatus` in `src/llm/generator.ts` (3 attempts, 1s/2s/4s + jitter, 429/5xx only, never 401/AbortError).
- Embedding failures now post a visible webview warning (BM25-only degradation disclosed).
- Cached `tokenizeCodeAndProse()` results at capture time; `computeBM25Scores` accepts optional `preTokenizedChunks`.
- ONNX pre-warm fire-and-forget in `src/extension.ts` `activate()`.
- Strengthened `SYSTEM_INSTRUCTION` rule 3: model must disclose when context doesn't address the question; explanations/summaries/alternatives explicitly in scope.
- Removed unused `@img/sharp-win32-x64` from `package.json`.
- Updated tests: rewrote 3 gate tests into pass-through tests, added pre-tokenized ranking test, `isRetryableStatus` test, ADR-017 prompt test, rewrote live-simulation Step 4. **45 passing.**
- Updated `docs/decisions.md` (ADR-017, ADR-018), `docs/flow.md` (S3/sequence/Trace D/file table, plus stale `panelManager.ts` filename fix).
**Decided:**
- ADR-017: filter chunks, not questions — matches NotebookLM/Perplexity/ChatGPT precedent + Self-RAG/CRAG/ScoreGate consensus; Skeptic's hallucination concern handled at prompt layer.
- ADR-018: counter-based (not AbortController) cancellation — simpler, covers wrong-context answers at every stage.
- Kept `scopeThreshold` field in `RetrieverOptions` as deprecated (no interface cascade).
**Wrong/wasted time on:**
- `default.grep`/`default.glob` tools broken in this environment (Expand-Archive module failure); used `Select-String` via `bash` instead. Same for file listing.
- First `edit` on `generator.ts` fetch block failed with multiple matches — the batch and streaming functions share identical code; used `replaceAll`.
**Known issues:**
- `isOutOfScope` field + `reason` still exist in types (always false) — cleanup deferred to Phase D.
- SSE truncation detection (council B3) not implemented — streaming fallback to batch covers most cases.
- `vsce package` + F5 smoke test not yet run (Phase C).
**Next:** Phase C — `npx @vscode/vsce package`, install + F5 smoke test (sidebar, capture, ONNX load, key prompt, streaming, off-topic LLM-level refusal).

### [2026-09-11] Session 5 — Frontier-Grade Conversational Engine, Real-Time SSE Streaming & Intent Routing
**Built:**
- Refactored `src/llm/prompt.ts`:
  - Clean semantic XML context injection (`<context><source id="...">...</source></context>`) omitting similarity scores to avoid tone corruption.
  - Eliminated `[Chunk X]` citations in prose and removed artificial zone cards (`📌 From Captured Response:` vs `🌐 Deep-Dive & Implementation:`).
  - Added query intent classification (`classifyQueryIntent` covering `factual`, `explain`, `code`, `meta`).
  - Added dynamic intent directives (`buildIntentDirective`).
  - Added intent-calibrated temperature profiles (`TEMPERATURE_PROFILES`: $T=0.20$ code, $T=0.35$ factual, $T=0.55$ explain, $T=0.50$ meta).
  - Added concrete few-shot response style examples to `SYSTEM_INSTRUCTION`.
- Enhanced `src/llm/generator.ts`:
  - Added `DEFAULT_TOP_P = 0.92` nucleus sampling.
  - Implemented `generateAnswerStreaming` supporting OpenAI-compatible Server-Sent Events (SSE) stream parsing.
- Updated `src/ui/panelManager.ts`:
  - Integrated intent-based adaptive `topK` (2 for factual, 3 for explain, 4 for code, 5 for meta).
  - Implemented SSE token streaming orchestration with batch fallback.
  - Added `getFollowUpChips(intent, query)` generating contextual suggestion chips.
- Updated `src/ui/webviewHtml.ts`:
  - Cleaned Markdown rendering (removed legacy zone card and citation splitters).
  - Implemented real-time streaming DOM handlers (`streamStart`, `streamChunk`, `streamEnd`) with live blinking cursor (`.streaming-cursor`).
  - Added interactive follow-up chips row with 1-click query execution (`submitQuestion`).
- Updated `package.json`: Added `contextQa.topP` and `contextQa.streaming` configuration settings.
- Updated `test/unit/prompts.test.ts`: Added tests for XML context, intent classification, calibrated temperatures, directives, and verified 40/40 tests pass.
- Updated `README.md` and `docs/decisions.md` (ADR-014).
**Decided:**
- No academic citations or zone cards in conversational responses: The user already captured the context turn; answers must read naturally and directly like Claude 3.7 Sonnet / GPT-4o.
- Nucleus sampling: $top\_p = 0.92$ clips unlikely vocabulary tails before temperature is applied.
- Code temperature: Fixed at $T=0.20$ to prevent hallucinated ports and invalid APIs, while prose runs at $T=0.35-0.55$.
**Wrong/wasted time on:**
- None. All 40 unit tests pass cleanly.
**Known issues:**
- None.
**Next:**
- Extension packaging (`vsce package`) or local end-to-end testing in the Extension Development Host.

---

### [2026-09-08] Session 4 — Prompt Engine Assembly, RAG Contracts & Chunker Ingestion Start
**Built:**
- User created [src/llm/prompt.ts](file:///a:/Personal/projects/Agentic-chat-Q&A-bot/src/llm/prompt.ts): Full 3-tier instruction hierarchy, system constitution, dynamic agent context injection, multi-turn sliding window memory (`conversationHistory.slice(-maxHistoryTurns * 2)`), and user query formatting.
- User created [src/rag/types.ts](file:///a:/Personal/projects/Agentic-chat-Q&A-bot/src/rag/types.ts): Core data contracts (`ChunkType`, `Chunk`, `ScoredChunk`, `ChunkerOptions`, `RetrieverOptions`).
- User started [src/rag/chunker.ts](file:///a:/Personal/projects/Agentic-chat-Q&A-bot/src/rag/chunker.ts): Scaffolded constants, token estimation, and main code fence regex scan loop.
- Updated [docs/ARCHITECTURE.md](file:///a:/Personal/projects/Agentic-chat-Q&A-bot/docs/ARCHITECTURE.md): Documented Section 7 with full prompt specification, role mappings (`system` for constitution/context, `user` for query, `assistant` for history), and code assembly examples.
**Decided:**
- Role mappings: OpenAI API uses `role: 'system'` for authoritative reference context/chunks, `role: 'user'` for active query, and `role: 'assistant'` for multi-turn conversational history.
- Sliding window memory math: `conversationHistory.slice(-maxHistoryTurns * 2)` preserves the last N complete interaction rounds (1 round = 1 user + 1 assistant message = 2 messages) without risking array index errors.
**Wrong/wasted time on:**
- Caught nesting bug in `src/llm/prompt.ts` where helper functions were placed inside `buildAgentContext`, plus minor spelling mismatch (`assitant` vs `assistant`) causing TypeScript role assignment errors. Fixed by user.
**Known issues:**
- `src/rag/chunker.ts` is in progress (first 81 lines written; helper functions `processProseBlocks`, `splitLargeParagraph`, and `processCodeBlock` remain to be completed).
- `src/rag/chunker.ts` line 19 has `Math.max(text.trim().length / 4)` instead of `Math.ceil(...)`.
**Next:**
- Complete `src/rag/chunker.ts`, compile with `npm run compile`, and create `test/unit/chunker.test.ts`.

---

### [2026-09-08] Session 3 — 6-Document Framework Formalization (PRD, BUILD, ARCHITECTURE, PHASES)
**Built:**
- Created [docs/PRD.md](file:///a:/Personal/projects/Agentic-chat-Q&A-bot/docs/PRD.md): Full Product Requirements Document detailing user personas, use cases, functional and non-functional requirements.
- Created [docs/BUILD.md](file:///a:/Personal/projects/Agentic-chat-Q&A-bot/docs/BUILD.md): Build Requirements Document detailing VS Code engine compatibility, path-safe Windows scripts, `--ignore-scripts` installation, and SecretStorage.
- Created [docs/ARCHITECTURE.md](file:///a:/Personal/projects/Agentic-chat-Q&A-bot/docs/ARCHITECTURE.md): Complete System Architecture and Technical Specification detailing in-memory array rationale, structural chunking, ONNX offline embeddings, hybrid retrieval (BM25 + Cosine + RRF), and the 3-zone relevance matrix.
- Created [docs/PHASES.md](file:///a:/Personal/projects/Agentic-chat-Q&A-bot/docs/PHASES.md): Linear implementation roadmap with detailed Definition of Done across Stages 1 through 6.
- Updated [Agents.md](file:///a:/Personal/projects/Agentic-chat-Q&A-bot/Agents.md) with the full Core Project Documentation Index.
**Decided:**
- Formalized the 6 Core Documents framework (`PRD.md`, `BUILD.md`, `ARCHITECTURE.md`, `Agents.md`, `PHASES.md`, `PROGRESS.md`) to anchor context, prevent conversational amnesia, and standardize AI pair-programming.
- Scope pre-check guardrail: Evaluated on raw Cosine similarity (<0.20) and BM25 count (=0) with meta-transformation query bypass, avoiding LLM round-trip costs on off-topic questions.
- Normalized RRF score formula: `RRF(d) / (2/61)` bounded in [0, 1] for UI confidence.
- Identifier sub-tokenization: Lives in `retriever.ts` via symmetric `tokenizeCodeAndProse()` sub-token splitting.
- Chunk token ceiling: Default 200 tokens (calibrated below MiniLM 256-token limit).
**Wrong/wasted time on:**
- Initial proposal of cutoff threshold on raw RRF score (e.g. 0.15) was mathematically impossible since raw RRF max score is 2/61 ≈ 0.0328. Fixed by decoupling scope pre-check to raw Cosine similarity and normalizing RRF for UI.
**Known issues:**
- None in documentation or build. Stage 4 application code files (`types.ts`, `chunker.ts`) are ready to be created by the user.
**Next:**
- User creates `src/rag/types.ts` and `src/rag/chunker.ts`, followed by compiling and creating `test/unit/chunker.test.ts`.

---

### [2026-09-07] Session 2 — Removal of Fragile antigravity-sdk, IDE Restoration, and Universal Cross-IDE Capture
**Built:**
- Restored host Antigravity IDE installation (`workbench.html` unpatched and SHA-256 verified against `product.json`, orphan `ag-sdk-*` files removed).
- Completely removed `antigravity-sdk` dependency and deleted `src/antigravityCapture.ts`.
- Implemented universal `CaptureManager` (`src/captureManager.ts`) with clipboard capture (`Ctrl+Alt+Q` / `Cmd+Alt+Q`), editor selection right-click context menu, and status bar item (`$(sparkle) Context Q&A`).
- Enhanced Webview agent console UI (`src/ui/webviewHtml.ts`, `src/ui/panelManager.ts`) with top "📋 Paste Clipboard" action, real-time character and token counter badges (`X chars • ~Y tokens`), and clean Scoped Context header.
- Renamed extension identity to **Agentic Chat Q&A Bot** (`agentic-chat-qa-bot`) across `package.json`, webview panel title, and logs.
- Updated unit test suite (`test/unit/capture.test.ts`) covering universal capture processing, empty input handling, and stats calculations.
**Decided:**
- Completely dropped `antigravity-sdk` workbench patching. Modern Antigravity runs the agent UI in a separate `workbench-jetski-agent.html` window using SVG buttons rather than text labels (`Good`/`Bad`), and patching `workbench.html` altered core files causing VS Code checksum integrity errors ("Your installation appears to be corrupt").
- Pivoted to a universal, cross-IDE architecture compatible with VS Code, Antigravity, Cursor, Windsurf, etc., using 1-click clipboard / hotkey / context-menu capture.
- Strict Development & Collaboration Mode: The AI assistant is strictly prohibited from modifying or creating application source files in `src/`. The user writes all application code to understand it firsthand. The AI assistant is only permitted to provide code implementations in chat, review user-written code, and directly edit documentation (`Agents.md`, `PROGRESS.md`), test files (`test/unit/**/*.test.ts`), and configuration files (`package.json`, `tsconfig.json`).
**Wrong/wasted time on:**
- Attempting to inject buttons via `antigravity-sdk` into `workbench.html` failed because the agent chat lives in `workbench-jetski-agent.html` and patching triggered VS Code's core checksum verification alert.
**Known issues:**
- Stage 4 RAG pipeline (chunking, local embeddings, retrieval) and Stage 5 LLM generation are next to be connected in place of the simulated dummy responses.
**Next:**
- Implement Stage 4: `src/rag/chunker.ts` (paragraph + sentence split), `src/rag/embedder.ts` (`all-MiniLM-L6-v2` offline), `src/rag/retriever.ts` (in-memory cosine similarity top-k), and unit tests.

---

### [2026-09-06] Session 1 — Scaffold, Button Injection & Capture, and Webview UI (Stages 1-3)
**Built:**
- Extension scaffold (`package.json`, `tsconfig.json`, `.vscode/launch.json`, `.vscode/tasks.json`).
- Isolated SDK capture wrapper (`src/antigravityCapture.ts`) with local ephemeral HTTP receiver (`127.0.0.1:port/capture`).
- "🔍 Ask about this" button injected into `BOT_ACTION` point on agent turns via `IntegrationManager.addBotAction()`.
- Turn text extraction logic in renderer click handler that cleans UI badges and sends text to the local receiver.
- Webview chat UI (`src/ui/webviewHtml.ts` and `src/ui/panelManager.ts`): Scoped Context top preview (~200 chars), "New context" reset button, chat thread bubbles with native VS Code CSS variables, loading state spinner, and error banner.
- Developer simulation commands: `contextQa.simulateCapture`, `contextQa.openPanel`, `contextQa.showLastCapture`, `contextQa.setApiKey`.
- Automated test in `test/unit/capture.test.ts` verifying capture dispatching.
**Decided:**
- Path-safe npm scripts: Instead of calling raw `tsc` or `mocha.cmd` (which fail in cmd.exe when the workspace path contains `&`), scripts invoke `node ./node_modules/typescript/bin/tsc` and `node ./node_modules/mocha/bin/mocha.js` directly.
- Modern Antigravity path detection: Dynamically redirect `WorkbenchPatcher` to `vscode.env.appRoot` or `LOCALAPPDATA/Programs/Antigravity IDE` because `antigravity-sdk` v1.7.0 hardcoded `Programs/Antigravity` which lacked the unpacked workbench files.
- Local HTTP bridge for capture: Uses `127.0.0.1:port/capture` POST calls from the renderer toast dynamic expression, which works natively across Electron without requiring Node integration in the renderer.
**Wrong/wasted time on:**
- Standard `npm install` failed because `@xenova/transformers` has an optional/unused dependency on `sharp`, whose Windows build script crashed in `cmd.exe` due to the `&` in directory name `Agentic-chat-Q&A-bot`. Fixed by installing with `--ignore-scripts` (since text embeddings via `all-MiniLM-L6-v2` only require `onnxruntime-web`, not `sharp`).
- `antigravity-sdk`'s `isAvailable()` failed initially because it looked for `%LOCALAPPDATA%\Programs\Antigravity` instead of `%LOCALAPPDATA%\Programs\Antigravity IDE`. Fixed by candidate path redirection in `ensureWorkbenchPathCompatibility()`.
**Known issues:**
- RAG pipeline (chunking, local embeddings, retrieval) and real OpenAI endpoint generation are still using dummy simulated responses in the Webview panel until Stages 4 & 5.
**Next:**
- Implement Stage 4: `src/rag/chunker.ts` (paragraph + sentence split), `src/rag/embedder.ts` (`all-MiniLM-L6-v2` offline), `src/rag/retriever.ts` (in-memory cosine similarity top-k), and unit tests.

---

## [seed entry — fill in after first real session]
### Context carried in from planning (not yet built)
**Decided:**
- Using antigravity-sdk ONLY for BOT_ACTION button injection + turn-text
  capture — not for model routing. Generation goes through DeepSeek or
  an OpenRouter free-tier model via plain OpenAI-compatible fetch calls.
- `sdk.ls.createCascade()`/`sendMessage()` confirmed broken against
  current Antigravity LS builds as of research done in planning
  (numeric model IDs + payload shape rejected with 500s). Avoided
  entirely in this design — not used anywhere in this project.
- No vector DB — in-memory cosine similarity is sufficient at this scale.
- `all-MiniLM-L6-v2` via transformers.js chosen for local, free,
  offline embeddings.
**Known issues:**
- antigravity-sdk is unofficial/reverse-engineered and breaks on
  Antigravity IDE updates. `antigravityCapture.ts` is the isolation
  boundary — check there first if capture stops working after an update.
**Next:**
- Scaffold extension, verify button injection + text capture in isolation
  (console.log only) before writing any RAG code.

---

## Session 5 — Autonomous Development Mode, Decisions/Flow Tracking & Chunker Implementation
- **Date:** 2026-09-09
- **Actions Completed:**
  1. **Autonomous Development Rule Active:** Updated [Agents.md](file:///a:/Personal/projects/Agentic-chat-Q&A-bot/Agents.md) to grant the agent full autonomous permission to create, edit, test, and debug all application code and documentation until project success.
  2. **Created Decision Record:** Created [docs/decisions.md](file:///a:/Personal/projects/Agentic-chat-Q&A-bot/docs/decisions.md) capturing ADR-001 through ADR-009 with context, alternatives considered, chosen direction, and rationale.
  3. **Created Execution Flow Document:** Created [docs/flow.md](file:///a:/Personal/projects/Agentic-chat-Q&A-bot/docs/flow.md) documenting high-level Mermaid sequence diagram, 5 runtime traces, and live file implementation matrix.
  4. **Architecture Documentation Updated:** Updated [docs/ARCHITECTURE.md](file:///a:/Personal/projects/Agentic-chat-Q&A-bot/docs/ARCHITECTURE.md) to cross-reference `docs/decisions.md` and `docs/flow.md`.
  5. **Completed Structural Chunker:** Implemented [src/rag/chunker.ts](file:///a:/Personal/projects/Agentic-chat-Q&A-bot/src/rag/chunker.ts) supporting atomic code fences, 200-token ceiling, structural typing (`code`, `prose`, `list`), and fragment compaction.
  6. **Tested Chunker:** Created [test/unit/chunker.test.ts](file:///a:/Personal/projects/Agentic-chat-Q&A-bot/test/unit/chunker.test.ts) with 8 dedicated test cases. All 11 unit tests passing (`11 passing (19ms)`).
  7. **Flow Tracking Updated:** Updated [docs/flow.md](file:///a:/Personal/projects/Agentic-chat-Q&A-bot/docs/flow.md) marking `chunker.ts` and `chunker.test.ts` as COMPLETE.
- **Next Steps:**
  1. Implement [src/rag/embedder.ts](file:///a:/Personal/projects/Agentic-chat-Q&A-bot/src/rag/embedder.ts) with `@xenova/transformers` singleton pipeline for `all-MiniLM-L6-v2`.
  2. Implement [src/rag/retriever.ts](file:///a:/Personal/projects/Agentic-chat-Q&A-bot/src/rag/retriever.ts) with cosine similarity, sub-tokenized BM25, normalized RRF, and scope guardrail.

---

## Session 6 — Generator Implementation, End-to-End Pipeline Wiring & Stages 4–6 Completion
- **Date:** 2026-09-11
- **Actions Completed:**
  1. **Stage 5 Generator Engine:** Created [src/llm/generator.ts](file:///a:/Personal/projects/Agentic-chat-Q&A-bot/src/llm/generator.ts) supporting provider-agnostic OpenAI-compatible completions endpoints (OpenRouter, DeepSeek, Ollama) with typed `GeneratorError` handling, HTTP status differentiation (401, 429, 5xx), and 60-second AbortController timeout protection.
  2. **Prompt & Generator Unit Tests:** Created [test/unit/prompts.test.ts](file:///a:/Personal/projects/Agentic-chat-Q&A-bot/test/unit/prompts.test.ts) covering 3-tier instruction constitution, sliding window memory enforcement, and error classes.
  3. **Verification:** Ran test suite across all modules: **all 36 unit tests passing (`36 passing (325ms)`)** with clean exit code 0.
  4. **Stage 6 End-to-End Wiring:** Completely refactored [src/ui/panelManager.ts](file:///a:/Personal/projects/Agentic-chat-Q&A-bot/src/ui/panelManager.ts):
     - Background asynchronous vector indexing triggered upon capture.
     - Just-in-time synchronization awaiting active indexing when user queries arrive.
     - Fast Scope Pre-Check guardrail short-circuiting off-topic questions without burning LLM tokens.
     - VS Code `SecretStorage` API key integration with dynamic inline input prompt fallback.
     - Assembled 3-tier chat messages and rendered grounded assistant responses.
  5. **Extension Wiring:** Updated [src/extension.ts](file:///a:/Personal/projects/Agentic-chat-Q&A-bot/src/extension.ts) to pass `context.secrets` to `ContextQAPanelManager.render`.
  6. **Decisions & Roadmap Logged:** Added ADR-013 to [docs/decisions.md](file:///a:/Personal/projects/Agentic-chat-Q&A-bot/docs/decisions.md) and updated [docs/PHASES.md](file:///a:/Personal/projects/Agentic-chat-Q&A-bot/docs/PHASES.md) and [docs/flow.md](file:///a:/Personal/projects/Agentic-chat-Q&A-bot/docs/flow.md) marking Stages 4, 5, and 6 as ✅ COMPLETE.
