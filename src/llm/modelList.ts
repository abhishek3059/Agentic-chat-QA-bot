/**
 * src/llm/modelList.ts
 * ----------------------------------------------------------------
 * Live model-list fetcher for OpenAI-compatible providers.
 * ----------------------------------------------------------------
 * All supported providers (OpenAI, OpenRouter, DeepSeek, Ollama, and most
 * custom gateways) expose GET {baseUrl}/models returning { data: [{id}] }.
 * This module fetches and normalizes that list for the sidebar picker.
 * Any failure (network, auth, timeout, unexpected shape) resolves to null
 * so the caller can fall back to free-text model entry.
 */

import { resolveModelsUrl, ProviderId } from './providers';

export interface ModelItem {
    id: string;
    name?: string;
    ownedBy?: string;
}

export const MODELS_FETCH_TIMEOUT_MS = 8000;

/**
 * Parses a /models response body into a sorted ModelItem list.
 * Exported separately so the parsing logic is unit-testable without HTTP.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function parseModelsResponse(data: any): ModelItem[] | null {
    const rawList = data?.data;
    if (!Array.isArray(rawList)) {
        return null;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const items: ModelItem[] = rawList
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .map((m: any) => ({
            id: typeof m?.id === 'string' ? m.id : '',
            name: typeof m?.name === 'string' ? m.name : undefined,
            ownedBy: typeof m?.owned_by === 'string' ? m.owned_by : undefined
        }))
        .filter((m: ModelItem) => m.id.length > 0)
        .sort((a: ModelItem, b: ModelItem) => a.id.localeCompare(b.id));

    return items;
}

/**
 * Fetches available models from the provider's /models endpoint.
 * Resolves to null on any failure; never throws.
 */
export async function fetchModels(
    provider: ProviderId,
    customUrl: string | undefined,
    apiKey: string
): Promise<ModelItem[] | null> {
    const modelsUrl = resolveModelsUrl(provider, customUrl);
    if (!modelsUrl) {
        return null;
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), MODELS_FETCH_TIMEOUT_MS);

    try {
        const headers: Record<string, string> = {};
        if (apiKey) {
            headers['Authorization'] = `Bearer ${apiKey}`;
        }

        const response = await fetch(modelsUrl, {
            method: 'GET',
            headers,
            signal: controller.signal
        });

        clearTimeout(timeout);

        if (!response.ok) {
            return null;
        }

        return parseModelsResponse(await response.json());
    } catch {
        clearTimeout(timeout);
        return null;
    }
}
