# RAG Architecture Report — Decisions, Challenges & Workarounds

## Document Details
- **Created:** 2026-09-12
- **Audience:** A developer building their first RAG system (in-memory, local-first)
- **Scope:** The retrieval pipeline of Agentic Chat Q&A Bot — chunking, embeddings,
  hybrid retrieval, and the scope-gate saga (ADR-017)
- **Related:** `docs/ARCHITECTURE.md`, `docs/decisions.md` (ADR-001–ADR-018),
  `docs/council-meetings/meetings_2.md`, `docs/tasks/PLAN.md`

---

## 1. What This Project Is

A VS Code extension that captures an AI agent's response text (clipboard, selection,
status bar) into an isolated sidebar console, then answers questions against that
captured text using local embeddings plus an LLM. Embeddings and chunking run
100% on-device (ONNX `all-MiniLM-L6-v2`, 384 dimensions); generation goes to an
OpenAI-compatible endpoint (DeepSeek/OpenRouter).

## 2. The 5-Stage Pipeline

```text
Capture → Chunk → Embed → Retrieve → Generate
```

1. **Capture** (`src/captureManager.ts`, `SidebarProvider.setCapturedResponse`):
   raw text in, UI preview out, background indexing kicked off.
2. **Chunk** (`src/rag/chunker.ts`): structural markdown segmentation, typed
   `code | prose | list`, hard 200-token ceiling.
3. **Embed** (`src/rag/embedder.ts`): quantized MiniLM via `@xenova/transformers`,
   mean pooling, L2-normalized 384d vectors, sequential to stay light on RAM.
4. **Retrieve** (`src/rag/retriever.ts`): cosine similarity + sub-tokenized BM25,
   fused with Reciprocal Rank Fusion (k=60), normalized to [0, 1].
5. **Generate** (`src/llm/prompt.ts` + `src/llm/generator.ts`): 3-tier message
   assembly (system constitution → XML context → history → query), intent-tuned
   temperature, SSE streaming with batch fallback, retry on 429/5xx.

Scope is deliberately tiny: one captured response = roughly 5–35 chunks. That
single fact drives almost every decision below.

## 3. Challenge 1 — Naive Splitters Destroy Code

**Problem.** Fixed-size character windows cut functions in half, split markdown
fences so the UI renders broken code, and emit 300–500-token chunks into a model
with a 256-token window. MiniLM does not error on overflow — it silently drops
everything past token 256, so the vector quietly represents only the first half
of the chunk. Retrieval quality degrades with no signal anywhere.

**Workaround.** `chunkText` scans for fenced code blocks first with a fence regex,
keeps any block ≤ 200 tokens fully atomic (fences included), splits oversized
blocks only on line boundaries with a 2-line overlap while re-wrapping each slice
in its language fence, splits prose on paragraph breaks with a sentence-terminator
fallback (`. ! ?`), types lists separately, and compacts trailing fragments under
20 tokens into the previous same-type chunk (tiny fragments pollute vector space).

**Why 200, not 256.** Token counts here are estimated with `ceil(chars / 4)`, a
heuristic that diverges from MiniLM's WordPiece tokenizer — especially on code.
The 56-token margin guarantees every chunk is fully embedded. This is the first
thing to check on any new RAG project: know your embedding model's real limit
and stay clearly under it.

## 4. Challenge 2 — Embeddings Cannot See Code Identifiers

**Problem.** Dense vectors capture semantics ("user lookup") but miss exact
symbols. A query like *"how does getUserById handle errors"* must match the
literal identifier `getUserById`, and plain cosine similarity over 384d MiniLM
vectors is unreliable for that.

**Workaround.** Hybrid retrieval. Both documents and queries pass through
`tokenizeCodeAndProse`, which splits camelCase/PascalCase/snake_case/kebab-case
into sub-tokens while keeping the compound form:

```text
getUserById → ['get', 'user', 'by', 'id', 'getuserbyid']  (minus stop words)
```

BM25 (k1 = 1.2, b = 0.75) scores keyword overlap; cosine scores semantics. The
two rankings fuse with Reciprocal Rank Fusion:

```text
RRF(d) = 1/(60 + Rank_BM25(d)) + 1/(60 + Rank_Vector(d))
Score_norm(d) = RRF(d) / (2/61)   ∈ [0, 1]
```

RRF is the right fusion because it needs no raw-score calibration between two
incomparable scales — only ranks. The normalized score doubles as the UI
confidence value.

## 5. Challenge 3 — Stop Words Poison BM25

**Problem.** During guardrail testing, *"Who won the 1998 soccer world cup in
France?"* scored BM25 > 0 against programming chunks — the only shared token was
*"the"*. Common English words created false keyword matches.

**Workaround.** A `STOP_WORDS` set filters high-frequency non-content words out
of `tokenizeCodeAndProse`, so BM25 fires only on domain terms and identifiers.
Lesson: off-the-shelf NLP stop lists are built for prose; code-aware search needs
its own filter, and the failure mode (false matches disabling a safety gate) is
worth a unit test, which is exactly what caught it here.

## 6. Challenge 4 — The Scope Gate: Filter Chunks, Not Questions

**Problem.** Off-topic questions (*"how do I bake a cake?"* against a Redis
context) would burn LLM tokens for useless answers. The first design was a
pre-retrieval gate in `hybridRetrieve`: reject when `maxCosine < 0.20` AND
`BM25 == 0` AND the query failed a 30+ pattern `isMetaQuery()` regex list.

**Why it broke.** Cosine similarity measures *text* similarity, not *topical*
relevance. *"Explain this in simpler terms"* is entirely about the captured
context yet shares almost no tokens with it — low cosine, zero BM25, and any
phrasing the regex list did not anticipate meant rejection. The user's Redis
example exposed it: the question the extension exists to answer was the one most
at risk of being blocked. Patching meant curating regex forever (open-closed
violation).

**Council debate (meetings_2.md).** Architect: the gate conflates cost protection
with relevance classification — separate them. Skeptic: removing it risks the LLM
answering trivia from general knowledge while users believe it is grounded, plus
rate-limit burn and slower refusals. Pragmatist: delete it in three cuts; one
marginal API call (~$0.001) costs less than false-rejection frustration.
Researcher: no major product gates questions — NotebookLM grounds and discloses,
Perplexity filters *documents* through multi-stage ranking, ChatGPT file upload
falls back to general knowledge; the literature (Self-RAG, CRAG, ScoreGate) is
explicit that low embedding similarity does not exclude relevance. 3-to-1 for
removal.

**Decision (ADR-017).** Deleted `isMetaQuery()`, the threshold constant, and the
pre-check block (~90 lines). Every question reaches the LLM while context exists.
The Skeptic's concern moved to the correct layer: a strengthened system-prompt
rule instructs the model to disclose (*"The captured response doesn't cover this
directly..."*) before offering general knowledge, and to refuse genuinely
unrelated questions. `isOutOfScope` stays in `RetrievalResult` as always-`false`
to avoid an interface cascade.

**The interview-ready one-liner:** *"I removed the pre-retrieval scope gate.
The LLM receives the captured context and is the single relevance judge — it
grounds in context when possible, expands when asked, refuses when unrelated.
Filter chunks, not questions."*

## 7. Challenge 5 — First Query Pays the Model Download

**Problem.** `getEmbeddingPipeline()` lazily loads MiniLM on first use: model
download from HuggingFace plus ONNX session init, 5–15s and ~100 MB, with no
fallback. The "zero network calls" claim was false on cold start.

**Workaround (ADR-018).** Fire-and-forget `getEmbeddingPipeline()` in
`activate()` with `try/catch` + log. The model warms while the user explores the
UI. Embedding failures, previously swallowed by `console.error` with vectors left
as `[]`, now post a visible webview warning so BM25-only degradation is disclosed.

## 8. Challenge 6 — Rapid Re-Capture Answers From Stale Vectors

**Problem.** Capture A starts background indexing → user captures B → user asks a
question → `this.vectors` may still hold A's embeddings. The answer grounds in
the wrong context with no visible error.

**Workaround (ADR-018).** A monotonic `generationCounter`, incremented on every
`setCapturedResponse` (and context reset), snapshotted at the start of indexing
and of `handleUserQuestion`, checked before storing vectors, before retrieval
results are used, and before rendering answers. Stale runs are discarded
silently. General lesson for async UIs: never trust that the state your handler
started with is still current when it finishes — a counter is the cheapest
correct guard.

## 9. Challenge 7 — Native Dependencies Break Electron Extensions

**Problem.** `@xenova/transformers` statically imports `sharp` (image pipeline);
on Windows + newer Node the native `node-gyp` build fails, even though only text
embeddings are used. Separately, an unused `@img/sharp-win32-x64` entry shipped
~12 MB of dead weight.

**Workaround.** Install with `--ignore-scripts` (ADR-008), stub `sharp` for
text-only pipelines (ADR-012), and delete the unused dependency. Rule of thumb:
in VS Code extensions, every native module is a future Electron-ABI breakage —
prefer pure WASM/JS runtimes.

## 10. Supporting Reliability: Retry and Token Cache

- **Retry (ADR-018):** `fetchWithRetry` wraps both batch and streaming calls —
  up to 3 attempts on 429/5xx with 1s/2s/4s + jitter backoff. 401 and aborts
  never retry. Free-tier rate limits made single-attempt calls a session killer.
- **Token cache (ADR-018):** `tokenizeCodeAndProse()` results are computed once
  at capture time in `SidebarProvider` and passed into `computeBM25Scores` via an
  optional parameter, instead of re-tokenizing every chunk per query.

## 11. Lessons for Your Next RAG Project

1. **Check the embedding model's real token limit first** — silent truncation is
   the failure mode that never pages you.
2. **Hybrid retrieval beats pure vectors for code** — BM25 catches identifiers,
   RRF fuses without score calibration.
3. **In-memory is correct at small scope** — 35 chunks × 384 dims retrieves in
   <0.5 ms. Reach for a vector DB only at millions of vectors.
4. **Filter chunks, not questions** — the model with context in hand judges
   relevance better than any pre-filter.
5. **Pre-warm expensive resources** on activation, not on first use.
6. **Guard async staleness with a generation counter** — cheap, total coverage.
7. **Delete heuristics the LLM subsumes** — every regex list is future maintenance
   debt; ~90 lines deleted here with zero capability lost.
