/**
 * src/rag/embedder.ts
 * ----------------------------------------------------------------
 * On-Device Local Embedding Generator
 * ----------------------------------------------------------------
 * Uses @xenova/transformers running Xenova/all-MiniLM-L6-v2 via
 * ONNX Runtime. Yields 384-dimensional dense vectors with mean
 * pooling and L2 normalization, completely offline and privacy-safe.
 */

import { Chunk } from './types';

export const EMBEDDING_MODEL_NAME = 'Xenova/all-MiniLM-L6-v2';
export const EMBEDDING_DIMENSIONS = 384;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let pipelinePromise: Promise<any> | null = null;

/**
 * Returns a cached singleton instance of the Xenova/all-MiniLM-L6-v2 pipeline.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function getEmbeddingPipeline(): Promise<any> {
    if (!pipelinePromise) {
        pipelinePromise = (async () => {
            const { pipeline, env } = await import('@xenova/transformers');
            env.allowLocalModels = false;
            env.useBrowserCache = false;
            return await pipeline('feature-extraction', EMBEDDING_MODEL_NAME);
        })();
    }
    return pipelinePromise;
}

/**
 * Embeds a single string into a 384-dimensional normalized dense vector.
 */
export async function embedText(text: string): Promise<number[]> {
    const trimmed = text.trim();
    if (!trimmed) {
        return new Array(EMBEDDING_DIMENSIONS).fill(0);
    }

    const extractor = await getEmbeddingPipeline();
    const output = await extractor(trimmed, {
        pooling: 'mean',
        normalize: true
    });

    return Array.from(output.data);
}

/**
 * Generates embeddings for an array of segmented chunks.
 * Processes sequentially to keep memory usage lightweight on dev machines.
 */
export async function embedChunks(chunks: Chunk[]): Promise<number[][]> {
    if (!chunks || chunks.length === 0) {
        return [];
    }

    const vectors: number[][] = [];
    for (const chunk of chunks) {
        const vector = await embedText(chunk.text);
        vectors.push(vector);
    }
    return vectors;
}

/**
 * Resets the pipeline cache (primarily used in test teardown).
 */
export function resetEmbeddingPipeline(): void {
    pipelinePromise = null;
}
