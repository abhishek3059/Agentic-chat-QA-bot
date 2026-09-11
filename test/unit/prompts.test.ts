import * as assert from 'assert';
import {
    SYSTEM_INSTRUCTION,
    buildAgentContext,
    formatUserInstruction,
    assembleChatMessage,
    classifyQueryIntent,
    buildIntentDirective,
    TEMPERATURE_PROFILES
} from '../../src/llm/prompt';
import { isApiKeyConfigured, GeneratorError, DEFAULT_TOP_P } from '../../src/llm/generator';
import { ScoredChunk } from '../../src/rag/types';

describe('Prompt Engine & Generator Client (src/llm/)', () => {
    describe('SYSTEM_INSTRUCTION Constitution', () => {
        it('enforces natural delivery, scope guardrails, and no robotic citations/cards', () => {
            assert.ok(SYSTEM_INSTRUCTION.includes('OUT-OF-SCOPE REJECTION'));
            assert.ok(SYSTEM_INSTRUCTION.includes('EXPLANATION AND PEDAGOGY'));
            assert.ok(SYSTEM_INSTRUCTION.includes('NO CITATION MARKERS'));
            assert.ok(SYSTEM_INSTRUCTION.includes('NO ARTIFICIAL ZONE CARDS'));
            assert.ok(SYSTEM_INSTRUCTION.includes('RESPONSE STYLE EXAMPLES'));
        });
    });

    describe('buildAgentContext (Clean XML Injection)', () => {
        it('handles empty chunks safely with clean semantic XML', () => {
            const context = buildAgentContext([]);
            assert.ok(context.includes('<context>'));
            assert.ok(context.includes('No relevant context found.'));
            assert.ok(context.includes('</context>'));
        });

        it('formats retrieved chunks as clean XML without leaking relevance scores or type tags', () => {
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
            assert.ok(context.includes('<context>'));
            assert.ok(context.includes('<source id="0" lang="typescript">const port = 8080;</source>'));
            assert.ok(context.includes('</context>'));

            // Must NOT leak relevance scores or bracketed type tags to avoid corrupting tone
            assert.ok(!context.includes('0.920'));
            assert.ok(!context.includes('[CODE'));
            assert.ok(!context.includes('[Chunk 0]'));
        });
    });

    describe('Intent Classification & Directives', () => {
        it('classifies query intents accurately', () => {
            assert.strictEqual(classifyQueryIntent('Show me the code for redis connection'), 'code');
            assert.strictEqual(classifyQueryIntent('Implement connection pooling in TypeScript'), 'code');
            assert.strictEqual(classifyQueryIntent('Explain how the sliding window TTL works'), 'explain');
            assert.strictEqual(classifyQueryIntent('What is the difference between redis and memcached?'), 'explain');
            assert.strictEqual(classifyQueryIntent('Summarize the key takeaways'), 'meta');
            assert.strictEqual(classifyQueryIntent('List all parameters in the config'), 'meta');
            assert.strictEqual(classifyQueryIntent('What port is Redis running on?'), 'factual');
        });

        it('provides calibrated temperature profiles', () => {
            assert.strictEqual(TEMPERATURE_PROFILES.code, 0.20);
            assert.strictEqual(TEMPERATURE_PROFILES.factual, 0.35);
            assert.strictEqual(TEMPERATURE_PROFILES.explain, 0.55);
            assert.strictEqual(TEMPERATURE_PROFILES.meta, 0.50);
        });

        it('generates dynamic directives for each intent', () => {
            const codeDirective = buildIntentDirective('code');
            assert.ok(codeDirective.includes('production-grade code block'));
            assert.ok(codeDirective.includes('edge-case'));

            const factualDirective = buildIntentDirective('factual');
            assert.ok(factualDirective.includes('1–2 conversational'));

            const explainDirective = buildIntentDirective('explain');
            assert.ok(explainDirective.includes('intuitive'));
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

        it('assembles a full instruction hierarchy with intent directive', () => {
            const messages = assembleChatMessage(
                'Where is database configured?',
                mockChunks,
                [],
                3,
                'factual'
            );

            // Structure: 1. System Constitution, 2. Agent Context + Directive, 3. User Query
            assert.strictEqual(messages.length, 3);
            assert.strictEqual(messages[0].role, 'system');
            assert.ok(messages[0].content.includes('Agentic Chat Q&A Bot'));

            assert.strictEqual(messages[1].role, 'system');
            assert.ok(messages[1].content.includes('Database config is in db.ts'));
            assert.ok(messages[1].content.includes('DIRECTIVE:'));

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

        it('defines DEFAULT_TOP_P as 0.92', () => {
            assert.strictEqual(DEFAULT_TOP_P, 0.92);
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
