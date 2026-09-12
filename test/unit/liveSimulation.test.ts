import * as assert from 'assert';
import * as http from 'http';
import { chunkText } from '../../src/rag/chunker';
import { embedChunks } from '../../src/rag/embedder';
import { hybridRetrieve } from '../../src/rag/retriever';
import {
    classifyQueryIntent,
    assembleChatMessage,
    TEMPERATURE_PROFILES
} from '../../src/llm/prompt';
import { generateAnswerStreaming } from '../../src/llm/generator';

describe('Real-Time Live Q&A Simulation Pipeline', function () {
    // Local ONNX model embedding might take 1-3 seconds on first load
    this.timeout(15000);

    const sampleAiResponse = `
Here is how you can implement a distributed rate limiter in Redis with TypeScript:

## Core Architecture
The system uses Redis sorted sets (ZSET) to implement a sliding-window log algorithm.
The server connects to Redis on port 6379 with a 60-second window TTL.

\`\`\`typescript
import { createClient } from 'redis';

export class SlidingWindowRateLimiter {
  private client: ReturnType<typeof createClient>;

  constructor(redisUrl: string = 'redis://localhost:6379') {
    this.client = createClient({ url: redisUrl });
    this.client.on('error', (err) => console.error('Redis error:', err));
  }

  async connect(): Promise<void> {
    await this.client.connect();
  }

  async isAllowed(key: string, limit: number, windowSec: number): Promise<boolean> {
    const now = Date.now();
    const clearBefore = now - (windowSec * 1000);
    const tx = this.client.multi();
    tx.zRemRangeByScore(key, 0, clearBefore);
    tx.zAdd(key, { score: now, value: now.toString() });
    tx.zCard(key);
    tx.expire(key, windowSec);
    const results = await tx.exec();
    const requestCount = results[2] as number;
    return requestCount <= limit;
  }
}
\`\`\`

## Key Takeaways
- Redis operates on port 6379 by default.
- Sliding window ensures smooth traffic throttling without burst resets.
- Always attach the error listener before awaiting connect.
`.trim();

    let chunks: ReturnType<typeof chunkText>;
    let vectors: number[][];
    let mockServer: http.Server;
    let mockPort: number;

    before(async function () {
        // 1. Structural Chunking
        chunks = chunkText(sampleAiResponse, { maxTokensPerChunk: 200 });

        // 2. Real local ONNX dense vector embedding
        vectors = await embedChunks(chunks);

        // 3. Start a local HTTP mock SSE server to test live streaming in real-time
        mockServer = http.createServer((req, res) => {
            res.writeHead(200, {
                'Content-Type': 'text/event-stream',
                'Cache-Control': 'no-cache',
                'Connection': 'keep-alive'
            });

            const tokens = [
                'Redis', ' is', ' listening', ' on', ' default', ' port', ' `6379`',
                ' with', ' a', ' 60-second', ' sliding', ' window', ' TTL.'
            ];

            let i = 0;
            const timer = setInterval(() => {
                if (i < tokens.length) {
                    const chunk = {
                        choices: [{ delta: { content: tokens[i] } }]
                    };
                    res.write(`data: ${JSON.stringify(chunk)}\n\n`);
                    i++;
                } else {
                    res.write(`data: [DONE]\n\n`);
                    clearInterval(timer);
                    res.end();
                }
            }, 10);
        });

        await new Promise<void>((resolve) => {
            mockServer.listen(0, '127.0.0.1', () => {
                const addr = mockServer.address() as { port: number };
                mockPort = addr.port;
                resolve();
            });
        });
    });

    after(function (done) {
        if (mockServer) {
            mockServer.close(() => done());
        } else {
            done();
        }
    });

    it('Step 1: Successfully chunks and embeds real AI response', function () {
        assert.ok(chunks.length >= 3, `Expected at least 3 chunks, got ${chunks.length}`);
        assert.strictEqual(vectors.length, chunks.length);
        assert.strictEqual(vectors[0].length, 384, 'Expected 384-dimensional MiniLM embeddings');

        // Check chunk types
        const types = chunks.map(c => c.type);
        assert.ok(types.includes('code'), 'Expected code chunk to be extracted atomically');
        assert.ok(types.includes('prose'), 'Expected prose chunk to be extracted');
    });

    it('Step 2: Real-time Factual Query Q&A Flow', async function () {
        const question = 'What port does Redis run on and what is the TTL?';

        // 1. Intent Classification
        const intent = classifyQueryIntent(question);
        assert.strictEqual(intent, 'factual');

        // 2. Adaptive Retrieval
        const adaptiveTopK = 2;
        const retrieval = await hybridRetrieve(question, chunks, vectors, { topK: adaptiveTopK });
        assert.strictEqual(retrieval.isOutOfScope, false, 'Expected query to be in scope');
        assert.ok(retrieval.chunks.length <= adaptiveTopK);

        // Check that retrieved chunks contain the relevant port info
        const combinedText = retrieval.chunks.map(c => c.chunk.text).join(' ');
        assert.ok(combinedText.includes('6379'), 'Retrieved context should contain port 6379');

        // 3. Instruction Assembly with Clean XML
        const messages = assembleChatMessage(question, retrieval.chunks, [], 3, intent);
        assert.ok(messages[1].content.includes('<context>'));
        assert.ok(!messages[1].content.includes('Relevance Score'));
        assert.ok(messages[1].content.includes('DIRECTIVE:'));

        // 4. Real-time Token Streaming
        const deltas: string[] = [];
        const fullAnswer = await generateAnswerStreaming(
            messages,
            {
                apiBaseUrl: `http://127.0.0.1:${mockPort}`,
                modelName: 'test-model',
                apiKey: 'test-key',
                temperature: TEMPERATURE_PROFILES[intent],
                topP: 0.92
            },
            (delta) => {
                deltas.push(delta);
            }
        );

        assert.ok(deltas.length > 5, 'Expected multiple streamed delta tokens');
        assert.ok(fullAnswer.includes('6379'), 'Final answer should contain 6379');
        assert.strictEqual(deltas.join(''), fullAnswer);
    });

    it('Step 3: Real-time Code Query Q&A Flow', async function () {
        const question = 'Show me the TypeScript code for isAllowed rate limiter';

        // 1. Intent Classification
        const intent = classifyQueryIntent(question);
        assert.strictEqual(intent, 'code');
        assert.strictEqual(TEMPERATURE_PROFILES[intent], 0.20, 'Code should run at T=0.20');

        // 2. Adaptive Retrieval (code uses topK = 4)
        const adaptiveTopK = 4;
        const retrieval = await hybridRetrieve(question, chunks, vectors, { topK: adaptiveTopK });
        assert.strictEqual(retrieval.isOutOfScope, false);

        // Verify code chunk was retrieved
        const codeChunk = retrieval.chunks.find(c => c.chunk.type === 'code');
        assert.ok(codeChunk, 'Code chunk should be present in top retrieved results');
        assert.ok(codeChunk.chunk.text.includes('isAllowed'));
    });

    it('Step 4: Off-Topic Questions Pass Through (ADR-017)', async function () {
        // ADR-017 removed the question-level scope gate. Even a completely
        // unrelated question reaches the LLM; the system prompt (not the
        // retriever) is the single relevance judge.
        const offTopicQuestion = 'How do I make a chocolate cheesecake at home?';

        const retrieval = await hybridRetrieve(offTopicQuestion, chunks, vectors, { topK: 3 });
        assert.strictEqual(
            retrieval.isOutOfScope,
            false,
            'No question is rejected at retrieval time anymore'
        );
        assert.ok(retrieval.chunks.length > 0, 'Top-K chunks are still returned for grounding');
    });
});
