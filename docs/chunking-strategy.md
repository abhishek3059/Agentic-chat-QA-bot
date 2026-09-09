# Structural Markdown & Code Chunking Strategy

## Executive Summary
This document explains the technical rationale and algorithmic design behind the **Context-Aware Structural Chunking Engine** implemented in [`src/rag/chunker.ts`](../src/rag/chunker.ts). 

Rather than treating captured AI agent responses as raw unformatted strings, our engine parses markdown structure first—preserving code fences as atomic units, classifying segments by structural type (`code`, `prose`, `list`), and capping chunks at **200 tokens** to prevent silent truncation in our local embedding model.

---

## 1. The Core Problem: Why Standard Chunkers Fail on Code & Agent Responses

Most RAG systems rely on naive text splitters (e.g., fixed character splits of 500 characters, or sliding token windows). When applied to technical assistant responses, these splitters introduce three fatal failure modes:

| Failure Mode | Naive Chunking Behavior | Impact on Developer Q&A |
|---|---|---|
| **Broken Code Syntax** | Cuts code blocks mid-function or mid-expression | Destroys syntax trees; embeddings lose function intent and semantic context |
| **Unclosed Markdown Fences** | Splits ` ```typescript ` at line 10, leaving line 11 without opening or closing fences | Broken markdown rendering in UI; model hallucinates missing brackets |
| **Silent Embedding Truncation** | Emits chunks of 300–500 tokens into `all-MiniLM-L6-v2` | Tokens after #256 are **silently dropped** by the embedding model without error |
| **Fragment Pollution** | Leaves 2-word closing lines as standalone chunks (e.g. *"Hope this helps!"*) | Clutters vector space with high-similarity noise chunks |

---

## 2. The Algorithmic Solution

```mermaid
flowchart TD
    Raw["Raw Captured Text (Markdown + Code)"] --> SplitFence{"Regex Code Isolation<br/>(```lang ... ```)"}
    
    SplitFence -->|Fenced Code| CodeCheck{"Token Count <= 200?"}
    CodeCheck -->|Yes| AtomicCode["Keep Block 100% Atomic<br/>(type: 'code', language)"]
    CodeCheck -->|No (> 200)| OverlapCode["Split by Statement Lines<br/>2-Line Overlap + Re-wrap Fences"]
    
    SplitFence -->|Prose & Lists| SplitPara["Split on Paragraph Breaks (\n\n)"]
    SplitPara --> TypeCheck{"Classify Type<br/>List vs Prose"}
    TypeCheck --> AccCheck{"Accumulator + Para <= 200 Tokens?"}
    AccCheck -->|Yes| MergeAcc["Merge into Accumulator"]
    AccCheck -->|No| FlushAcc["Flush Accumulator<br/>If Para > 200: Split on Sentence (. ! ?)"]
    
    AtomicCode & OverlapCode & MergeAcc & FlushAcc --> CompactFloor{"Fragment < 20 Tokens?"}
    CompactFloor -->|Yes| MergePrev["Merge into Preceding Chunk"]
    CompactFloor -->|No| EmitChunk["Emit Typed Chunk (<= 200 tokens)"]
```

---

## 3. Four Core Architectural Rules

### Rule 1: Atomic Code Fences
- Code blocks represent indivisible logical units (functions, classes, configs).
- If a code block is **$\le 200$ tokens**, it is kept **100% intact**.
- If a code block exceeds 200 tokens, it is split across statement lines with a **2-line overlap** for context continuity, and **each slice is re-wrapped in its language fence** (e.g., ````typescript ... ````).

### Rule 2: Structural Classification (`type: 'code' | 'prose' | 'list'`)
- Every chunk is tagged with its structural type.
- **Lists** (`- `, `* `, `1. `) are separated from narrative prose and chunked line-by-line along list boundaries so bulleted steps remain cohesive.
- **Prose** paragraphs are accumulated as complete semantic ideas.

### Rule 3: Sentence-Boundary Fallback (No Mid-Sentence Cuts)
- Prose accumulation merges complete paragraphs until reaching the 200-token limit.
- If a single oversized paragraph exceeds 200 tokens, the engine falls back to splitting strictly on sentence terminators (`/(?<=[.!?])\s+/`), never slicing words in half.

### Rule 4: Fragment Compaction Floor (Minimum 20 Tokens)
- Small fragments ($< 20$ tokens, $\approx 80$ characters) produce poor vector representations and dilute BM25 scoring.
- Any trailing fragment under 20 tokens is automatically compacted into the preceding chunk of the same type if space permits.

---

## 4. The 200-Token Hard Ceiling (Why 200?)

Our local vector engine uses **`Xenova/all-MiniLM-L6-v2`** running on ONNX Runtime:
- **Maximum Context Window:** 256 tokens.
- **Model Truncation Policy:** Any input exceeding 256 tokens is silently truncated. Tokens 257+ produce **zero influence** on the resulting embedding.
- **Our Threshold:** We enforce a **200-token ceiling** ($\approx 800$ characters).
- **The 56-Token Safety Margin:** Accommodates tokenizer differences between the heuristic ($\approx 4\text{ chars/token}$) and the WordPiece tokenizer, ensuring that **100% of every chunk is fully embedded and retrievable**.

---

## 5. Related Files & Decision Records
- **Implementation:** [`src/rag/chunker.ts`](../src/rag/chunker.ts)
- **Data Contracts:** [`src/rag/types.ts`](../src/rag/types.ts) (`Chunk`, `ChunkType`, `ChunkerOptions`)
- **Unit Test Suite:** [`test/unit/chunker.test.ts`](../test/unit/chunker.test.ts) (100% passing)
- **Formal Decision Record:** [ADR-004 in `docs/decisions.md`](decisions.md#adr-004-structural-markdown--code-chunking-with-a-200-token-ceiling)
