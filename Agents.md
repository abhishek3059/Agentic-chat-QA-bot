
## Project
Universal VS Code extension (Agentic Chat Q&A Bot). Captures AI agent
responses (via clipboard, hotkey, or context menu) into an isolated
RAG-backed Q&A console. Local embeddings for retrieval, DeepSeek/OpenRouter
for generation. Full spec: see original build prompt in PROGRESS.md.

## Autonomous Development & Collaboration Mode (ACTIVE)
- **FULL DEVELOPMENT PERMISSION:** The AI assistant is granted **full autonomy and authority** to directly create, edit, refactor, test, and debug all application source code (`src/**`), unit tests (`test/**`), configuration files, and documentation until the project is completely functional, verified, and successful.
- **QUALITY & STANDARDS:** The AI assistant must maintain strict TypeScript compliance, high-quality documentation, clean code conventions, and ensure all tests pass (`npm test` and `npm run compile`).
- **LIVE FLOW & DECISION TRACKING:** As each file is created or updated, the AI must update [docs/flow.md](file:///a:/Personal/projects/Agentic-chat-Q&A-bot/docs/flow.md) with file completion status and log architectural decisions in [docs/decisions.md](file:///a:/Personal/projects/Agentic-chat-Q&A-bot/docs/decisions.md).

## Core Project Documentation Index
Before starting work, read the foundational documentation:
1. **[docs/PRD.md](file:///a:/Personal/projects/Agentic-chat-Q&A-bot/docs/PRD.md):** Product Requirements & User Scenarios (WHAT & WHY).
2. **[docs/BUILD.md](file:///a:/Personal/projects/Agentic-chat-Q&A-bot/docs/BUILD.md):** Toolchains, Engines & Path-Safe Scripts (HOW TO BUILD).
3. **[docs/ARCHITECTURE.md](file:///a:/Personal/projects/Agentic-chat-Q&A-bot/docs/ARCHITECTURE.md):** Technical Design, Math Formulations & Data Flow (HOW IT WORKS).
4. **[docs/decisions.md](file:///a:/Personal/projects/Agentic-chat-Q&A-bot/docs/decisions.md):** Architecture Decision Records (ADRs) with rationale (WHY IT WAS BUILT THIS WAY).
5. **[docs/chunking-strategy.md](file:///a:/Personal/projects/Agentic-chat-Q&A-bot/docs/chunking-strategy.md):** Structural Markdown & Code Chunking Strategy & 200-Token Safety Ceiling.
6. **[docs/flow.md](file:///a:/Personal/projects/Agentic-chat-Q&A-bot/docs/flow.md):** End-to-End System & Component Flow with file status tracking (HOW DATA FLOWS).
7. **[Agents.md](file:///a:/Personal/projects/Agentic-chat-Q&A-bot/Agents.md):** Rules of Engagement & Code Conventions (HOW TO BEHAVE).
8. **[docs/PHASES.md](file:///a:/Personal/projects/Agentic-chat-Q&A-bot/docs/PHASES.md):** Implementation Roadmap & Definition of Done (IN WHAT ORDER).
9. **[docs/PROGRESS.md](file:///a:/Personal/projects/Agentic-chat-Q&A-bot/docs/PROGRESS.md):** Append-Only Session Memory & Decision Logbook (WHAT HAPPENED).

## Commands
- Install: `npm install`
- Build: `npm run compile`
- Watch: `npm run watch`
- Run extension: F5 in VS Code (Extension Development Host)
- Lint: `npm run lint`
- Test: `npm test`

## Code style
- TypeScript strict mode. No `any` unless justified with a comment saying why.
- Small functions, one responsibility each. If a function needs a comment
  to explain *what* it does (not *why*), split it instead.
- Name things by what they mean in this domain, not how they're implemented
  — `capturedResponse`, not `sdkPayload`; `retrievedChunks`, not `topKResult`.
- No premature abstraction. Don't build a generic "provider interface" for
  the LLM call until there's a second real provider to support — one
  function that takes config and returns text is enough for now.
- Comment *why*, not *what*: explain non-obvious decisions and trade-offs,
  not restate the code in English.
- Prefer explicit code over clever code. If two approaches are equally
  correct, pick the one a stranger can read in 10 seconds.

## Architecture constraints (do not violate without updating this file)
- ZERO `antigravity-sdk` dependencies or workbench DOM patching. The extension
  is completely universal and cross-IDE compatible (VS Code, Antigravity IDE, Cursor, etc.).
- Capture occurs through native VS Code APIs only: clipboard (`Ctrl+Alt+Q`), editor
  selection right-click context menu, status bar item, and the Webview console "Paste Clipboard" action.
- Embedding and generation are separate, swappable concerns. The
  generation call must work against any OpenAI-compatible endpoint via
  config alone (base URL + model name) — no code change to switch from
  DeepSeek to an OpenRouter free model.
- No vector database. In-memory array + cosine similarity is the correct
  scale for this project. Don't add one "for scalability" — that's
  solving a problem this project doesn't have.

## Security
- API keys go in VS Code `SecretStorage` only. Never in settings.json,
  never logged, never committed, never printed to the debug console even
  during development — grep for `apiKey` before every commit.
- No telemetry, no external calls other than the configured LLM endpoint.

## Testing expectations
- Any function that does chunking, similarity scoring, or prompt
  construction needs a unit test with a known input/output — these are
  pure functions, they're cheap to test and expensive to get subtly wrong.
- Capture and UI integration should be covered by unit tests mocking the VS Code clipboard and message passing boundaries.

## Workflow & Progress Tracking
- Actively read and maintain `docs/PROGRESS.md` across turns. Update the log
  as soon as new decisions, code changes, or bug resolutions occur, before
  providing responses or completing steps.
- Append to `PROGRESS.md` (don't rewrite history) using its template:
  what you built, what you decided and why, anything that turned out to
  be wrong or wasted time, known issues, and what's next. Be specific
  enough that future sessions don't repeat your research.