/**
 * src/rag/types.ts
 * ----------------------------------------------------------------
 * Core Data Contracts for the Scoped RAG Pipeline
 * ----------------------------------------------------------------
 */
/**
 * Structural classification of a chunk.
 * - 'code': Fenced code blocks (```lang ... ```).
 * - 'prose': Paragraphs, headers, and general descriptive text.
 * - 'list': Markdown bullet points, numbered lists, or checklists.
 */
export type ChunkType = 'code' | 'prose' | 'list';

/**
 * A single segmented unit of captured response
 */

export interface Chunk {
    // Deterministic identifier (e.g., 'chunk-0', 'chunk-1') 
    id: string;
    // The clean text content of the chunk
    text: string;
    // Structural classification
    type: ChunkType;
    // programming language for code block (eg.typescript, python, bash, etc.)
    language?: string;
    // Estimated token count (1 token = 4 characters)
    tokenCount: number;
    // Starting and ending character index [start, end] in original captured text
    charRange: [number, number];
}

// A retrieved chunk with its multi-model relevance scores

export interface ScoredChunk {
    // The underlying Chunk
    chunk: Chunk;
    // cosine similarity score [0, 1] from dense vector matching
    vectorScore: number;
    // Keyword frequency score (>= 0) from sub-tokenized BM25
    bm25Score: number;
    // Normalized Reciprocal Rank Fusion(RRF) score in [0, 1].
    // Calculated via: RRF(d) / (2 / 61)
    combinedScore: number;
}

// configuration options for the structural chunker.
export interface ChunkerOptions {
    // Target maximum tokens per chunk
    // Default: 200 (calculated with safe headroom under MiniLLM's 256 token limit)
    maxTokensPerChunk?: number;
    // Minumum token threshold before merging tiny fragments.
    // Default: 20
    minTokensPerChunk?: number;
}
// configuration options for the hybrid retriever.
export interface RetrieverOptions {
    // Number of top chunks to return (default: 3)
    topk?: number;
    // CamelCase alias for topk
    topK?: number;
    // Deprecated (ADR-017): the question-level scope pre-check was removed.
    // Kept for interface compatibility; hybridRetrieve ignores this field.
    scopeThreshold?: number;
}

/**
 * Result returned by the hybrid retrieval engine.
 */
export interface RetrievalResult {
    // Top-k retrieved chunks ranked by normalized RRF score
    chunks: ScoredChunk[];
    // True if query was flagged as completely out of scope
    isOutOfScope: boolean;
    // Optional explanation or trigger reason
    reason?: string;
}


