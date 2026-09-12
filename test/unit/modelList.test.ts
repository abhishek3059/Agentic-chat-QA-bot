import * as assert from 'assert';
import { fetchModels, parseModelsResponse } from '../../src/llm/modelList';

describe('Model list parsing (src/llm/modelList.ts)', () => {
    it('parses an OpenAI-format response (id + owned_by)', () => {
        const models = parseModelsResponse({
            object: 'list',
            data: [
                { id: 'gpt-4o', object: 'model', owned_by: 'openai' },
                { id: 'gpt-4o-mini', object: 'model', owned_by: 'openai' }
            ]
        });
        assert.ok(models);
        assert.strictEqual(models.length, 2);
        assert.strictEqual(models[0].id, 'gpt-4o');
        assert.strictEqual(models[0].ownedBy, 'openai');
        assert.strictEqual(models[0].name, undefined);
    });

    it('parses an OpenRouter-format response (id + display name)', () => {
        const models = parseModelsResponse({
            data: [
                { id: 'openai/gpt-4o', name: 'GPT-4o' },
                { id: 'anthropic/claude-3.5-sonnet', name: 'Claude 3.5 Sonnet' }
            ]
        });
        assert.ok(models);
        assert.strictEqual(models.length, 2);
        // Sorted by id: anthropic/... comes before openai/...
        assert.strictEqual(models[0].id, 'anthropic/claude-3.5-sonnet');
        assert.strictEqual(models[0].name, 'Claude 3.5 Sonnet');
    });

    it('sorts by id and drops entries without an id', () => {
        const models = parseModelsResponse({
            data: [
                { id: 'zebra' },
                { name: 'Nameless' },
                { id: 'apple' },
                { id: '' }
            ]
        });
        assert.ok(models);
        assert.deepStrictEqual(models.map(m => m.id), ['apple', 'zebra']);
    });

    it('returns null for a malformed body', () => {
        assert.strictEqual(parseModelsResponse(null), null);
        assert.strictEqual(parseModelsResponse({}), null);
        assert.strictEqual(parseModelsResponse({ data: 'nope' }), null);
    });
});

describe('Model list fetching (fetchModels)', () => {
    const realFetch = global.fetch;

    afterEach(() => {
        global.fetch = realFetch;
    });

    function stubFetch(response: unknown): string[] {
        const seenHeaders: string[] = [];
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (global as any).fetch = async (_url: string, init?: any) => {
            if (init?.headers?.['Authorization']) {
                seenHeaders.push(init.headers['Authorization']);
            }
            return response;
        };
        return seenHeaders;
    }

    it('returns parsed models on success', async () => {
        stubFetch({
            ok: true,
            json: async () => ({ data: [{ id: 'deepseek-chat' }, { id: 'deepseek-reasoner' }] })
        });
        const models = await fetchModels('deepseek', undefined, 'sk-test');
        assert.ok(models);
        assert.deepStrictEqual(models.map(m => m.id), ['deepseek-chat', 'deepseek-reasoner']);
    });

    it('returns null on non-ok status', async () => {
        stubFetch({ ok: false, status: 401 });
        assert.strictEqual(await fetchModels('openai', undefined, 'bad-key'), null);
    });

    it('returns null on network failure', async () => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (global as any).fetch = async () => { throw new Error('socket hang up'); };
        assert.strictEqual(await fetchModels('openai', undefined, 'sk-test'), null);
    });

    it('returns null when no models URL applies (custom without URL)', async () => {
        let called = false;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (global as any).fetch = async () => { called = true; throw new Error('must not fetch'); };
        assert.strictEqual(await fetchModels('custom', '', 'sk-test'), null);
        assert.strictEqual(called, false);
    });

    it('omits the auth header when no key is given (Ollama)', async () => {
        const seen = stubFetch({
            ok: true,
            json: async () => ({ data: [{ id: 'llama3.2' }] })
        });
        const models = await fetchModels('ollama', undefined, '');
        assert.ok(models);
        assert.deepStrictEqual(seen, []);
    });
});
