import * as assert from 'assert';
import { embedText, embedChunks, EMBEDDING_DIMENSIONS } from '../../src/rag/embedder';
import { Chunk } from '../../src/rag/types';

describe('Local ONNX Embedder (src/rag/embedder.ts)', function () {
    // Model download/initial inference can take up to 20 seconds
    this.timeout(30000);

    it('returns a 384-dimensional zero vector for empty input', async () => {
        const vec = await embedText('');
        assert.strictEqual(vec.length, EMBEDDING_DIMENSIONS);
        assert.ok(vec.every(v => v === 0));
    });

    it('generates a 384-dimensional normalized dense vector for text', async () => {
        const text = 'Scoped RAG test for agent response embedding.';
        const vec = await embedText(text);

        assert.strictEqual(vec.length, EMBEDDING_DIMENSIONS);
        assert.ok(vec.some(v => v !== 0), 'Vector should contain non-zero values');

        // Check L2 normalization (sum of squares should be ~ 1.0)
        const norm = Math.sqrt(vec.reduce((sum, v) => sum + v * v, 0));
        assert.ok(Math.abs(norm - 1.0) < 1e-2, `Expected L2 norm ~ 1.0, got ${norm}`);
    });

    it('batch embeds multiple chunks preserving array order', async () => {
        const mockChunks: Chunk[] = [
            {
                id: 'chunk-0',
                text: 'First chunk of text.',
                type: 'prose',
                tokenCount: 4,
                charRange: [0, 20]
            },
            {
                id: 'chunk-1',
                text: 'Second chunk of text.',
                type: 'prose',
                tokenCount: 4,
                charRange: [21, 42]
            }
        ];

        const vectors = await embedChunks(mockChunks);
        assert.strictEqual(vectors.length, 2);
        assert.strictEqual(vectors[0].length, EMBEDDING_DIMENSIONS);
        assert.strictEqual(vectors[1].length, EMBEDDING_DIMENSIONS);
    });

    it('returns empty array when embedding empty chunk list', async () => {
        const vectors = await embedChunks([]);
        assert.deepStrictEqual(vectors, []);
    });
});
