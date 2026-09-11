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
