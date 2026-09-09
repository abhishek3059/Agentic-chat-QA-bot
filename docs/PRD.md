# Product Requirements Document (PRD)

## Document Details
- **Project Name:** Agentic Chat Q&A Bot (Scoped RAG Console)
- **Document Version:** 1.0.0
- **Status:** Approved / Active
- **Target Platform:** Cross-IDE (VS Code, Antigravity IDE, Cursor, Windsurf)

---

## 1. Executive Summary & Problem Statement

Modern AI coding agents (Antigravity, Cursor, Copilot, Windsurf) generate increasingly dense, multi-step technical responses containing complex architectural advice, mathematical proofs, terminal scripts, and large code blocks.

### The Problem
1. **Cognitive Overload & Verification Friction:** When an agent outputs a 1,500-word response, developers struggle to verify formulas, examine edge cases, or extract specific implementation steps without re-reading the entire wall of text.
2. **Context Drift in Active Chats:** Asking follow-up clarification questions inside the primary agent chat causes the conversation window to swell, drifting attention away from the main coding task and consuming expensive agent tokens.
3. **The Rigidity of Naive RAG:** Existing document search tools fail on developers' real-world workflows:
   - They fail to parse code blocks structurally, cutting functions in half.
   - They fail on transformative questions (*"explain this simpler"*, *"give me an analogy"*), giving robotic "not found" errors.
   - They hallucinate when asked off-topic questions instead of holding firm boundaries.

### The Solution: Agentic Chat Q&A Bot
**Agentic Chat Q&A Bot** is a dedicated, local-first "microscope" panel for AI responses. Developers capture a single AI turn into an isolated sandbox where they can interrogate, verify, dissect, and deep-dive into the response using local, privacy-first in-memory RAG and grounded LLM generation.

---

## 2. Product Goals & Vision

1. **Zero Context Drift:** Isolate verification conversations away from the main IDE agent chat.
2. **100% Privacy & Local First:** Embeddings and chunking run entirely on-device (via ONNX runtime). Zero proprietary code leaves the machine for vector indexing.
3. **Structural Fidelity:** Code blocks remain atomic units; syntax highlighting and function signatures are preserved.
4. **Intelligent Pedagogy over Rigid Quoting:** Explains difficult concepts using analogies when requested, while rejecting completely off-topic queries.
5. **Transparent Source Attribution:** Clearly distinguishes between facts in the captured response (`📌 From Captured Response`) versus deeper technical expansions (`🌐 Deep-Dive & Implementation`).
6. **Universal Compatibility:** Operates natively across standard VS Code, Antigravity IDE, Cursor, and Windsurf without proprietary DOM injection or core file tampering.

---

## 3. User Personas & Core Use Cases

### Persona 1: The Staff / Senior Engineer (Verification & Review)
* **Goal:** Verify an AI agent's refactoring recommendation.
* **Workflow:** Captures a 2,000-word architectural response $\rightarrow$ presses `Ctrl+Alt+Q` $\rightarrow$ asks *"What were the performance trade-offs mentioned in step 3?"* $\rightarrow$ receives instant citations from `[Chunk 3]`.

### Persona 2: The Junior / Learning Developer (Pedagogical Deep-Dive)
* **Goal:** Understand complex theory or mathematical formulations.
* **Workflow:** Receives a response explaining *Traditional vs Generative AI* with probability equations $\rightarrow$ captures into Q&A Bot $\rightarrow$ asks *"Explain this math simpler with a real-world analogy"* $\rightarrow$ the bot uses pedagogical reasoning to explain the exact math faithfully.

### Persona 3: The Builder / Explorer (Context-Grounded Expansion)
* **Goal:** Take a mentioned subtopic and get a full implementation.
* **Workflow:** A response mentions *"Semantic Chunking"* as an option $\rightarrow$ developer asks *"Provide a complete Python implementation of the semantic chunker"* $\rightarrow$ the bot outputs what was in context, followed by an explicit `[Expanded Knowledge]` code implementation.

---

## 4. Functional Requirements

### 4.1 Capture Mechanisms (Universal Input)
- **FR-1.1 (Clipboard Shortcut):** Pressing `Ctrl+Alt+Q` (`Cmd+Alt+Q` on macOS) immediately reads the clipboard, sets the scoped context, and reveals the Q&A panel.
- **FR-1.2 (One-Click Paste):** The panel header features a `📋 Paste Clipboard` button for instant context loading.
- **FR-1.3 (Editor Selection Context Menu):** Right-clicking any highlighted code/text in any editor or output tab provides *`Context Q&A: Ask About Selection`*.
- **FR-1.4 (Status Bar Item):** A permanent `$(sparkle) Context Q&A` status bar icon opens or reveals the console anytime.
- **FR-1.5 (Manual Text Input):** Command `contextQa.simulateCapture` prompts the user for custom text input.

### 4.2 Webview Agent Console UI
- **FR-2.1 (Scoped Context Preview):** Displays the first ~200 characters of the active context with subtle ellipsis and italics.
- **FR-2.2 (Real-Time Statistics Badge):** Live display of context metrics: `X chars • ~Y tokens`.
- **FR-2.3 (Context Reset):** A `🔄 New context` button resets the chat thread and awaits new input.
- **FR-2.4 (Chat Thread):** Distinct user and assistant message bubbles styled with native VS Code theme variables (`--vscode-editor-background`, `--vscode-button-background`, etc.).
- **FR-2.5 (Loading & Error States):** Animated loading spinner during retrieval/generation and an error banner with a dismiss button (`✕`).
- **FR-2.6 (Auto-Resizing Input):** Expanding textarea supporting `Enter` to send and `Shift+Enter` for multi-line input.

### 4.3 Ingestion, Chunking & Retrieval (RAG Pipeline)
- **FR-3.1 (Structural Chunking):** Fenced code blocks (` ```lang ... ``` `) must remain atomic units up to 200 tokens. Oversized code blocks split strictly on line/statement breaks with 2-line overlaps.
- **FR-3.2 (Typed Chunks):** Chunks are tagged with `type: 'code' | 'prose' | 'list'` and `language?: string`.
- **FR-3.3 (Local Offline Embeddings):** Dense vector generation using `all-MiniLM-L6-v2` ONNX in-process. Zero network calls for embeddings.
- **FR-3.4 (Hybrid Search):** In-memory cosine similarity combined with sub-tokenized BM25 (splitting camelCase and snake_case identifiers) via Reciprocal Rank Fusion (RRF).

### 4.4 Grounded Generation & Guardrails
- **FR-4.1 (Scope Pre-Check):** Out-of-scope queries (e.g. asking for cooking recipes when analyzing code) are rejected without unnecessary LLM generation.
- **FR-4.2 (Pedagogical Simplification):** Conceptual and transformative questions (*"explain simpler"*, *"give an analogy"*) are supported if the concept exists in the text.
- **FR-4.3 (Transparent Source Badges):** When expanding into implementation details not in the original text, outputs must be split into:
  - `📌 From Captured Response`
  - `🌐 Deep-Dive & Implementation (Expanded Knowledge)`
- **FR-4.4 (Multi-Turn Memory):** Injects the last 3-4 conversational turns so follow-up pronouns (*"What about the second one?"*) resolve naturally.

---

## 5. Non-Functional Requirements

- **NFR-1 (Local Privacy & Security):** API keys stored in VS Code `SecretStorage` only. No telemetry. Vector embeddings run 100% on-device.
- **NFR-2 (Performance & Latency):** In-memory chunking and hybrid retrieval must execute in under $2\text{ms}$ for up to 5,000 words.
- **NFR-3 (Zero Native Dependency Breakage):** Pure TypeScript and pure JS/ONNX runtime. Zero native C++ Node-gyp bindings that fail on Electron updates.
- **NFR-4 (Robustness & Error Resilience):** Empty clipboard, non-text inputs, API timeouts, and network failures must display actionable UI warnings rather than crashing the extension.

---

## 6. Out of Scope (What We Are NOT Building)
- **Not a Codebase-Wide Indexer:** This is not a replacement for full workspace code search (grep, AST indexing). It is strictly a scoped microscope on captured responses.
- **Not an IDE Workbench Patcher:** No DOM injection or core file tampering into Antigravity or VS Code installations.
- **Not a Persistent Cloud Vector DB:** No Pinecone, Milvus, or cloud vector infrastructure.
