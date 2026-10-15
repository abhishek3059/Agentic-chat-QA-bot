<div align="center">

# QA Assistant

### Your AI Response Inspector

**Stop asking follow-up questions in the wrong chat.**

[![VS Code Extension](https://img.shields.io/badge/VS%20Code-v1.85+-007ACC?logo=visualstudiocode&logoColor=white)](https://code.visualstudio.com/)
[![TypeScript](https://img.shields.io/badge/TypeScript-Strict%205.3-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Privacy First](https://img.shields.io/badge/Privacy-100%25%20Local-success)](#-privacy)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

</div>

---

## Why You Need This

You're using **Copilot**, **ChatGPT**, **Cursor**, or **Claude** — and they're great at generating code. But when you need to **verify, interrogate, or deep-dive** into their responses, you're stuck asking follow-up questions in the same chat window.

**That's a problem.**

### The Context Drift Trap

When you ask follow-up questions inside your main AI chat:

1. **Context gets polluted** — Your 2,000-word architectural response gets buried under new questions
2. **AI starts hallucinating** — The agent confuses follow-up questions with code editing instructions
3. **You burn tokens** — Re-sending entire transcripts for simple clarifications is expensive
4. **You can't verify** — Is the AI's follow-up explanation accurate, or did it just make something up?

### The Solution: Scoped Q&A Sandbox

**QA Assistant** gives you an isolated console to interrogate any AI response — without touching your main chat.

| Your Current Tools | QA Assistant |
|-------------------|--------------|
| Generate code | **Verify** what was generated |
| Chat in context | **Isolate** specific responses |
| Risk context drift | **Zero drift** — separate sandbox |
| No citation tracking | **Cite sources** from captured text |

---

## How It Works

```
┌─────────────────────────────────────────────────────────────┐
│  1. CAPTURE                                                  │
│  Copy any AI response → Press Ctrl+Alt+Q                    │
│  (or right-click → "Ask About Selection")                   │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│  2. INTERROGATE                                              │
│  Ask follow-up questions in the sidebar console             │
│  "Explain this simpler"  •  "What are the trade-offs?"      │
│  "Show me an example"    •  "Is this safe to use?"          │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│  3. GET GROUNDED ANSWERS                                     │
│  AI retrieves context from YOUR captured text               │
│  Citations included • No hallucination • 100% local         │
└─────────────────────────────────────────────────────────────┘
```

---

## Key Features

### Local & Private
Your code never leaves your machine. Embeddings run **100% locally** via ONNX — no cloud vector databases, no telemetry, no tracking.

### Works With Any AI
Copilot, ChatGPT, Cursor, Claude, DeepSeek, local Ollama — capture responses from **any AI tool** and interrogate them here.

### Smart Retrieval
Hybrid search combines **semantic understanding** (vector similarity) with **keyword matching** (BM25) for accurate context retrieval.

### Real-Time Streaming
Watch answers generate token-by-token with live streaming — no waiting for batch responses.

### Multi-Turn Context
Ask follow-up questions naturally. The system remembers your last 3-4 questions for conversational flow.

---

## Quick Start

### Install

Search **"QA Assistant"** in the VS Code Extensions panel (`Ctrl+Shift+X`) and click Install.

### Setup (2 minutes)

1. **Configure provider** — `Ctrl+Shift+P` → `QA Assistant: Configure LLM Provider`
2. **Set API key** — `Ctrl+Shift+P` → `QA Assistant: Set LLM API Key`
   - *No key needed for local Ollama*
3. **Capture & ask** — Copy any AI response, press `Ctrl+Alt+Q`, ask a question

### Supported Providers

- **OpenRouter** (DeepSeek, Llama, Claude, Mistral — 400+ models)
- **DeepSeek** API directly
- **Ollama** / LM Studio / vLLM (local)
- **OpenAI** / Azure OpenAI (via custom endpoint)

---

## Commands

| Command | Shortcut | Description |
|---------|----------|-------------|
| `QA Assistant: Capture Clipboard` | `Ctrl+Alt+Q` | Capture clipboard text to Q&A |
| `QA Assistant: Ask About Selection` | Right-click | Send selected text to Q&A |
| `QA Assistant: Set LLM API Key` | — | Configure API key securely |
| `QA Assistant: Configure Provider` | — | Pick your LLM provider |

---

## Privacy & Security

- **Zero Telemetry** — No analytics, no tracking, no metrics
- **Local Embeddings** — All vectorization happens on your device
- **Encrypted Keys** — API keys stored in OS keychain via VS Code SecretStorage
- **No Code Transmission** — Your code never leaves your machine for indexing

---

## Documentation

- [CHANGELOG.md](CHANGELOG.md) — Release notes
- [LICENSE](LICENSE) — MIT License

---

## Questions or Issues?

[Open an issue](https://github.com/abhishek3059/Agentic-chat-QA-bot/issues) on GitHub.
