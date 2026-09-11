/**
 * src/rag/retriever.ts
 * ----------------------------------------------------------------
 * In-Memory Hybrid Retriever
 * ----------------------------------------------------------------
 * Combines sub-tokenized BM25 keyword matching with dense vector
 * cosine similarity, fused via Normalized Reciprocal Rank Fusion (RRF).
 * Includes a fast scope pre-check guardrail to short-circuit
 * completely out-of-scope user queries before making LLM calls.
 */

import { Chunk, ScoredChunk, RetrieverOptions, RetrievalResult } from './types';
import { embedText } from './embedder';

export const DEFAULT_TOP_K = 3;
export const DEFAULT_SCOPE_THRESHOLD = 0.20;
export const RRF_K = 60;

/**
 * Computes cosine similarity between two dense vectors.
 * Returns a value in [0, 1] for non-negative space, or [-1, 1] generally.
 */
export function cosineSimilarity(vecA: number[], vecB: number[]): number {
    if (vecA.length === 0 || vecB.length === 0 || vecA.length !== vecB.length) {
        return 0;
    }

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < vecA.length; i++) {
        dotProduct += vecA[i] * vecB[i];
        normA += vecA[i] * vecA[i];
        normB += vecB[i] * vecB[i];
    }

    if (normA === 0 || normB === 0) {
        return 0;
    }

    const similarity = dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
    return Math.max(-1, Math.min(1, similarity));
}

/**
 * Sub-tokenizes text for code-aware BM25 search.
 * Splits camelCase, PascalCase, and snake_case into sub-words while
 * preserving compound words (e.g., 'getUserById' -> ['get', 'user', 'by', 'id', 'getuserbyid']).
 */
/**
 * Standard stop words filtered from keyword matching to prevent false positives.
 */
export const STOP_WORDS = new Set([
    'a', 'about', 'above', 'after', 'again', 'against', 'all', 'am', 'an', 'and', 'any', 'are', 'as',
    'at', 'be', 'because', 'been', 'before', 'being', 'below', 'between', 'both', 'but', 'by', 'could',
    'did', 'do', 'does', 'doing', 'down', 'during', 'each', 'few', 'for', 'from', 'further', 'had',
    'has', 'have', 'having', 'he', 'her', 'here', 'hers', 'herself', 'him', 'himself', 'his', 'how',
    'i', 'if', 'in', 'into', 'is', 'it', 'its', 'itself', 'just', 'me', 'more', 'most', 'my', 'myself',
    'no', 'nor', 'not', 'now', 'of', 'off', 'on', 'once', 'only', 'or', 'other', 'our', 'ours',
    'ourselves', 'out', 'over', 'own', 'same', 'she', 'should', 'so', 'some', 'such', 'than', 'that',
    'the', 'their', 'theirs', 'them', 'themselves', 'then', 'there', 'these', 'they', 'this', 'those',
    'through', 'to', 'too', 'under', 'until', 'up', 'very', 'was', 'we', 'were', 'what', 'when',
    'where', 'which', 'while', 'who', 'whom', 'why', 'with', 'would', 'you', 'your', 'yours'
]);

/**
 * Sub-tokenizes text for code-aware BM25 search.
 * Splits camelCase, PascalCase, and snake_case into sub-words while
 * preserving compound words (e.g., 'getUserById' -> ['get', 'user', 'by', 'id', 'getuserbyid'])
 * and filtering out common non-content stop words.
 */
export function tokenizeCodeAndProse(text: string): string[] {
    if (!text || !text.trim()) {
        return [];
    }

    // Split on non-alphanumeric boundaries
    const rawTokens = text.split(/[^a-zA-Z0-9_-]+/);
    const result: string[] = [];

    for (const raw of rawTokens) {
        const token = raw.trim();
        if (!token) {
            continue;
        }

        // Add the lowercase whole token
        const lower = token.toLowerCase();
        result.push(lower);

        // Split snake_case or kebab-case
        if (token.includes('_') || token.includes('-')) {
            const parts = token.split(/[_-]+/).map(p => p.toLowerCase()).filter(p => p.length > 1);
            result.push(...parts);
        }

        // Split camelCase or PascalCase: e.g. getUserById -> ['get', 'User', 'By', 'Id']
        const camelParts = token
            .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
            .replace(/([A-Z]+)([A-Z][a-z0-9])/g, '$1 $2')
            .split(/\s+/)
            .map(p => p.toLowerCase())
            .filter(p => p.length > 1);

        if (camelParts.length > 1) {
            result.push(...camelParts);
        }
    }

    return Array.from(new Set(result.filter(t => t.length > 1 && !STOP_WORDS.has(t))));
}

/**
 * Determines whether a query is a meta-transformation request
 * (e.g., 'explain this', 'summarize this', 'what does this do') which
 * shouldn't be rejected by the scope guardrail even with low keyword overlap.
 */
export function isMetaQuery(query: string): boolean {
    const q = query.trim().toLowerCase();
    const metaPatterns = [
        // Meta-explanation, simplification, and deep-dives
        /\bexplain\b/i,
        /\bsummariz/i,
        /\brecap\b/i,
        /\bwhat does (this|it)\b/i,
        /\bwhat is (this|it)\b/i,
        /\bwalk ?through\b/i,
        /\bhow does (this|it) work\b/i,
        /\bbreak (this|it) down\b/i,
        /\bsimplif/i,
        /\boverview\b/i,
        /\belaborat/i,
        /\btell me more\b/i,
        /\bclarif/i,

        // Pedagogical & Analogies
        /\banalog(y|ies)\b/i,
        /\bmetaphor\b/i,
        /\bin simple terms\b/i,
        /\blike i['’]?m (five|5)\b/i,
        /\bbeginner\b/i,

        // Alternatives, trade-offs, and comparisons
        /\balternative(s)?\b/i,
        /\bother (option|approach|alternative|way|method|pattern)s?\b/i,
        /\btrade-?offs?\b/i,
        /\bpros? (and|&) cons?\b/i,
        /\badvantages?\b/i,
        /\bdisadvantages?\b/i,
        /\bcomparison\b/i,
        /\bcompare\b/i,
        /\bversus\b/i,
        /\bvs\.?\b/i,

        // Edge cases, gotchas, pitfalls, limitations
        /\b(edge|corner) cases?\b/i,
        /\b(pitfall|gotcha|caveat|limitation|drawback)s?\b/i,

        // Implementation & Code Generation
        /\bshow (me )?(the )?(full )?(code|implementation)\b/i,
        /\b(full )?implementation\b/i,
        /\b(code|implementation) (example|snippet)\b/i,
        /\bshow (me )?(a )?(working )?example\b/i,
        /\bstep[- ]by[- ]step\b/i,

        // Testing & Reliability
        /\bhow (do|can) (i|we) test\b/i,
        /\btest(ing)? (this|it)?\b/i,
        /\bunit test\b/i,
        /\bbenchmark\b/i,

        // Scope expansions & takeaways
        /\bkey takeaways\b/i,
        /\bwhat (did|am) (i|we) miss\b/i,
        /\bwhat else\b/i,
        /\bhow (do|can) i (use|apply|run)\b/i
    ];
    return metaPatterns.some(pattern => pattern.test(q));
}

/**
 * Computes BM25 keyword relevance scores across all chunks.
 * Parameters: k1 = 1.2, b = 0.75.
 */
export function computeBM25Scores(queryTokens: string[], chunks: Chunk[]): number[] {
    const N = chunks.length;
    if (N === 0 || queryTokens.length === 0) {
        return new Array(N).fill(0);
    }

    const k1 = 1.2;
    const b = 0.75;

    // Tokenize each chunk and calculate document lengths
    const chunkTokensList = chunks.map(chunk => tokenizeCodeAndProse(chunk.text));
    const docLengths = chunkTokensList.map(tokens => tokens.length);
    const avgdl = docLengths.reduce((acc, len) => acc + len, 0) / (N || 1);

    // Calculate document frequency n(t) for each query token
    const docFreq: Map<string, number> = new Map();
    for (const qToken of queryTokens) {
        let count = 0;
        for (const cTokens of chunkTokensList) {
            if (cTokens.includes(qToken)) {
                count++;
            }
        }
        docFreq.set(qToken, count);
    }

    const scores: number[] = new Array(N).fill(0);

    for (let i = 0; i < N; i++) {
        const cTokens = chunkTokensList[i];
        const docLen = docLengths[i];
        let chunkScore = 0;

        // Build token count map for this chunk
        const termCounts: Map<string, number> = new Map();
        for (const t of cTokens) {
            termCounts.set(t, (termCounts.get(t) || 0) + 1);
        }

        for (const qToken of queryTokens) {
            const freq = termCounts.get(qToken) || 0;
            if (freq === 0) {
                continue;
            }

            const n_t = docFreq.get(qToken) || 0;
            // Standard Robertson-Sparck Jones IDF formula
            const idf = Math.log(1 + (N - n_t + 0.5) / (n_t + 0.5));
            const numerator = freq * (k1 + 1);
            const denominator = freq + k1 * (1 - b + b * (docLen / (avgdl || 1)));

            chunkScore += idf * (numerator / denominator);
        }

        scores[i] = Math.max(0, chunkScore);
    }

    return scores;
}

/**
 * Executes hybrid retrieval across captured chunks.
 */
export async function hybridRetrieve(
    query: string,
    chunks: Chunk[],
    vectors: number[][],
    options?: RetrieverOptions
): Promise<RetrievalResult> {
    const topK = options?.topK ?? options?.topk ?? DEFAULT_TOP_K;
    const scopeThreshold = options?.scopeThreshold ?? DEFAULT_SCOPE_THRESHOLD;

    if (!chunks || chunks.length === 0) {
        return {
            chunks: [],
            isOutOfScope: false
        };
    }

    // 1. Embed query
    const queryVector = await embedText(query);
    const queryTokens = tokenizeCodeAndProse(query);

    // 2. Compute Cosine & BM25 scores
    const vectorScores: number[] = chunks.map((_, i) =>
        vectors[i] ? cosineSimilarity(queryVector, vectors[i]) : 0
    );
    const bm25Scores: number[] = computeBM25Scores(queryTokens, chunks);

    // 3. Fast Scope Guardrail Pre-Check
    const maxCosine = Math.max(0, ...vectorScores);
    const totalBM25 = bm25Scores.reduce((acc, s) => acc + s, 0);
    const isMeta = isMetaQuery(query);

    if (!isMeta && maxCosine < scopeThreshold && totalBM25 === 0) {
        return {
            chunks: [],
            isOutOfScope: true,
            reason: `Query has no keyword overlap (BM25=0) and low semantic relevance (max cosine=${maxCosine.toFixed(3)} < ${scopeThreshold}).`
        };
    }

    // 4. Rank by Dense Vector Similarity
    const vectorRanked = chunks
        .map((_, idx) => ({ idx, score: vectorScores[idx] }))
        .sort((a, b) => b.score - a.score);

    const vectorRankMap = new Map<number, number>();
    vectorRanked.forEach((item, rank) => {
        vectorRankMap.set(item.idx, rank + 1); // 1-based rank
    });

    // 5. Rank by BM25 Keyword Match
    const bm25Ranked = chunks
        .map((_, idx) => ({ idx, score: bm25Scores[idx] }))
        .sort((a, b) => b.score - a.score);

    const bm25RankMap = new Map<number, number>();
    bm25Ranked.forEach((item, rank) => {
        bm25RankMap.set(item.idx, rank + 1); // 1-based rank
    });

    // 6. Reciprocal Rank Fusion (RRF) & Normalization
    // Max theoretical score: 1/(60+1) + 1/(60+1) = 2/61
    const maxTheoreticalRRF = 2 / (RRF_K + 1);

    const scoredChunks: ScoredChunk[] = chunks.map((chunk, idx) => {
        const vRank = vectorRankMap.get(idx) || chunks.length;
        const bRank = bm25RankMap.get(idx) || chunks.length;

        const rrf = (1 / (RRF_K + vRank)) + (1 / (RRF_K + bRank));
        const combinedScore = Math.min(1, Math.max(0, rrf / maxTheoreticalRRF));

        return {
            chunk,
            vectorScore: vectorScores[idx],
            bm25Score: bm25Scores[idx],
            combinedScore
        };
    });

    // Sort by combined score descending
    scoredChunks.sort((a, b) => b.combinedScore - a.combinedScore);

    return {
        chunks: scoredChunks.slice(0, topK),
        isOutOfScope: false
    };
}
