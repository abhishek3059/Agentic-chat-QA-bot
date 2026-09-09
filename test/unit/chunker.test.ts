import * as assert from 'assert';
import { chunkText, estimateTokens, isListBlock } from '../../src/rag/chunker';

describe('Structural Chunker (src/rag/chunker.ts)', () => {
    it('estimates token counts accurately (~4 characters per token)', () => {
        assert.strictEqual(estimateTokens(''), 0);
        assert.strictEqual(estimateTokens('   '), 0);
        assert.strictEqual(estimateTokens('test'), 1);
        assert.strictEqual(estimateTokens('Hello world!'), 3); // 12 chars -> ceil(12/4) = 3
    });

    it('identifies markdown list blocks correctly', () => {
        const bulletList = '- Item 1\n- Item 2\n- Item 3';
        assert.strictEqual(isListBlock(bulletList), true);

        const numberedList = '1. First item\n2. Second item\n3. Third item';
        assert.strictEqual(isListBlock(numberedList), true);

        const regularProse = 'This is a normal paragraph with several sentences.\nIt should not be classified as a list.';
        assert.strictEqual(isListBlock(regularProse), false);
    });

    it('handles empty or blank text gracefully', () => {
        assert.deepStrictEqual(chunkText(''), []);
        assert.deepStrictEqual(chunkText('   \n\t  '), []);
    });

    it('keeps code blocks atomic when within the 200-token ceiling', () => {
        const code = '```typescript\nfunction add(a: number, b: number): number {\n    return a + b;\n}\n```';
        const chunks = chunkText(code);

        assert.strictEqual(chunks.length, 1);
        assert.strictEqual(chunks[0].id, 'chunk-0');
        assert.strictEqual(chunks[0].type, 'code');
        assert.strictEqual(chunks[0].language, 'typescript');
        assert.strictEqual(chunks[0].text, code);
        assert.ok(chunks[0].tokenCount <= 200);
        assert.deepStrictEqual(chunks[0].charRange, [0, code.length]);
    });

    it('segments mixed markdown into appropriate typed chunks (code, prose, list)', () => {
        const markdown = `
Here is an introductory explanation of our architecture.

- First item in the list
- Second item in the list
- Third item in the list

\`\`\`python
def greet(name):
    print(f"Hello, {name}")
\`\`\`

And here is a concluding paragraph.
`.trim();

        const chunks = chunkText(markdown);

        assert.ok(chunks.length >= 3);
        const types = chunks.map(c => c.type);
        assert.ok(types.includes('prose'), 'Should contain prose chunks');
        assert.ok(types.includes('list'), 'Should contain list chunks');
        assert.ok(types.includes('code'), 'Should contain code chunks');

        const codeChunk = chunks.find(c => c.type === 'code');
        assert.ok(codeChunk);
        assert.strictEqual(codeChunk?.language, 'python');
        assert.ok(codeChunk?.text.startsWith('```python'));
        assert.ok(codeChunk?.text.endsWith('```'));
    });

    it('splits oversized paragraphs to enforce the token ceiling', () => {
        // Create a paragraph of 300 words (> 300 tokens)
        const sentence = 'This is a detailed sentence describing an architectural concept in the system. ';
        const longParagraph = sentence.repeat(15); // ~1100 chars -> ~275 tokens

        const chunks = chunkText(longParagraph, { maxTokensPerChunk: 100 });

        assert.ok(chunks.length > 1, 'Long paragraph should be split into multiple chunks');
        for (const chunk of chunks) {
            assert.ok(chunk.tokenCount <= 120, `Chunk token count ${chunk.tokenCount} exceeds safe threshold`);
            assert.strictEqual(chunk.type, 'prose');
        }
    });

    it('splits oversized code blocks while preserving language fences', () => {
        const longCodeLines: string[] = [];
        for (let i = 0; i < 40; i++) {
            longCodeLines.push(`    const variable_${i} = doSomethingImportantWithArgument(${i});`);
        }
        const longCode = `\`\`\`javascript\n${longCodeLines.join('\n')}\n\`\`\``;

        const chunks = chunkText(longCode, { maxTokensPerChunk: 50 });

        assert.ok(chunks.length > 1, 'Long code block should be split into multiple chunks');
        for (const chunk of chunks) {
            assert.strictEqual(chunk.type, 'code');
            assert.strictEqual(chunk.language, 'javascript');
            assert.ok(chunk.text.startsWith('```javascript'), 'Sub-chunk must retain opening fence');
            assert.ok(chunk.text.endsWith('```'), 'Sub-chunk must retain closing fence');
        }
    });

    it('assigns sequential deterministic chunk IDs', () => {
        const input = 'Paragraph 1.\n\nParagraph 2.\n\n```bash\necho "hello"\n```\n\n- item 1\n- item 2';
        const chunks = chunkText(input);

        chunks.forEach((chunk, idx) => {
            assert.strictEqual(chunk.id, `chunk-${idx}`);
        });
    });
});
