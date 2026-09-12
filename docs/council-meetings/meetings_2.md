# 🏛️ Council Deliberation: Architecture Review & Scope Guardrail Removal

## Meeting Details
- **Date:** 2026-09-12
- **Members:** The Architect, The Skeptic, The Pragmatist, The Researcher
- **Method:** Two rounds — Round 1 via `general` subagent type (architecture review),
  Round 2 via `explore` subagent type (scope guardrail deep-dive, per the
  universal council skill fallback when `general` is denied)
- **Trigger:** User critique — *"When I capture Redis pooling and ask 'Explain this
  simpler', the bot blocks me. That's the entire point of the extension."*

---

## The Questions
1. Reason about this project's architecture. Strongest choices? Risks? What next?
2. Should the scope guardrail block low-overlap questions, or should the bot always
   allow questions when context exists and let the LLM judge relevance?

---

## 🏗️ The Architect's Perspective

**Stance: Cautiously supportive of the pipeline; critical of the orchestration layer.**

Strongest choices: in-memory array + hybrid RRF retrieval (correct for 5–35 chunks,
zero native deps, sub-ms latency); clean semantic XML context injection (ADR-014)
eliminating metadata leakage; intent-aware temperatures + adaptive topK;
200-token ceiling with atomic code fences.

Risks: `SidebarProvider` is a 378-line God Object (lifecycle, routing, state,
API keys, chunking, embedding, retrieval, prompts, streaming, history) — extract
`RagPipeline` and `ChatSession` services before adding features. No cancellation
semantics: a new capture while indexing/generation is in-flight leaves stale
vectors in play. No retry/backoff for 429/5xx on free-tier endpoints. BM25
re-tokenizes all chunks on every query instead of caching. Embedding failures are
silently swallowed (`console.error` only, vectors stay `[]`).

On the scope gate: it conflates cost protection with relevance classification.
`isMetaQuery`'s 30+ regex patterns violate open-closed — every new phrasing needs
a patch. Recommendation: simplify the guardrail to a low cosine floor, delete the
regex list, delegate borderline relevance to the LLM.

---

## 🔴 The Skeptic's Perspective

**Stance: Cautiously supportive; the bones are solid but several time bombs tick.**

1. **ONNX cold-start:** first query triggers model download + session init (5–15s,
   80–120 MB), no pre-warming, no fallback, and `allowLocalModels = false` means
   the "zero network calls" claim is false on first run.
2. **Token estimation** (`ceil(length/4)`) systematically overestimates for code,
   producing smaller chunks than necessary.
3. **Scope gate false rejections:** short queries can score cosine < 0.20 with
   BM25 = 0 even when topically related.
4. **No persistence:** every reload destroys captured context.
5. **Silent SSE parse failures** (`generator.ts` catch-ignore) can truncate answers
   invisibly.
6. **"Universal cross-IDE" is overstated** — coupled to the `vscode.*` API surface.

On removing the gate: the gate is already more permissive than the user thinks
("explain" matches the regex and passes). Real risks of full removal: hallucination
with empty context (LLMs answer from general knowledge and users believe it is
grounded), rate-limit burn on free tiers, slower refusals (2–5s LLM round-trip vs
<0.5ms gate), inconsistent behavior. Verdict: don't remove, widen bypasses.

---

## 🔧 The Pragmatist's Perspective

**Stance: Supportive. Ship now; biggest risk is untested integration.**

In-memory arrays and local ONNX are the right call. SSE streaming with batch
fallback is exactly right. Intent-calibrated temperatures are pragmatic.
Test suite covers the pure-function layer well.

Over-engineering: `isMetaQuery`'s 30+ patterns — 8–10 cover 95% of usage; the rest
is speculative. The `sharp` dependency (`@img/sharp-win32-x64`) is unused dead
weight (~12 MB in the VSIX) — cut it. Two system messages could be one.

Priorities: (1) `vsce package` + F5 smoke test before writing another line,
(2) usage counter via `globalState`, (3) cut `sharp`.

On the gate: **delete it in 3 surgical cuts** — remove the pre-check block in
`retriever.ts`, remove the early-exit refusal in `SidebarProvider.ts`, remove the
3 guardrail tests. ~90 lines deleted, zero regex to maintain, the LLM already
refuses gracefully via its system prompt.

---

## 📚 The Researcher's Perspective

**Stance: Supportive (82/100). Strong alignment with established RAG practice.**

Hybrid BM25 + dense via RRF (k=60) follows ColBERT/PLAID literature and hybrid-RAG
surveys. Sub-tokenization mirrors CodeBERT-style tokenizers. The 200-token ceiling
with 56-token margin under MiniLM's 256 limit is well-reasoned. In-memory storage
matches LlamaIndex `SimpleVectorStore` precedent; the Electron ABI argument against
SQLite is valid. ADR-014's pivot away from zone cards + metadata leakage is the
most important UX improvement.

Gaps (justified at this scale): no cross-encoder re-ranker, no AST-based chunking,
regex-based intent classification. Note: ARCHITECTURE.md documents BM25 k1 = 1.5
but the implementation uses k1 = 1.2 — documentation inconsistency, both standard.

On the gate: **no major product filters questions.** NotebookLM uses source
grounding (discloses absence, doesn't refuse the question). Perplexity filters
*documents* through BM25 → embedding threshold → ML reranker; the question is never
blocked. ChatGPT file upload falls back to general knowledge. LangChain/LlamaIndex
thresholds filter *retrieved chunks*. Literature (Self-RAG, CRAG, ChunkRAG,
ScoreGate, MAIN-RAG) is unanimous: *"high embedding similarity does not guarantee
contextual relevance, and low embedding similarity does not exclude relevance."*
Recommendation: remove the question gate; control quality at the retrieval layer.

---

## 📊 Council Verdict — Round 1 (Architecture)

| Member | Stance | Confidence |
|--------|--------|------------|
| 🏗️ The Architect | Cautiously supportive | 82/100 |
| 🔴 The Skeptic | Cautiously supportive | 68/100 |
| 🔧 The Pragmatist | Supportive | 82/100 |
| 📚 The Researcher | Supportive | 82/100 |

**Consensus:** Core pipeline is sound. Ship after a 1–2 hour cleanup
(cancellation guard, `sharp` removal, retry logic) plus smoke testing.

---

## 📊 Council Verdict — Round 2 (Scope Guardrail)

| Member | Position | Rating |
|--------|----------|--------|
| 🏗️ The Architect | Simplify to low cosine floor, delete regex, delegate to LLM | 3.7/5 |
| 🔴 The Skeptic | Keep gate, widen bypasses (hallucination + cost + UX risks) | 2.3/5 |
| 🔧 The Pragmatist | Delete gate in 3 surgical cuts | 3.7/5 |
| 📚 The Researcher | Delete gate; filter chunks, not questions | 4.0/5 |

### Consensus
3 of 4 agree: **remove the scope pre-check gate entirely.**

### Sharpest Disagreement
The Skeptic warns the LLM will answer off-topic questions from general knowledge
and users will mistake it for grounded output — worse than a clean refusal.

### Resolution
The Skeptic's concern is real but belongs at the **prompt layer**, not the
**retrieval layer**. Strengthen the system-prompt refusal (rule 3) so the model
says *"this isn't addressed in the captured context"* instead of silently
answering from general knowledge. Cost per extra call (~$0.001 on DeepSeek) is
negligible next to false-rejection frustration. The Researcher's evidence is
decisive: no major RAG product gates questions.

---

## 🔨 Decisions Taken

1. **Delete `isMetaQuery()` entirely** — 30+ regex patterns, constant curation burden.
2. **Delete the scope pre-check block** — no more `maxCosine < threshold && BM25 === 0` gating.
3. **All questions reach the LLM when context exists** — only `chunks.length === 0`
   produces the "no context captured yet" guidance.
4. **Strengthen the system-prompt refusal** — the LLM becomes the single relevance judge.
5. **Keep `isOutOfScope` in `RetrievalResult`** as always-`false` for interface
   compatibility; clean up in a future pass.
6. **Proceed with reliability fixes** — cancellation guard, retry/backoff,
   embedding-failure surfacing, ONNX pre-warm, tokenized-chunk cache.
7. **Ship gate** — `vsce package` + F5 smoke test after Phase A–B.

> [!IMPORTANT]
> Round 1 was 4 independent perspectives via parallel subagents. Round 2 was
> 4 independent perspectives via the universal council skill
> (`C:\Users\user\.shared\skills\council\SKILL.md`) using the `explore`
> subagent fallback, followed by anonymized peer review and chairman synthesis.
