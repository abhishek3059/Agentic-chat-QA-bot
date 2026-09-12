# Changelog

All notable changes to the QA Assistant extension are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [0.1.0] — 2026-09-12

Initial public release.

### Added
- **Scoped Q&A console** — capture any AI agent response via `Ctrl+Alt+Q` /
  `Cmd+Alt+Q`, status bar button, editor right-click menu, or the sidebar
  paste button, then ask grounded follow-up questions about that response only.
- **Local hybrid RAG** — structural markdown/code chunking (200-token ceiling),
  on-device ONNX embeddings (`all-MiniLM-L6-v2`), sub-tokenized BM25 +
  dense-vector cosine similarity fused with Reciprocal Rank Fusion. No vector
  database, no embedding network calls.
- **Intent-aware generation** — zero-latency query classifier (`factual` /
  `explain` / `code` / `meta`) with adaptive `topK` and calibrated temperatures;
  real-time SSE token streaming with batch fallback; LLM retry with exponential
  backoff on 429/5xx.
- **Multi-provider support** — `contextQa.provider` dropdown (OpenAI,
  OpenRouter, DeepSeek, local Ollama, or any OpenAI-compatible Custom
  endpoint); live model list fetched from each provider's `/models` endpoint
  with debounced search, ☆ pin-to-top favorites, and free-text fallback.
- **Secure by default** — API keys live only in VS Code `SecretStorage`, never
  in settings, logs, or disk; zero telemetry.
- **Get Started walkthrough** — in-editor setup guide (provider → API key →
  capture → ask) on the Welcome page after install.
- Cross-IDE support: VS Code, Antigravity, Cursor, Windsurf.

### Fixed
- Stale in-flight answers discarded when a newer capture lands mid-generation
  (generation counter guard).
- Embedding failures surface a visible warning and degrade to keyword-only
  retrieval instead of failing silently.
- First-question ONNX cold start removed via background model pre-warm on
  activation.
