/**
 * src/llm/providers.ts
 * ----------------------------------------------------------------
 * Provider presets and URL resolution for OpenAI-compatible endpoints.
 * ----------------------------------------------------------------
 * Pure functions with no VS Code dependency so they stay cheap to unit test.
 * The generation client (generator.ts) only ever sees a resolved base URL,
 * so switching providers is config-only — no client code changes.
 */

export type ProviderId = 'openai' | 'openrouter' | 'deepseek' | 'ollama' | 'custom';

export interface ProviderPreset {
    id: ProviderId;
    label: string;
    baseUrl: string;
    needsKey: boolean;
    modelsUrl: string;
}

const PRESETS: Record<Exclude<ProviderId, 'custom'>, ProviderPreset> = {
    openai: {
        id: 'openai',
        label: 'OpenAI',
        baseUrl: 'https://api.openai.com/v1',
        needsKey: true,
        modelsUrl: 'https://api.openai.com/v1/models'
    },
    openrouter: {
        id: 'openrouter',
        label: 'OpenRouter',
        baseUrl: 'https://openrouter.ai/api/v1',
        needsKey: true,
        modelsUrl: 'https://openrouter.ai/api/v1/models'
    },
    deepseek: {
        id: 'deepseek',
        label: 'DeepSeek',
        baseUrl: 'https://api.deepseek.com/v1',
        needsKey: true,
        modelsUrl: 'https://api.deepseek.com/v1/models'
    },
    ollama: {
        id: 'ollama',
        label: 'Ollama',
        baseUrl: 'http://localhost:11434/v1',
        needsKey: false,
        modelsUrl: 'http://localhost:11434/v1/models'
    }
};

/** Fallback when a stored setting holds an unrecognized provider id. */
const DEFAULT_PRESET: ProviderPreset = PRESETS.openrouter;

/**
 * All built-in presets plus the custom slot, for pickers and settings UI.
 * Keeps the provider table in exactly one place.
 */
export function listProviderOptions(): Array<{ id: ProviderId; label: string; description: string }> {
    return [
        { id: 'openai', label: 'OpenAI', description: 'GPT-4o, GPT-4, etc. — api.openai.com' },
        { id: 'openrouter', label: 'OpenRouter', description: 'Multi-provider gateway with free models' },
        { id: 'deepseek', label: 'DeepSeek', description: 'deepseek-chat, deepseek-reasoner' },
        { id: 'ollama', label: 'Ollama (local)', description: 'Local models via localhost:11434' },
        { id: 'custom', label: 'Custom', description: 'Any OpenAI-compatible endpoint' }
    ];
}

export function getProviderPreset(provider: ProviderId): ProviderPreset | undefined {
    return (PRESETS as Partial<Record<ProviderId, ProviderPreset>>)[provider];
}

function stripTrailingSlashes(url: string): string {
    return url.trim().replace(/\/+$/, '');
}

/**
 * Resolves the chat-completions base URL for a provider.
 * Presets ignore the custom URL; 'custom' uses it verbatim.
 * Unrecognized provider ids fall back to the OpenRouter preset.
 */
export function resolveBaseUrl(provider: ProviderId, customUrl?: string): string {
    if (provider === 'custom') {
        return customUrl ? stripTrailingSlashes(customUrl) : '';
    }
    return getProviderPreset(provider)?.baseUrl ?? DEFAULT_PRESET.baseUrl;
}

/**
 * Resolves the GET /models URL for a provider, or null when none applies
 * (custom provider with no URL configured).
 */
export function resolveModelsUrl(provider: ProviderId, customUrl?: string): string | null {
    if (provider === 'custom') {
        const base = customUrl ? stripTrailingSlashes(customUrl) : '';
        return base ? `${base}/models` : null;
    }
    return getProviderPreset(provider)?.modelsUrl ?? DEFAULT_PRESET.modelsUrl;
}

/** Whether this provider needs an API key (custom assumes yes). */
export function providerNeedsKey(provider: ProviderId): boolean {
    if (provider === 'custom') {
        return true;
    }
    return getProviderPreset(provider)?.needsKey ?? true;
}

/**
 * Provider-specific request headers beyond Authorization/Content-Type.
 * OpenRouter honors optional referral headers; other providers must not
 * receive unknown vendor headers.
 */
export function resolveExtraHeaders(apiBaseUrl: string): Record<string, string> {
    if (apiBaseUrl.includes('openrouter.ai')) {
        return {
            'HTTP-Referer': 'https://github.com/abhishek3059/Agentic-chat-QA-bot',
            'X-Title': 'QA Assistant'
        };
    }
    return {};
}
