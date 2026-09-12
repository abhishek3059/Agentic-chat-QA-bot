import * as assert from 'assert';
import {
    getProviderPreset,
    providerNeedsKey,
    resolveBaseUrl,
    resolveExtraHeaders,
    resolveModelsUrl
} from '../../src/llm/providers';

describe('Provider presets and URL resolution (src/llm/providers.ts)', () => {
    it('resolves preset base URLs, ignoring any custom URL', () => {
        assert.strictEqual(resolveBaseUrl('openai'), 'https://api.openai.com/v1');
        assert.strictEqual(resolveBaseUrl('openrouter'), 'https://openrouter.ai/api/v1');
        assert.strictEqual(resolveBaseUrl('deepseek'), 'https://api.deepseek.com/v1');
        assert.strictEqual(resolveBaseUrl('ollama'), 'http://localhost:11434/v1');
        assert.strictEqual(
            resolveBaseUrl('openai', 'http://localhost:8080/v1'),
            'https://api.openai.com/v1'
        );
    });

    it('uses the custom URL verbatim for the custom provider', () => {
        assert.strictEqual(
            resolveBaseUrl('custom', 'http://localhost:8080/v1/'),
            'http://localhost:8080/v1'
        );
        assert.strictEqual(resolveBaseUrl('custom', ''), '');
        assert.strictEqual(resolveBaseUrl('custom'), '');
    });

    it('falls back to the OpenRouter preset for unrecognized provider ids', () => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        assert.strictEqual(resolveBaseUrl('unknown' as any), 'https://openrouter.ai/api/v1');
    });

    it('resolves model-list URLs for presets and custom providers', () => {
        assert.strictEqual(resolveModelsUrl('openrouter'), 'https://openrouter.ai/api/v1/models');
        assert.strictEqual(resolveModelsUrl('ollama'), 'http://localhost:11434/v1/models');
        assert.strictEqual(
            resolveModelsUrl('custom', 'http://localhost:8080/v1'),
            'http://localhost:8080/v1/models'
        );
        assert.strictEqual(resolveModelsUrl('custom', ''), null);
        assert.strictEqual(resolveModelsUrl('custom'), null);
    });

    it('reports which providers need an API key', () => {
        assert.strictEqual(providerNeedsKey('openai'), true);
        assert.strictEqual(providerNeedsKey('deepseek'), true);
        assert.strictEqual(providerNeedsKey('ollama'), false);
        assert.strictEqual(providerNeedsKey('custom'), true);
    });

    it('returns presets by id and undefined for custom/unknown', () => {
        assert.strictEqual(getProviderPreset('deepseek')?.label, 'DeepSeek');
        assert.strictEqual(getProviderPreset('custom'), undefined);
    });

    it('sends OpenRouter referral headers only to OpenRouter', () => {
        const openRouterHeaders = resolveExtraHeaders('https://openrouter.ai/api/v1');
        assert.strictEqual(openRouterHeaders['X-Title'], 'QA Assistant');
        assert.ok(openRouterHeaders['HTTP-Referer']);

        assert.deepStrictEqual(resolveExtraHeaders('https://api.openai.com/v1'), {});
        assert.deepStrictEqual(resolveExtraHeaders('http://localhost:11434/v1'), {});
    });
});
