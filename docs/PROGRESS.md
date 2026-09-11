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
