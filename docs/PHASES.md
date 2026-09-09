# Implementation Phases & Milestones Roadmap (PHASES.md)

## Document Details
- **Document Version:** 1.0.0
- **Status:** Active / Execution Guide
- **Tracking:** Linear progression across Stages 1 through 6

---

## Roadmap Overview

| Stage | Name | Target Deliverables | Status |
|---|---|---|---|
| **Stage 1** | Extension Scaffold & Build System | `package.json`, `tsconfig.json`, `.vscode/launch.json`, path-safe scripts | ✅ **DONE** |
| **Stage 2** | Universal Capture Engine | `src/captureManager.ts`, clipboard shortcut, status bar, context menu | ✅ **DONE** |
| **Stage 3** | Webview Agent Console UI | `src/ui/panelManager.ts`, `src/ui/webviewHtml.ts`, badges, simulated chat | ✅ **DONE** |
| **Stage 4** | Local RAG Pipeline | `src/rag/types.ts`, `src/rag/chunker.ts`, `src/rag/embedder.ts`, `src/rag/retriever.ts` | ⏳ **IN PROGRESS** |
| **Stage 5** | Grounded LLM Generation | `src/llm/generator.ts`, `SecretStorage`, 3-zone system prompt, OpenAI fetch | 📋 **PLANNED** |
| **Stage 6** | End-to-End Wiring & Eval Harness | Wiring pipeline to Webview, `test/eval/retrieval.eval.ts`, feedback logging | 📋 **PLANNED** |

---

## Detailed Stage Breakdown

### Stage 1: Extension Scaffold & Build System ✅ COMPLETE
- **Goal:** Create a robust, path-safe extension scaffold that builds without errors on Windows when directory names contain `&`.
- **Deliverables:**
  - `package.json` with TypeScript and Mocha dev dependencies.
  - Path-safe npm scripts (`compile`, `watch`, `test`).
  - `.vscode/launch.json` for F5 Extension Host debugging.
- **Definition of Done (DoD):** `npm run compile` and `npm test` execute with exit code 0.

---

### Stage 2: Universal Capture Engine ✅ COMPLETE
- **Goal:** Establish zero-tampering, cross-IDE capture mechanisms working on VS Code, Antigravity, and Cursor.
- **Deliverables:**
  - `src/captureManager.ts` implementing:
    - Clipboard shortcut (`Ctrl+Alt+Q` / `Cmd+Alt+Q`).
    - Editor right-click context menu (*`Context Q&A: Ask About Selection`*).
    - Status bar item (*`$(sparkle) Context Q&A`*).
    - Manual input command (*`contextQa.simulateCapture`*).
  - Permanent cleanup and restoration of `%LOCALAPPDATA%\...\workbench.html` (SHA-256 verified against `product.json`).
- **Definition of Done (DoD):** Pressing `Ctrl+Alt+Q` with copied text instantly scopes the context; no IDE corruption alerts appear.

---

### Stage 3: Webview Agent Console UI ✅ COMPLETE
- **Goal:** Provide a sleek, theme-aware AI agent console inside a VS Code webview.
- **Deliverables:**
  - `src/ui/panelManager.ts`: Singleton Webview panel lifecycle and message broker.
  - `src/ui/webviewHtml.ts`: Vanilla HTML/CSS/JS interface using native VS Code CSS variables.
  - Header with `Scoped Context` preview, character & token count badge, `📋 Paste Clipboard` button, and `🔄 New context` reset.
  - Thread bubbles, auto-resizing input textarea, and loading spinner.
- **Definition of Done (DoD):** Panel renders beside active editor; typing a message triggers user bubble, spinner, and simulated response.

---

### Stage 4: Local RAG Pipeline ⏳ IN PROGRESS
- **Goal:** Build offline, structural chunking and in-memory hybrid retrieval.
- **Deliverables:**
  1. `src/rag/types.ts`: `Chunk`, `ScoredChunk`, and `ChunkerOptions` interfaces.
  2. `src/rag/chunker.ts`: Structural markdown parser preserving code fences (max 200 tokens).
  3. `src/rag/embedder.ts`: In-process vector generator using `@xenova/transformers` (`all-MiniLM-L6-v2`).
  4. `src/rag/retriever.ts`: In-memory Hybrid search (Vector Cosine + Sub-tokenized BM25 fused via Normalized RRF).
  5. `test/unit/chunker.test.ts` & `test/unit/retriever.test.ts`: Unit test suite.
- **Definition of Done (DoD):**
  - Code blocks $\le 200$ tokens remain completely atomic.
  - Exact code identifiers like `getUserById` rank in top-2 via BM25 sub-token matching.
  - Retrieval takes $< 2\text{ms}$ on in-memory array.
  - `npm test` passes all tests.

---

### Stage 5: Grounded LLM Generation Engine 📋 PLANNED
- **Goal:** Integrate OpenAI-compatible endpoint generation with 3-zone prompt engineering.
- **Deliverables:**
  1. `src/llm/generator.ts`: Plain `fetch` call to configured `contextQa.apiBaseUrl` and `contextQa.modelName`.
  2. `contextQa.setApiKey` command storing tokens securely in VS Code `SecretStorage`.
  3. 3-Zone System Instruction:
     - Direct facts cited from `[Chunk X]`.
     - In-domain expansions labeled with `[📌 Context]` and `[🌐 Deep-Dive & Implementation]`.
     - Completely off-topic queries refused.
  4. Scope Pre-Check guardrail preventing unnecessary LLM calls on noise queries.
  5. Multi-turn sliding memory (injecting last 3-4 turns).
- **Definition of Done (DoD):** Successfully answers questions against OpenRouter / DeepSeek; displays dual source badges when expanding.

---

### Stage 6: End-to-End Integration, Feedback & Eval Harness 📋 PLANNED
- **Goal:** Wire the complete pipeline into the Webview console and establish an objective retrieval benchmark.
- **Deliverables:**
  1. Replace Stage 3 simulated timeout in `panelManager.ts` with real `chunkText` $\rightarrow$ `embedder` $\rightarrow$ `retriever` $\rightarrow$ `generator` flow.
  2. Native 👍 / 👎 feedback buttons on assistant bubbles saving to `.vscode/eval-feedback.json`.
  3. Retrieval Eval Harness (`test/eval/retrieval.eval.ts`) with 3 golden sample contexts and precision@K scoring.
- **Definition of Done (DoD):** Full end-to-end user journey verified; `npm run compile` and `npm test` clean.
