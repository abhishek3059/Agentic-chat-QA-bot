/**
 * src/llm/generator.ts
 * ----------------------------------------------------------------
 * Grounded LLM Generation Client
 * ----------------------------------------------------------------
 * Provider-agnostic OpenAI-compatible HTTP fetch client.
 * Connects to OpenRouter, DeepSeek, Ollama, vLLM, or OpenAI endpoints.
 */

import { ChatMessage } from './prompt';

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
        const response = await fetch(endpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${trimmedKey}`,
                'HTTP-Referer': 'https://github.com/abhishek3059/Agentic-chat-QA-bot',
                'X-Title': 'Agentic Chat Q&A Bot'
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
        const response = await fetch(endpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${trimmedKey}`,
                'HTTP-Referer': 'https://github.com/abhishek3059/Agentic-chat-QA-bot',
                'X-Title': 'Agentic Chat Q&A Bot'
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
