# Architecture Decision Records (ADRs) — `docs/decisions.md`

## Overview
This document logs every key architectural and engineering decision made in **Agentic Chat Q&A Bot**. Each record details the context, considered options, decision taken, trade-offs, and rationale to prevent re-litigating settled engineering questions.

---

## Index of Decisions
- **ADR-001:** In-Memory Array over External / Native Vector Databases
- **ADR-002:** Abandonment of `antigravity-sdk` DOM Patching & Host IDE Restoration
- **ADR-003:** On-Device Local Embeddings via `@xenova/transformers` (`all-MiniLM-L6-v2`)
- **ADR-004:** Structural Markdown & Code Chunking with a 200-Token Ceiling
- **ADR-005:** In-Memory Hybrid Retrieval (BM25 + Cosine) with Normalized Reciprocal Rank Fusion (RRF)
- **ADR-006:** The 3-Zone Relevance Matrix & Fast Scope Pre-Check Guardrail
- **ADR-007:** 3-Tier Instruction Hierarchy & OpenAI Role Mapping (`system`, `assistant`, `user`)
- **ADR-008:** Path-Safe Build Architecture for Paths Containing Ampersands (`&`)
- **ADR-009:** Separate Prompt Layer (`src/llm/prompt.ts`) Decoupled from Network Fetch
- **ADR-010:** Safe Git Pushing Standards & GitHub Repository Hygiene
- **ADR-011:** Stop-Word Filtering in Sub-Tokenized BM25 Keyword Search
- **ADR-012:** Non-Crashing Native Stubs for Text-Only Transformers Pipelines
- **ADR-013:** Background Asynchronous Indexing with JIT Query Synchronization
- **ADR-014:** Frontier-Grade Conversational Engine, Real-Time SSE Streaming, and Intent Routing
- **ADR-015:** Native VS Code UI Overhaul (Sidebar WebviewView)
- **ADR-016:** Unified Context/Q&A Dynamic Input Pill & Model Selector
- **ADR-017:** Removal of the Scope Pre-Check Guardrail (Filter Chunks, Not Questions)
- **ADR-018:** Generation Cancellation Guard, LLM Retry & ONNX Pre-Warm
- **ADR-019:** Rename to QA Assistant + Bracket-Node Mark & Theme-Linked Watermark

---

### ADR-001: In-Memory Array over External / Native Vector Databases
* **Date:** 2026-09-06 (Reaffirmed 2026-09-08)
* **Status:** Accepted
* **Context:** The extension indexes a single captured AI response at a time (typically 500 to 5,000 words, yielding 5 to 35 chunks). We needed a storage and similarity mechanism.
* **Options Considered:**
  1. *Cloud Vector DB (Pinecone, Milvus):* Requires network latency, cloud API keys, monthly costs, and sends user code to third parties.
  2. *Embedded Native SQLite (better-sqlite3 + sqlite-vec, LanceDB):* Relies on native C++ node-gyp bindings. In VS Code extension development, native bindings consistently crash across Electron ABI version updates.
  3. *In-Memory TypeScript Array:* Plain JavaScript objects held in the extension host process.
* **Decision:** In-Memory TypeScript Array.
* **Rationale:** Computing cosine similarity and BM25 scores over 35 in-memory chunks takes **$< 0.5\text{ms}$**. Adding a vector database introduces massive dependency risk and Electron ABI fragility for a scale problem this project does not have.

---

### ADR-002: Abandonment of `antigravity-sdk` DOM Patching & Host IDE Restoration
* **Date:** 2026-09-07
* **Status:** Accepted
* **Context:** `antigravity-sdk` attempted to inject a DOM button (`🔍 Ask about this`) into Antigravity chat turns by modifying `%LOCALAPPDATA%\...\workbench.html`. This triggered Antigravity IDE's internal cryptographic SHA-256 integrity check (`product.json`), showing a persistent alert: *"Your Antigravity IDE installation appears to be corrupt. Please reinstall."* Furthermore, modern Antigravity renders agent chats in `workbench-jetski-agent.html` with SVG icon buttons, causing the SDK's text search for `"Good"` / `"Bad"` to fail completely.
* **Options Considered:**
  1. *Patch `workbench-jetski-agent.html`:* Still trips `product.json` checksums, fragile against every IDE patch release.
  2. *Abandon reverse-engineered DOM injection:* Restore `workbench.html` to factory clean state and provide native, universal capture.
* **Decision:** Completely remove `antigravity-sdk` and restore `workbench.html` (verified SHA-256 match against `product.json`). Implement a universal capture engine (`src/captureManager.ts`): clipboard shortcut (`Ctrl+Alt+Q`), status bar icon, editor right-click menu, and Webview paste button.
* **Rationale:** The extension now works universally on **Antigravity IDE, standard VS Code, Cursor, and Windsurf** with zero core file tampering and zero integrity warnings.

---

### ADR-003: On-Device Local Embeddings via `@xenova/transformers` (`all-MiniLM-L6-v2`)
* **Date:** 2026-09-06 (Reaffirmed 2026-09-08)
* **Status:** Accepted
* **Context:** Choosing between local on-device embeddings versus remote API embeddings (OpenAI `text-embedding-3-small` / Cohere).
* **Decision:** Run quantized `Xenova/all-MiniLM-L6-v2` locally using pure WebAssembly / ONNX runtime via `@xenova/transformers`.
* **Rationale:**
  1. **Privacy:** Developers capture proprietary, enterprise-confidential code snippets. Embeddings must never leak over third-party APIs.
  2. **Cost & Reliability:** $0 embedding cost, zero rate-limiting, zero network latency.
  3. **WASM Portability:** Runs inside Node.js without native build steps.

---

### ADR-004: Structural Markdown & Code Chunking with a 200-Token Ceiling
* **Date:** 2026-09-08
* **Status:** Accepted
* **Context:** Naive fixed-size character chunking cuts functions and code blocks in half, destroying syntax validity and semantic search. Furthermore, `all-MiniLM-L6-v2` has a hard sequence ceiling of **256 WordPiece tokens** (any text beyond 256 is silently truncated).
* **Decision:**
  - Code blocks (` ```lang ... ``` `) are treated as atomic units.
  - If a code block is $\le 200$ tokens, it remains 100% intact.
  - If an oversized code block exceeds 200 tokens, it splits strictly on statement/newline boundaries with a 2-line overlap, preserving the ```lang header and closing fence on each chunk.
  - Prose paragraphs are split on `\n\s*\n`, falling back to sentence terminators (`. ! ?`) when exceeding 200 tokens.
* **Rationale:** Guarantees syntax integrity for code, prevents semantic truncation, and stays safely under the 256-token embedding ceiling. Full technical breakdown: see [docs/chunking-strategy.md](chunking-strategy.md).

---

### ADR-005: In-Memory Hybrid Retrieval (BM25 + Cosine) with Normalized Reciprocal Rank Fusion (RRF)
* **Date:** 2026-09-08
* **Status:** Accepted
* **Context:** Dense vector embeddings struggle with exact code symbols, function identifiers (`getUserById`), and error codes (`ERR_CONNECTION_REFUSED`).
* **Decision:** Implement hybrid search combining dense vector cosine similarity with sub-tokenized BM25:
  1. **Sub-tokenization:** camelCase and snake_case split into sub-tokens while preserving the compound token (`getUserById` $\rightarrow$ `['get', 'user', 'by', 'id', 'getuserbyid']`).
  2. **Reciprocal Rank Fusion (RRF):** Merges rankings with $k=60$:
     $$\text{RRF}(d) = \frac{1}{60 + \text{Rank}_{\text{BM25}}(d)} + \frac{1}{60 + \text{Rank}_{\text{Vector}}(d)}$$
  3. **UI Normalization:** Normalizes raw RRF by its theoretical maximum ($2/61$):
     $$\text{Score}_{\text{norm}}(d) = \frac{\text{RRF}(d)}{2 / 61} \in [0, 1]$$
* **Rationale:** Delivers exact code identifier matching alongside conceptual semantic matching with mathematical rigor.

---

### ADR-006: The 3-Zone Relevance Matrix & Fast Scope Pre-Check Guardrail
* **Date:** 2026-09-07 (Refined 2026-09-08)
* **Status:** Accepted
* **Context:** Naive RAG fails in two directions: it hallucinates when answering off-topic trivia (e.g. *"how is ice cream made?"*), and it gives unhelpful refusals when users ask for conceptual simplification (*"explain this math simpler"*) or deeper implementation (*"give a code example for semantic chunking"*).
* **Decision:**
  1. **Scope Pre-Check:** If $\max(\text{Cosine}) < 0.20$ AND $\text{BM25} = 0$ AND query is NOT a meta-transformation (*"explain simpler"*, *"summarize"*) $\rightarrow$ short-circuit and return refusal immediately without burning an LLM API round-trip.
  2. **3-Zone Output:**
     - *Zone 1 (Direct Facts):* Answered strictly from context with chunk citations (`[Chunk X]`).
     - *Zone 2 (Context-Related Expansion):* Subtopics mentioned in context are expanded with practical code and deep dives, explicitly separated into dual badges:
       - `### 📌 From Captured Response:`
       - `### 🌐 Deep-Dive & Implementation (Expanded Knowledge):`
     - *Zone 3 (Out-of-Scope Noise):* Politely refused.

---

### ADR-007: 3-Tier Instruction Hierarchy & OpenAI Role Mapping
* **Date:** 2026-09-08
* **Status:** Accepted
* **Context:** OpenAI-compatible APIs only support three message roles: `"system"`, `"user"`, and `"assistant"`. We needed to structure our operational rules, dynamic RAG chunks, multi-turn memory, and user queries onto these roles.
* **Decision:**
  - `role: 'system'`: Houses the immutable constitution (anti-hallucination rules) and dynamic retrieved context chunks (`buildAgentContext`). Models treat `system` as trusted environment truth, protecting against prompt injection.
  - `role: 'assistant'`: Houses the last $N$ turns of previous AI responses via sliding window `conversationHistory.slice(-maxHistoryTurns * 2)`. This enables conversational follow-up resolution (*"what about the second one?"*).
  - `role: 'user'`: Houses the active user prompt.

---

### ADR-008: Path-Safe Build Architecture for Paths Containing Ampersands (`&`)
* **Date:** 2026-09-06 (Reaffirmed 2026-09-07)
* **Status:** Accepted
* **Context:** The workspace is in `Agentic-chat-Q&A-bot`. On Windows `cmd.exe`, raw `&` is treated as a command separator, crashing `tsc.cmd`, `mocha.cmd`, and native node-gyp build scripts during `npm install`.
* **Decision:**
  1. Npm scripts explicitly call Node with direct entry points: `node ./node_modules/typescript/bin/tsc -p ./`.
  2. `@xenova/transformers` installed with `--ignore-scripts` to bypass optional native `sharp` compilation (which is unused for text embeddings).

---

### ADR-009: Separate Prompt Layer (`src/llm/prompt.ts`) Decoupled from Network Fetch
* **Date:** 2026-09-08
* **Status:** Accepted
* **Context:** Hardcoding prompt templates inside `generator.ts` mixes network logic (`fetch`, streaming, headers) with prompt engineering and formatting.
* **Decision:** Isolate all system instructions, chunk formatters, sliding memory assembly, and types into `src/llm/prompt.ts`.
* **Rationale:** Allows unit testing prompt construction (`test/unit/prompts.test.ts`) with pure deterministic functions without making real API calls.

---

### ADR-010: Safe Git Pushing Standards & GitHub Repository Hygiene
* **Date:** 2026-09-09
* **Status:** Accepted
* **Context:** Preparing the repository for public GitHub publication at `https://github.com/abhishek3059/Agentic-chat-QA-bot`.
* **Decision:** Enforce strict safe-pushing protocols:
  1. **Secret & Key Isolation:** Comprehensive `.gitignore` preventing commit of `.env*`, `*.pem`, `*.key`, `token.json`, and credentials. Pre-commit grep verification across codebase.
  2. **Zero Binary / Cache Leaks:** Explicit exclusion of `node_modules/`, `out/`, `dist/`, `.vscode-test/`, `*.vsix`, and ONNX model caches.
  3. **Verified Pre-Push Gates:** Mandatory `npm test` and `npm run compile` green test execution prior to staging.
  4. **Open Source Hygiene:** Provide complete `README.md`, `LICENSE` (MIT), and issue/repository links in `package.json`.

---

### ADR-011: Stop-Word Filtering in Sub-Tokenized BM25 Keyword Search
* **Date:** 2026-09-09
* **Status:** Accepted
* **Context:** During unit testing of the scope guardrail, completely unrelated user questions (e.g. *"Who won the 1998 soccer world cup in France?"*) generated false BM25 scores against programming chunks because both contained the common English article *"the"*. This bypassed the scope guardrail.
* **Decision:** Incorporate a standard stop-word filter (`STOP_WORDS`) within `tokenizeCodeAndProse`.
* **Rationale:** BM25 keyword matching is strictly designed for domain keywords and identifiers (e.g. `getUserProfile` $\rightarrow$ `['get', 'user', 'profile']`). Stripping high-frequency non-content words guarantees that the scope guardrail only triggers when real domain terminology matches.

---

### ADR-012: Non-Crashing Native Stubs for Text-Only Transformers Pipelines
* **Date:** 2026-09-09
* **Status:** Accepted
* **Context:** `@xenova/transformers` statically imports `sharp` in its image utilities (`utils/image.js`). On modern Node runtimes (such as Node 26) and Windows environments where native node-gyp C++ compilation is avoided, `sharp` throws a fatal module resolution exception even though vision pipelines are never used.
* **Decision:** Provide a zero-dependency, non-crashing stub for `sharp` in text-only environments.
* **Rationale:** Keeps the extension 100% portable across developer machines without requiring Visual Studio C++ build tools or Python toolchains.

---

### ADR-013: Background Asynchronous Indexing with JIT Query Synchronization
* **Date:** 2026-09-11
* **Status:** Accepted
* **Context:** Generating local ONNX embeddings for 10–35 chunks takes approximately 100–300ms. If vectorization blocks the capture callback, UI responsiveness freezes. Conversely, if a user immediately types and submits a question before vectorization completes, retrieval would execute against an empty vector array.
* **Decision:** Decouple capture from indexing:
  1. `setCapturedResponse` immediately updates the UI preview, executes structural chunking synchronously, and kicks off `embedChunks` as a background `Promise<void>`.
  2. `handleUserQuestion` checks if indexing is currently active and awaits `this.indexingPromise` just-in-time before executing `hybridRetrieve`.
* **Rationale:** Yields instant, non-blocking UI capture responsiveness while ensuring 100% vector availability when answering questions.

---

### ADR-014: Frontier-Grade Conversational Engine, Real-Time SSE Streaming, and Intent Routing
* **Date:** 2026-09-11
* **Status:** Accepted
* **Context:** The bot's responses previously suffered from a mechanical, academic feel. User feedback and Council deliberations identified three compounding factors:
  1. **Metadata leakage:** Injected prompt tags like `(Relevance Score: 0.920)` and `[PROSE]` caused the model to mirror robotic, defensive language.
  2. **Template rigidity:** Forcing artificial 3-zone split cards (`### 📌 From Captured Response:` vs `### 🌐 Deep-Dive & Implementation:`) and `[Chunk X]` citations in every answer interrupted natural reading flow.
  3. **Batch latency:** Waiting 3–4 seconds for an entire wall of text created an offline database query feel rather than an interactive assistant.
* **Decision:**
  1. **Clean Semantic XML Injection:** Context is injected as `<context><source id="0" lang="...">...</source></context>`, entirely omitting similarity scores so the LLM does not hedge or mirror them.
  2. **Zero Citations in Prose & No Zone Cards:** Removed all instructions to emit `[Chunk X]` or `[0]` citations and split cards. The model delivers a unified, direct, conversational answer with syntax-safe code and 1 proactive gotcha tip.
  3. **Intent-Aware Routing & Sampling Calibration:**
     - A zero-latency classifier categorizes queries into `factual`, `explain`, `code`, or `meta`.
     - Retrieval adapts `topK` (2 for factual, 4–5 for code/meta).
     - Intent-tuned temperature profiles ($T=0.20$ for code, $T=0.35$ for factual, $T=0.55$ for explanation) ensure syntax correctness while preserving fluid prose.
     - Nucleus sampling (`top_p: 0.92`) is enforced on all completions to eliminate low-probability token tails.
  4. **Real-Time SSE Token Streaming:** Token deltas stream via Server-Sent Events directly into the Webview with an active typing cursor and smooth throttled Markdown rendering.
  5. **Interactive Suggestion Chips:** Contextual follow-up chips are rendered after each response, allowing 1-click continuation.
* **Rationale:** Transforms the extension into an agile, human-like pair programmer that rivals frontier AI experiences (Claude 3.7 Sonnet, GPT-4o) while preserving strict local RAG grounding.

---

### ADR-015: Native VS Code UI Overhaul (Sidebar WebviewView)
* **Date:** 2026-09-11
* **Status:** Accepted
* **Context:** The extension previously opened a large `WebviewPanel` (editor tab). Users expect modern AI coding assistants (like Cline, Cursor, or GitHub Copilot) to reside natively in the narrow Activity Bar sidebar so they can view code and chat simultaneously without window management friction.
* **Decision:** Re-architect the UI to use `vscode.WebviewViewProvider` registered under `viewsContainers.activitybar`. Remove the singleton `panelManager.ts` entirely. Enforce strict adherence to VS Code native CSS variables (`--vscode-sideBar-background`, etc.) and remove all hardcoded hex values so the extension gracefully inherits the user's active theme.
* **Rationale:** Provides a significantly more integrated, ergonomic, and familiar developer experience.

---

### ADR-016: Unified Context/Q&A Dynamic Input Pill & Model Selector
* **Date:** 2026-09-11
* **Status:** Accepted
* **Context:** The initial sidebar design included a collapsible "Context Ingestion" drawer at the top and a chat input at the bottom. Users found having two separate text areas confusing. Furthermore, the model selection was buried in settings.
* **Decision:** Consolidate inputs into a single, sleek dynamic "pill" at the bottom of the sidebar. The UI statefully toggles between "Context Mode" (waiting for paste/scope) and "Q&A Mode" based on the internal presence of a scoped RAG context. Incorporate a direct model selector chip inside the pill that syncs with `contextQa.modelName` via `showInputBox`.
* **Rationale:** Drastically simplifies user interaction flow. The dynamic state machine ensures users cannot mistakenly ask questions without context, and making the model visible/clickable builds trust.

---

### ADR-017: Removal of the Scope Pre-Check Guardrail (Filter Chunks, Not Questions)
* **Date:** 2026-09-12
* **Status:** Accepted
* **Context:** The retriever rejected questions before any LLM call when $\max(\text{Cosine}) < 0.20$ AND $\text{BM25} = 0$ AND the query was not an `isMetaQuery()` regex match (30+ patterns). The user demonstrated the failure mode: capturing a Redis pooling response and asking *"Explain this in simpler terms"* — a question that is the entire point of the extension — risked rejection whenever keyword/semantic overlap was low. Council Meeting 2 (`docs/council-meetings/meetings_2.md`) debated removal 3-to-1.
* **Options Considered:**
  1. *Keep the gate, widen bypasses:* Add more regex patterns. Rejected — open-closed violation; every new phrasing needs a patch.
  2. *Lower the threshold (0.20 → 0.10/0.12):* Reduces false rejections but keeps the brittle mechanism.
  3. *Remove the gate entirely:* All questions reach the LLM when context exists; the system prompt's refusal rule becomes the single relevance judge.
* **Decision:** Option 3. Deleted `isMetaQuery()`, `DEFAULT_SCOPE_THRESHOLD`, and the pre-check block from `src/rag/retriever.ts`. Removed the `isOutOfScope` early-exit from `src/ui/SidebarProvider.ts`. Strengthened the refusal wording in `src/llm/prompt.ts` so the model discloses when context does not address the question instead of silently answering from general knowledge. `isOutOfScope` remains in `RetrievalResult` as always-`false` for interface compatibility.
* **Rationale:**
  1. **Prior art:** NotebookLM, Perplexity, and ChatGPT file upload never gate questions — they filter *chunks*, not *questions*.
  2. **Research consensus:** Self-RAG, CRAG, ScoreGate — *"low embedding similarity does not exclude relevance."*
  3. **Cost:** One extra LLM call (~$0.001 on DeepSeek) is negligible next to false-rejection frustration.
  4. **Simplicity:** ~90 lines of heuristic logic and 30+ regex patterns deleted; nothing left to curate.

---

### ADR-018: Generation Cancellation Guard, LLM Retry & ONNX Pre-Warm
* **Date:** 2026-09-12
* **Status:** Accepted
* **Context:** Council Meeting 1 flagged three reliability gaps: (1) a new capture while indexing/generation is in-flight leaves stale vectors in play, so answers can ground in the wrong context; (2) a single 429/5xx from free-tier endpoints kills the session with no retry; (3) the first query pays the full ONNX model download + session-init cost (5–15s) with no pre-warming.
* **Decision:**
  1. **Cancellation guard:** Monotonic `generationCounter` in `SidebarProvider` — incremented on every `setCapturedResponse`, snapshotted at the start of `handleUserQuestion`, checked before rendering results. Stale generations are discarded silently.
  2. **Retry with exponential backoff:** Up to 3 attempts for 429/5xx (1s, 2s, 4s + jitter) in both `generateAnswer` and `generateAnswerStreaming`. Never retry 401.
  3. **ONNX pre-warm:** Fire-and-forget `getEmbeddingPipeline()` in `activate()` with `try/catch` + log.
  4. **Embedding-failure surfacing:** The `embedChunks` catch block now posts a visible webview warning instead of only `console.error`; retrieval degrades to BM25-only visibly.
  5. **Tokenized-chunk cache:** `tokenizeCodeAndProse()` results are cached at capture time and passed into `computeBM25Scores` via an optional parameter, avoiding re-tokenization on every query.
* **Rationale:** Each fix is small, independently testable, and converts a silent failure (wrong context, dead session, cold-start freeze, invisible degradation, wasted CPU) into correct or visible behavior. None change the pipeline architecture.

---

### ADR-019: Rename to QA Assistant + Bracket-Node Mark & Theme-Linked Watermark
* **Date:** 2026-09-12
* **Status:** Accepted
* **Context:** Final pre-ship phase. The product name "Agentic Chat Q&A Bot" was long and unclear in the sidebar; the user requested "QA Assistant". The extension also had no visual identity — the activity-bar container used `$(comment-discussion)`, which is not a valid `viewsContainers` icon (file path required), and the chat UI was unbranded. Council Meeting 3 (`docs/council-meetings/meetings_3.md`) settled scope and design 4-way.
* **Decision:**
  1. **Display strings only:** `displayName`, container/view titles, command titles, config title, webview `<title>`, bot card header, status bar text, notification/log prefixes → "QA Assistant". Frozen: extension id (`agentic-chat-qa-bot`), `contextQa.*` commands/config, view/container ids (API contract — renaming breaks keybindings, `when` clauses, stored settings).
  2. **Mark concept:** open bracket isolating a fragment + one solid node = "one piece, resolved." Square `viewBox 0 0 64 64`, `currentColor`, one 7-unit stroke weight, no bubbles/bulbs/sparkles.
  3. **Single source of truth:** `src/ui/qaMark.ts` exports `QA_MARK_INNER` + `qaMarkSvg()`. Inlined into `webviewHtml.ts` twice (16px header icon, 12px card headers, 300px watermark) — zero CSP/loader changes, since `data:`-URI backgrounds are blocked by `default-src 'none'` and `<img>`+`asWebviewUri` needs extra plumbing.
  4. **Standalone copies:** `media/qa-mark.svg` (also serves as the real activity-bar container icon) and `media/watermark-demo.html` (dark+light proof panels) carry the exact markup, stamped as generated from `qaMark.ts`.
  5. **Watermark hardening:** fixed, bottom-right cropped (`right/bottom: -70px`), opacity 0.05, `pointer-events: none`, `aria-hidden`, chat stacked above (`z-index: 1`), hidden under `forced-colors`, no animation.
* **Rationale:** Inline SVG satisfies the strict webview CSP with no new infrastructure; the file-backed copy fixes the invalid container icon at the same time; bottom-cropped placement plus the forced-colors kill-switch keeps the watermark atmospheric without ever taxing legibility.

---

### ADR-020: Provider Presets + Live Model Picker (Phase E)
* **Date:** 2026-09-12
* **Status:** Accepted
* **Context:** Phase C smoke-test feedback exposed three gaps: (1) the API-key prompt hardcoded "OpenRouter or DeepSeek" while the generator was already provider-agnostic; (2) the model selector was a blind free-text input; (3) no way to pick a provider outside raw base-URL editing. Plan: `.opencode/plans/PROVIDER-UX-PLAN.md` (phases E1–E3).
* **Decision:**
  1. **Provider presets, one table:** `src/llm/providers.ts` holds the single preset table (OpenAI, OpenRouter, DeepSeek, Ollama + custom slot) with pure resolver functions (`resolveBaseUrl`, `resolveModelsUrl`, `providerNeedsKey`, `resolveExtraHeaders`, `listProviderOptions`). New `contextQa.provider` enum setting renders as a Settings-UI dropdown; `contextQa.apiBaseUrl` is now custom-only (default `""`).
  2. **Generator stays URL-blind:** it receives only a resolved base URL. OpenRouter-only `HTTP-Referer`/`X-Title` headers moved behind `resolveExtraHeaders()` so unknown vendors never see them.
  3. **Live model list, graceful fallback:** `src/llm/modelList.ts` fetches `GET {base}/models` (8s timeout, never throws — null on any failure). The sidebar selector opens an in-webview dropdown with loading spinner, filter box, display names, and current-model highlight; fetch failure falls back to free-text entry. New messages: `fetchModels` → `modelsLoading` / `modelsList` / `modelsError`; `changeModel` accepts an optional `modelId`.
  4. **API key stays in SecretStorage** — only the prompt text was de-branded. New `contextQa.configureProvider` command + a config-change watcher that refreshes the sidebar on Settings edits.
* **Rationale:** All four providers share the `data[].id` list shape, so one fetcher covers every current and future OpenAI-compatible endpoint; keeping the key in SecretStorage preserves the project's strongest security property while the provider dropdown removes the misleading hardcoding. Deviations from the plan: unknown provider ids fall back to the OpenRouter preset (never an empty URL); the picker opens **upward** (`bottom: 100%`) because the trigger lives in the bottom footer; timeout uses AbortController (extension-host compatible) instead of `AbortSignal.timeout`; a `model-filter` input was added for 400-item OpenRouter lists.

---

### ADR-021: Model Picker Search + Pin (Phase F, Council Meeting 4)
* **Date:** 2026-09-12
* **Status:** Accepted
* **Context:** OpenRouter returns 400+ models; the flat list felt overwhelming. Council Meeting 4 (`docs/council-meetings/meetings_4.md`) + industry research (Cline, Roo Code, Continue, Copilot) showed the proven pattern is **search + pin**, not filter + group — no major extension excludes models from the list.
* **Decision:**
  1. **No exclusion rules.** Every fetched model stays visible; relevance is a presentation concern (search narrowing + favorites on top), never a data concern.
  2. **Debounced re-render search** (150ms) over `id` + `name`, replacing the old DOM hide/show filter — re-render is required anyway to sort favorites first.
  3. **Star/pin favorites** (☆/★, theme-safe text glyphs) persisted via `vscode.getState()`/`setState()`; favorites sort above the rest, still subject to the active query.
  4. **Count badge** ("47 of 312 models") so the list size is visible; autofocus on the search box (or free-text input on fetch failure).
  5. **Zero backend changes** — fetcher, parser, and message protocol untouched.
* **Rationale:** Filtering risks invisible exclusion (Skeptic) and curated lists rot (pricing/catalog churn); grouping adds structure Cline users never asked for. Search + pin is the industry-settled pattern with the smallest code footprint (~60 lines, webview-only). OpenRouter server-side params (`sort=most-popular`, etc.) stay a documented future option. Deviation from the plan: skipped the × clear-filter button — Escape closes the dropdown, keeping the DOM minimal.
