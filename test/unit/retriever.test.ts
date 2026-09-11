import * as assert from 'assert';
import {
    cosineSimilarity,
    tokenizeCodeAndProse,
    isMetaQuery,
    computeBM25Scores,
    hybridRetrieve
} from '../../src/rag/retriever';
import { Chunk } from '../../src/rag/types';

describe('Hybrid Retriever (src/rag/retriever.ts)', () => {
    describe('cosineSimilarity', () => {
        it('returns 1.0 for identical non-zero vectors', () => {
            const vec = [0.5, 0.5, 0.5, 0.5];
            const sim = cosineSimilarity(vec, vec);
            assert.ok(Math.abs(sim - 1.0) < 1e-5);
        });

        it('returns 0.0 for orthogonal vectors', () => {
            const vecA = [1, 0, 0];
            const vecB = [0, 1, 0];
            const sim = cosineSimilarity(vecA, vecB);
            assert.ok(Math.abs(sim - 0.0) < 1e-5);
        });

        it('returns -1.0 for diametrically opposed vectors', () => {
            const vecA = [1, 2, 3];
            const vecB = [-1, -2, -3];
            const sim = cosineSimilarity(vecA, vecB);
            assert.ok(Math.abs(sim - (-1.0)) < 1e-5);
        });

        it('handles zero or mismatched vectors safely', () => {
            assert.strictEqual(cosineSimilarity([], []), 0);
            assert.strictEqual(cosineSimilarity([1, 2], [1]), 0);
            assert.strictEqual(cosineSimilarity([0, 0], [0, 0]), 0);
        });
    });

    describe('tokenizeCodeAndProse', () => {
        it('sub-tokenizes camelCase code identifiers', () => {
            const tokens = tokenizeCodeAndProse('const getUserById = async (userId: string) => {}');
            assert.ok(tokens.includes('get'));
            assert.ok(tokens.includes('user'));
            assert.ok(tokens.includes('id'));
            assert.ok(tokens.includes('getuserbyid'));
            assert.ok(!tokens.includes('by'), 'Stop word "by" should be filtered out');
        });

        it('sub-tokenizes snake_case identifiers', () => {
            const tokens = tokenizeCodeAndProse('def process_captured_payload(payload_id):');
            assert.ok(tokens.includes('process'));
            assert.ok(tokens.includes('captured'));
            assert.ok(tokens.includes('payload'));
        });

        it('handles empty input gracefully', () => {
            assert.deepStrictEqual(tokenizeCodeAndProse(''), []);
            assert.deepStrictEqual(tokenizeCodeAndProse('   '), []);
        });
    });

    describe('isMetaQuery', () => {
        it('identifies broad meta-transformation questions', () => {
            assert.strictEqual(isMetaQuery('Can you explain this to me?'), true);
            assert.strictEqual(isMetaQuery('Summarize this architectural plan'), true);
            assert.strictEqual(isMetaQuery('What does this code do?'), true);
            assert.strictEqual(isMetaQuery('Break this down step by step'), true);
            assert.strictEqual(isMetaQuery('Give me an overview'), true);
        });

        it('rejects specific domain questions from being classified as meta-queries', () => {
            assert.strictEqual(isMetaQuery('What port is the postgres database running on?'), false);
            assert.strictEqual(isMetaQuery('How is the JWT secret validated in auth.ts?'), false);
            assert.strictEqual(isMetaQuery('What is the weather in Tokyo?'), false);
        });
    });

    describe('computeBM25Scores', () => {
        const mockChunks: Chunk[] = [
            {
                id: 'chunk-0',
                text: 'The authentication middleware verifies JSON Web Tokens (JWT) using RS256.',
                type: 'prose',
                tokenCount: 15,
                charRange: [0, 80]
            },
            {
                id: 'chunk-1',
                text: 'Database migration scripts create the users and orders PostgreSQL tables.',
                type: 'prose',
                tokenCount: 14,
                charRange: [81, 160]
            }
        ];

        it('assigns higher score to chunks containing query keywords', () => {
            const queryTokens = ['authentication', 'jwt'];
            const scores = computeBM25Scores(queryTokens, mockChunks);

            assert.strictEqual(scores.length, 2);
            assert.ok(scores[0] > scores[1], 'Chunk 0 should score higher for auth terms');
            assert.strictEqual(scores[1], 0, 'Chunk 1 has no auth terms and should score 0');
        });
    });

    describe('hybridRetrieve & Scope Guardrail', () => {
        const mockChunks: Chunk[] = [
            {
                id: 'chunk-0',
                text: 'export function getUserProfile(userId: string) { return db.users.find(userId); }',
                type: 'code',
                language: 'typescript',
                tokenCount: 20,
                charRange: [0, 90]
            },
            {
                id: 'chunk-1',
                text: 'The rate limiter allows up to 100 requests per minute per IP address.',
                type: 'prose',
                tokenCount: 18,
                charRange: [91, 170]
            }
        ];

        // 384d dummy vectors
        const vector0 = new Array(384).fill(0);
        vector0[0] = 1.0;

        const vector1 = new Array(384).fill(0);
        vector1[1] = 1.0;

        it('fuses dense and keyword rankings into normalized combined scores in [0, 1]', async () => {
            const result = await hybridRetrieve(
                'getUserProfile',
                mockChunks,
                [vector0, vector1],
                { topK: 2 }
            );

            assert.strictEqual(result.isOutOfScope, false);
            assert.ok(result.chunks.length > 0);
            assert.strictEqual(result.chunks[0].chunk.id, 'chunk-0');
            assert.ok(result.chunks[0].combinedScore >= 0 && result.chunks[0].combinedScore <= 1.0);
        });

        it('short-circuits out-of-scope queries when both cosine and BM25 match fail', async () => {
            // Unrelated query vector having orthogonal similarity (cosine = 0) and zero keyword match
            const unrelatedQuery = 'Who won the 1998 soccer world cup in France?';
            const zeroVectors = [new Array(384).fill(0), new Array(384).fill(0)];

            const result = await hybridRetrieve(
                unrelatedQuery,
                mockChunks,
                zeroVectors,
                { scopeThreshold: 0.20 }
            );

            assert.strictEqual(result.isOutOfScope, true);
            assert.strictEqual(result.chunks.length, 0);
            assert.ok(result.reason?.includes('out of scope') || result.reason?.includes('BM25=0'));
        });

        it('bypasses out-of-scope refusal for meta-transformation queries', async () => {
            const metaQuery = 'Can you explain this code simply?';
            const zeroVectors = [new Array(384).fill(0), new Array(384).fill(0)];

            const result = await hybridRetrieve(
                metaQuery,
                mockChunks,
                zeroVectors,
                { scopeThreshold: 0.20 }
            );

            assert.strictEqual(result.isOutOfScope, false);
            assert.ok(result.chunks.length > 0);
        });

        it('never marks follow-up suggestion chips like "What are the alternatives?" as out of scope', async () => {
            const followUps = [
                'What are the alternatives?',
                'Give me a simpler analogy',
                'What are the edge cases?',
                'Show full implementation',
                'How do I test this?',
                'What are the performance trade-offs?'
            ];
            const zeroVectors = [new Array(384).fill(0), new Array(384).fill(0)];

            for (const q of followUps) {
                const result = await hybridRetrieve(
                    q,
                    mockChunks,
                    zeroVectors,
                    { scopeThreshold: 0.20 }
                );
                assert.strictEqual(result.isOutOfScope, false, `Query "${q}" should not be rejected as out of scope`);
                assert.ok(result.chunks.length > 0);
            }
        });
    });
});
