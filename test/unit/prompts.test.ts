import * as assert from 'assert';
import {
    SYSTEM_INSTRUCTION,
    buildAgentContext,
    formatUserInstruction,
    assembleChatMessage
} from '../../src/llm/prompt';
import { isApiKeyConfigured, GeneratorError } from '../../src/llm/generator';
import { ScoredChunk } from '../../src/rag/types';

describe('Prompt Engine & Generator Client (src/llm/)', () => {
    describe('SYSTEM_INSTRUCTION Constitution', () => {
        it('includes the 3-zone grounding and scope rules', () => {
            assert.ok(SYSTEM_INSTRUCTION.includes('OUT-OF-SCOPE REJECTION'));
            assert.ok(SYSTEM_INSTRUCTION.includes('EXPLANATION AND PEDAGOGY'));
            assert.ok(SYSTEM_INSTRUCTION.includes('From Captured Response'));
            assert.ok(SYSTEM_INSTRUCTION.includes('Deep-Dive & Implementation'));
            assert.ok(SYSTEM_INSTRUCTION.includes('[Chunk'));
        });
    });

    describe('buildAgentContext', () => {
        it('handles empty chunks safely', () => {
            const context = buildAgentContext([]);
            assert.ok(context.includes('NO RELEVANT CONTEXT CHUNKS RETRIEVED'));
        });

        it('formats retrieved chunks with IDs, types, languages, and scores', () => {
            const mockChunks: ScoredChunk[] = [
                {
                    chunk: {
                        id: 'chunk-0',
                        text: 'const port = 8080;',
                        type: 'code',
                        language: 'typescript',
                        tokenCount: 8,
                        charRange: [0, 20]
                    },
                    vectorScore: 0.85,
                    bm25Score: 3.2,
                    combinedScore: 0.92
                }
            ];

            const context = buildAgentContext(mockChunks);
            assert.ok(context.includes('[Chunk 0]'));
            assert.ok(context.includes('[CODE(typescript)]'));
            assert.ok(context.includes('const port = 8080;'));
            assert.ok(context.includes('0.920'));
        });
    });

    describe('formatUserInstruction', () => {
        it('trims whitespace cleanly', () => {
            assert.strictEqual(formatUserInstruction('  What is this?  \n'), 'What is this?');
        });
    });

    describe('assembleChatMessage', () => {
        const mockChunks: ScoredChunk[] = [
            {
                chunk: {
                    id: 'chunk-0',
                    text: 'Database config is in db.ts',
                    type: 'prose',
                    tokenCount: 6,
                    charRange: [0, 26]
                },
                vectorScore: 0.9,
                bm25Score: 2.1,
                combinedScore: 0.88
            }
        ];

        it('assembles a full 3-tier instruction hierarchy', () => {
            const messages = assembleChatMessage(
                'Where is database configured?',
                mockChunks,
                []
            );

            // Structure: 1. System Constitution, 2. Agent Context, 3. User Query
            assert.strictEqual(messages.length, 3);
            assert.strictEqual(messages[0].role, 'system');
            assert.ok(messages[0].content.includes('Agentic Chat Q&A bot'));

            assert.strictEqual(messages[1].role, 'system');
            assert.ok(messages[1].content.includes('Database config is in db.ts'));

            assert.strictEqual(messages[2].role, 'user');
            assert.strictEqual(messages[2].content, 'Where is database configured?');
        });

        it('enforces multi-turn sliding window memory', () => {
            // 4 full turns = 8 messages
            const history: { role: 'user' | 'assistant'; text: string }[] = [
                { role: 'user', text: 'Turn 1 User' },
                { role: 'assistant', text: 'Turn 1 Assistant' },
                { role: 'user', text: 'Turn 2 User' },
                { role: 'assistant', text: 'Turn 2 Assistant' },
                { role: 'user', text: 'Turn 3 User' },
                { role: 'assistant', text: 'Turn 3 Assistant' },
                { role: 'user', text: 'Turn 4 User' },
                { role: 'assistant', text: 'Turn 4 Assistant' }
            ];

            // Request maxHistoryTurns = 2 (should only retain the last 4 messages: Turn 3 and Turn 4)
            const messages = assembleChatMessage(
                'Turn 5 User Query',
                mockChunks,
                history,
                2
            );

            // Expected: System (1) + Context (1) + History (4) + User Query (1) = 7
            assert.strictEqual(messages.length, 7);

            // Should not contain Turn 1 or Turn 2
            assert.ok(!messages.some(m => m.content.includes('Turn 1')));
            assert.ok(!messages.some(m => m.content.includes('Turn 2')));

            // Should contain Turn 3 and Turn 4
            assert.ok(messages.some(m => m.content === 'Turn 3 User'));
            assert.ok(messages.some(m => m.content === 'Turn 3 Assistant'));
            assert.ok(messages.some(m => m.content === 'Turn 4 User'));
            assert.ok(messages.some(m => m.content === 'Turn 4 Assistant'));

            // Immediate query is at the end
            assert.strictEqual(messages[6].role, 'user');
            assert.strictEqual(messages[6].content, 'Turn 5 User Query');
        });
    });

    describe('Generator Helpers & Error Classes', () => {
        it('validates API key configuration presence', () => {
            assert.strictEqual(isApiKeyConfigured(''), false);
            assert.strictEqual(isApiKeyConfigured('   '), false);
            assert.strictEqual(isApiKeyConfigured(undefined), false);
            assert.strictEqual(isApiKeyConfigured('sk-test-12345'), true);
        });

        it('instantiates GeneratorError with status code and body details', () => {
            const err = new GeneratorError('Unauthorized', 401, '{"error":"invalid_key"}');
            assert.strictEqual(err.message, 'Unauthorized');
            assert.strictEqual(err.statusCode, 401);
            assert.strictEqual(err.responseBody, '{"error":"invalid_key"}');
            assert.strictEqual(err.name, 'GeneratorError');
        });
    });
});
