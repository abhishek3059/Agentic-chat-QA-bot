/**
 * src/llm/generator.ts
 * ----------------------------------------------------------------
 * Grounded LLM Generation Client
 * ----------------------------------------------------------------
 * Provider-agnostic OpenAI-compatible HTTP fetch client.
 * Connects to OpenRouter, DeepSeek, Ollama, vLLM, or OpenAI endpoints.
 */

import { ChatMessage } from './prompt';
import { resolveExtraHeaders } from './providers';

export interface GeneratorOptions {
    apiBaseUrl: string;
    modelName: string;
    apiKey: string;
    temperature?: number;
    topP?: number;
    timeoutMs?: number;
}

export const DEFAULT_TEMPERATURE = 0.45;
export const DEFAULT_TOP_P = 0.92;
export const DEFAULT_TIMEOUT_MS = 60000; // 60 seconds
export const DEFAULT_MAX_RETRIES = 3; // total attempts for retryable failures (ADR-018)
const RETRY_BASE_DELAY_MS = 1000;

/**
 * Returns true for transient failures worth retrying (rate limits, server errors).
 * Authentication failures (401) and client errors are never retried.
 */
export function isRetryableStatus(status: number): boolean {
    return status === 429 || status >= 500;
}

/**
 * Sleeps with exponential backoff + jitter: 1s, 2s, 4s (+ up to 500ms jitter).
 */
function backoffDelay(attempt: number): Promise<void> {
    const delay = RETRY_BASE_DELAY_MS * Math.pow(2, attempt) + Math.random() * 500;
    return new Promise(resolve => setTimeout(resolve, delay));
}

/**
 * POSTs to the chat-completions endpoint, retrying transient 429/5xx responses
 * and network errors. AbortError (timeout/cancel) is never retried.
 */
async function fetchWithRetry(
    endpoint: string,
    init: RequestInit,
    maxRetries: number = DEFAULT_MAX_RETRIES
): Promise<Response> {
    let lastError: unknown = null;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
        try {
            const response = await fetch(endpoint, init);
            if (!isRetryableStatus(response.status) || attempt === maxRetries - 1) {
                return response;
            }
            // Drain the retryable response body before the next attempt.
            try { await response.text(); } catch { /* ignore drain errors */ }
            lastError = new GeneratorError(
                `LLM provider transient error (${response.status}).`,
                response.status
            );
        } catch (err: unknown) {
            if (err instanceof Error && err.name === 'AbortError') {
                throw err;
            }
            lastError = err;
        }

        if (attempt < maxRetries - 1) {
            await backoffDelay(attempt);
        }
    }

    throw lastError instanceof Error
        ? lastError
        : new GeneratorError('LLM request failed after retries.');
}

export class GeneratorError extends Error {
    constructor(
        message: string,
        public readonly statusCode?: number,
        public readonly responseBody?: string
    ) {
        super(message);
        this.name = 'GeneratorError';
    }
}

/**
 * Validates that an API key is non-empty.
 */
export function isApiKeyConfigured(apiKey?: string): boolean {
    return Boolean(apiKey && apiKey.trim().length > 0);
}

/**
 * Sends chat completion messages to an OpenAI-compatible endpoint (batch non-streaming).
 */
export async function generateAnswer(
    messages: ChatMessage[],
    options: GeneratorOptions
): Promise<string> {
    const trimmedKey = options.apiKey?.trim();
    if (!trimmedKey) {
        throw new GeneratorError(
            'API key is not configured. Please set your key using the "Context Q&A: Set LLM API Key" command.',
            401
        );
    }

    const baseUrl = options.apiBaseUrl.trim().replace(/\/+$/, '');
    const endpoint = `${baseUrl}/chat/completions`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? DEFAULT_TIMEOUT_MS);

    const payload = {
        model: options.modelName.trim(),
        messages,
        temperature: options.temperature ?? DEFAULT_TEMPERATURE,
        top_p: options.topP ?? DEFAULT_TOP_P
    };

    try {
        const response = await fetchWithRetry(endpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${trimmedKey}`,
                ...resolveExtraHeaders(baseUrl)
            },
            body: JSON.stringify(payload),
            signal: controller.signal
        });

        clearTimeout(timeout);

        if (!response.ok) {
            let errorText = '';
            try {
                errorText = await response.text();
            } catch {
                errorText = response.statusText;
            }

            if (response.status === 401) {
                throw new GeneratorError(
                    'Authentication failed (401 Unauthorized). Please verify your LLM API key.',
                    401,
                    errorText
                );
            } else if (response.status === 429) {
                throw new GeneratorError(
                    'Rate limit exceeded (429 Too Many Requests). Please wait a moment or check your API quota.',
                    429,
                    errorText
                );
            } else if (response.status >= 500) {
                throw new GeneratorError(
                    `LLM provider service error (${response.status} ${response.statusText}).`,
                    response.status,
                    errorText
                );
            } else {
                throw new GeneratorError(
                    `API request failed with status ${response.status}: ${errorText}`,
                    response.status,
                    errorText
                );
            }
        }

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const data = (await response.json()) as any;
        const answer = data?.choices?.[0]?.message?.content;

        if (typeof answer !== 'string') {
            throw new GeneratorError(
                'Invalid response structure received from LLM endpoint (missing choices[0].message.content).',
                response.status,
                JSON.stringify(data)
            );
        }

        return answer.trim();
    } catch (err: unknown) {
        clearTimeout(timeout);

        if (err instanceof GeneratorError) {
            throw err;
        }

        if (err instanceof Error && err.name === 'AbortError') {
            throw new GeneratorError(
                `Request timed out after ${(options.timeoutMs ?? DEFAULT_TIMEOUT_MS) / 1000} seconds.`,
                408
            );
        }

        const errorMessage = err instanceof Error ? err.message : String(err);
        throw new GeneratorError(`Network request to LLM endpoint failed: ${errorMessage}`);
    }
}

/**
 * Streams chat completion tokens from an OpenAI-compatible SSE endpoint.
 * Calls onChunk with each incremental string token delta as it arrives.
 * Resolves with the full aggregated answer upon stream completion.
 */
export async function generateAnswerStreaming(
    messages: ChatMessage[],
    options: GeneratorOptions,
    onChunk: (delta: string) => void
): Promise<string> {
    const trimmedKey = options.apiKey?.trim();
    if (!trimmedKey) {
        throw new GeneratorError(
            'API key is not configured. Please set your key using the "Context Q&A: Set LLM API Key" command.',
            401
        );
    }

    const baseUrl = options.apiBaseUrl.trim().replace(/\/+$/, '');
    const endpoint = `${baseUrl}/chat/completions`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? DEFAULT_TIMEOUT_MS);

    const payload = {
        model: options.modelName.trim(),
        messages,
        temperature: options.temperature ?? DEFAULT_TEMPERATURE,
        top_p: options.topP ?? DEFAULT_TOP_P,
        stream: true
    };

    try {
        const response = await fetchWithRetry(endpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${trimmedKey}`,
                ...resolveExtraHeaders(baseUrl)
            },
            body: JSON.stringify(payload),
            signal: controller.signal
        });

        clearTimeout(timeout);

        if (!response.ok) {
            let errorText = '';
            try {
                errorText = await response.text();
            } catch {
                errorText = response.statusText;
            }

            if (response.status === 401) {
                throw new GeneratorError(
                    'Authentication failed (401 Unauthorized). Please verify your LLM API key.',
                    401,
                    errorText
                );
            } else if (response.status === 429) {
                throw new GeneratorError(
                    'Rate limit exceeded (429 Too Many Requests). Please wait a moment or check your API quota.',
                    429,
                    errorText
                );
            } else if (response.status >= 500) {
                throw new GeneratorError(
                    `LLM provider service error (${response.status} ${response.statusText}).`,
                    response.status,
                    errorText
                );
            } else {
                throw new GeneratorError(
                    `API request failed with status ${response.status}: ${errorText}`,
                    response.status,
                    errorText
                );
            }
        }

        if (!response.body) {
            throw new GeneratorError('Response body is null, streaming cannot be established.');
        }

        let fullAnswer = '';
        const reader = response.body.getReader();
        const decoder = new TextDecoder('utf-8');
        let buffer = '';

        while (true) {
            const { done, value } = await reader.read();
            if (done) {
                break;
            }

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            // Keep the last partial line in the buffer
            buffer = lines.pop() ?? '';

            for (const rawLine of lines) {
                const line = rawLine.trim();
                if (!line || line.startsWith(':')) {
                    // Empty line or SSE comment/keepalive
                    continue;
                }

                if (line.startsWith('data: ')) {
                    const dataStr = line.slice(6).trim();
                    if (dataStr === '[DONE]') {
                        return fullAnswer.trim();
                    }

                    try {
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        const parsed = JSON.parse(dataStr) as any;
                        const delta = parsed?.choices?.[0]?.delta?.content;
                        if (typeof delta === 'string' && delta.length > 0) {
                            fullAnswer += delta;
                            onChunk(delta);
                        }
                    } catch {
                        // Incomplete or non-JSON chunk, ignore
                    }
                }
            }
        }

        // Process any trailing line in buffer
        if (buffer.trim().startsWith('data: ')) {
            const dataStr = buffer.trim().slice(6).trim();
            if (dataStr !== '[DONE]') {
                try {
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    const parsed = JSON.parse(dataStr) as any;
                    const delta = parsed?.choices?.[0]?.delta?.content;
                    if (typeof delta === 'string' && delta.length > 0) {
                        fullAnswer += delta;
                        onChunk(delta);
                    }
                } catch {
                    // ignore
                }
            }
        }

        return fullAnswer.trim();
    } catch (err: unknown) {
        clearTimeout(timeout);

        if (err instanceof GeneratorError) {
            throw err;
        }

        if (err instanceof Error && err.name === 'AbortError') {
            throw new GeneratorError(
                `Streaming request timed out after ${(options.timeoutMs ?? DEFAULT_TIMEOUT_MS) / 1000} seconds.`,
                408
            );
        }

        const errorMessage = err instanceof Error ? err.message : String(err);
        throw new GeneratorError(`Streaming network request to LLM endpoint failed: ${errorMessage}`);
    }
}
