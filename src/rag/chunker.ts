/**
 * src/rag/chunker.ts
 * ----------------------------------------------------------------
 * Structural Markdown and Code Chunker
 * ----------------------------------------------------------------
 * Preserves code fence boundaries as atomic units, identifies
 * structural types (code | prose | list), and caps chunks below
 * the 200-token threshold to respect embedding model sequence limits.
 */

import { Chunk, ChunkType, ChunkerOptions } from './types';

export const DEFAULT_MAX_TOKENS = 200;
export const DEFAULT_MIN_TOKENS = 20;

/**
 * Estimates token count using standard ~4 characters per token heuristic.
 */
export function estimateTokens(text: string): number {
    if (!text || !text.trim()) {
        return 0;
    }
    return Math.max(1, Math.ceil(text.trim().length / 4));
}

// Backward-compatibility alias
export const estimateToken = estimateTokens;

/**
 * Determines whether a text block is primarily a markdown list.
 */
export function isListBlock(text: string): boolean {
    const lines = text.trim().split('\n').filter(line => line.trim().length > 0);
    if (lines.length === 0) {
        return false;
    }
    const listLineRegex = /^\s*([-*+]|\d+\.)\s+/;
    const listMatches = lines.filter(line => listLineRegex.test(line));
    return listMatches.length >= Math.ceil(lines.length / 2);
}

/**
 * Splits raw captured AI response text into structured, typed chunks.
 */
export function chunkText(rawText: string, options?: ChunkerOptions): Chunk[] {
    const maxTokens = options?.maxTokensPerChunk ??
        (options as { maxTokenPerChunk?: number })?.maxTokenPerChunk ?? DEFAULT_MAX_TOKENS;

    const minTokens = options?.minTokensPerChunk ??
        (options as { minTokenPerChunk?: number })?.minTokenPerChunk ?? DEFAULT_MIN_TOKENS;

    if (!rawText || !rawText.trim()) {
        return [];
    }

    const chunks: Chunk[] = [];
    const normalized = rawText.replace(/\r\n/g, '\n');
    const codeBlockRegex = /```([a-zA-Z0-9_-]*)\n([\s\S]*?)```/g;

    let lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = codeBlockRegex.exec(normalized)) !== null) {
        const textBefore = normalized.slice(lastIndex, match.index);
        if (textBefore.trim()) {
            processProseBlocks(textBefore, lastIndex, chunks, maxTokens, minTokens);
        }

        const language = match[1]?.trim() || 'text';
        const codeContent = match[2];
        const fullCodeBlock = match[0];
        const codeStartIndex = match.index;

        processCodeBlock(fullCodeBlock, codeContent, language, codeStartIndex, chunks, maxTokens);
        lastIndex = codeBlockRegex.lastIndex;
    }

    if (lastIndex < normalized.length) {
        const trailingText = normalized.slice(lastIndex);
        if (trailingText.trim()) {
            processProseBlocks(trailingText, lastIndex, chunks, maxTokens, minTokens);
        }
    }

    // Merge tiny trailing chunks under minTokens into the previous chunk if compatible
    const compactedChunks = compactSmallChunks(chunks, minTokens, maxTokens);

    return compactedChunks.map((chunk, idx) => ({
        ...chunk,
        id: `chunk-${idx}`
    }));
}

/**
 * Processes non-code blocks (paragraphs, markdown lists, headers).
 */
function processProseBlocks(
    text: string,
    baseOffset: number,
    chunks: Chunk[],
    maxTokens: number,
    minTokens: number
): void {
    const paragraphs = text.split(/\n\s*\n/);
    let currentOffset = baseOffset;

    let accumulator = '';
    let accStart = currentOffset;
    let accType: ChunkType = 'prose';

    const flushAccumulator = () => {
        if (accumulator.trim()) {
            chunks.push({
                id: '',
                text: accumulator.trim(),
                type: accType,
                tokenCount: estimateTokens(accumulator.trim()),
                charRange: [accStart, accStart + accumulator.length]
            });
            accumulator = '';
        }
    };

    for (const para of paragraphs) {
        const trimmed = para.trim();
        if (!trimmed) {
            currentOffset += para.length + 2;
            continue;
        }

        const paraTokens = estimateTokens(trimmed);
        const chunkType: ChunkType = isListBlock(trimmed) ? 'list' : 'prose';

        if (paraTokens > maxTokens) {
            flushAccumulator();
            splitLargeParagraph(trimmed, currentOffset, chunks, maxTokens, chunkType);
        } else if (accumulator && estimateTokens(accumulator + '\n\n' + trimmed) <= maxTokens && accType === chunkType) {
            accumulator += '\n\n' + trimmed;
        } else {
            flushAccumulator();
            accStart = currentOffset;
            accumulator = trimmed;
            accType = chunkType;
        }

        currentOffset += para.length + 2;
    }

    flushAccumulator();
}

/**
 * Splits an oversized prose or list paragraph by sentence or line boundaries.
 */
function splitLargeParagraph(
    text: string,
    startOffset: number,
    chunks: Chunk[],
    maxTokens: number,
    chunkType: ChunkType
): void {
    if (chunkType === 'list') {
        const lines = text.split('\n');
        let currentList = '';
        let listStart = startOffset;
        let lineOffset = startOffset;

        for (const line of lines) {
            const candidate = currentList ? `${currentList}\n${line}` : line;
            if (currentList && estimateTokens(candidate) > maxTokens) {
                chunks.push({
                    id: '',
                    text: currentList,
                    type: 'list',
                    tokenCount: estimateTokens(currentList),
                    charRange: [listStart, listStart + currentList.length]
                });
                currentList = line;
                listStart = lineOffset;
            } else {
                currentList = candidate;
            }
            lineOffset += line.length + 1;
        }

        if (currentList.trim()) {
            chunks.push({
                id: '',
                text: currentList.trim(),
                type: 'list',
                tokenCount: estimateTokens(currentList.trim()),
                charRange: [listStart, listStart + currentList.length]
            });
        }
        return;
    }

    // Split prose on sentence terminators
    const sentences = text.split(/(?<=[.!?])\s+/);
    let accSentence = '';
    let sentStart = startOffset;
    let runningOffset = startOffset;

    for (const sentence of sentences) {
        const trimmed = sentence.trim();
        if (!trimmed) {
            runningOffset += sentence.length + 1;
            continue;
        }

        const candidate = accSentence ? `${accSentence} ${trimmed}` : trimmed;

        if (estimateTokens(trimmed) > maxTokens) {
            if (accSentence) {
                chunks.push({
                    id: '',
                    text: accSentence,
                    type: 'prose',
                    tokenCount: estimateTokens(accSentence),
                    charRange: [sentStart, sentStart + accSentence.length]
                });
                accSentence = '';
            }

            // Word-boundary or character fallback for enormous single sentences
            const maxChars = maxTokens * 4;
            for (let i = 0; i < trimmed.length; i += maxChars) {
                const slice = trimmed.slice(i, i + maxChars).trim();
                chunks.push({
                    id: '',
                    text: slice,
                    type: 'prose',
                    tokenCount: estimateTokens(slice),
                    charRange: [runningOffset + i, runningOffset + i + slice.length]
                });
            }
            sentStart = runningOffset + sentence.length;
        } else if (estimateTokens(candidate) > maxTokens) {
            chunks.push({
                id: '',
                text: accSentence,
                type: 'prose',
                tokenCount: estimateTokens(accSentence),
                charRange: [sentStart, sentStart + accSentence.length]
            });
            accSentence = trimmed;
            sentStart = runningOffset;
        } else {
            if (!accSentence) {
                sentStart = runningOffset;
            }
            accSentence = candidate;
        }

        runningOffset += sentence.length + 1;
    }

    if (accSentence.trim()) {
        chunks.push({
            id: '',
            text: accSentence.trim(),
            type: 'prose',
            tokenCount: estimateTokens(accSentence.trim()),
            charRange: [sentStart, sentStart + accSentence.length]
        });
    }
}

/**
 * Processes a fenced code block, keeping it atomic if <= maxTokens,
 * or splitting with statement-level overlap while preserving markdown fences.
 */
function processCodeBlock(
    fullCodeBlock: string,
    codeContent: string,
    language: string,
    codeStartIndex: number,
    chunks: Chunk[],
    maxTokens: number
): void {
    const totalTokens = estimateTokens(fullCodeBlock);

    // Keep code block atomic if within token ceiling
    if (totalTokens <= maxTokens) {
        chunks.push({
            id: '',
            text: fullCodeBlock,
            type: 'code',
            language,
            tokenCount: totalTokens,
            charRange: [codeStartIndex, codeStartIndex + fullCodeBlock.length]
        });
        return;
    }

    // Oversized code block: segment into overlapping fenced windows
    const lines = codeContent.split('\n');
    let lineIndex = 0;
    const overlapLines = 2;

    while (lineIndex < lines.length) {
        const currentSlice: string[] = [];
        let sliceTokens = estimateTokens(`\`\`\`${language}\n\`\`\``);

        while (lineIndex < lines.length) {
            const nextLine = lines[lineIndex];
            const candidateTokens = estimateTokens(`\`\`\`${language}\n${[...currentSlice, nextLine].join('\n')}\n\`\`\``);

            if (currentSlice.length > 0 && candidateTokens > maxTokens) {
                break;
            }

            currentSlice.push(nextLine);
            sliceTokens = candidateTokens;
            lineIndex++;
        }

        const fencedText = `\`\`\`${language}\n${currentSlice.join('\n')}\n\`\`\``;
        chunks.push({
            id: '',
            text: fencedText,
            type: 'code',
            language,
            tokenCount: sliceTokens,
            charRange: [codeStartIndex, codeStartIndex + fullCodeBlock.length]
        });

        // Step back by overlap lines if more lines remain to process
        if (lineIndex < lines.length && currentSlice.length > overlapLines) {
            lineIndex -= overlapLines;
        }
    }
}

/**
 * Compacts small fragments (< minTokens) into preceding chunks where possible.
 */
function compactSmallChunks(chunks: Chunk[], minTokens: number, maxTokens: number): Chunk[] {
    if (chunks.length <= 1) {
        return chunks;
    }

    const result: Chunk[] = [];

    for (let i = 0; i < chunks.length; i++) {
        const current = chunks[i];

        if (
            result.length > 0 &&
            current.tokenCount < minTokens &&
            result[result.length - 1].type === current.type &&
            result[result.length - 1].tokenCount + current.tokenCount <= maxTokens
        ) {
            const prev = result[result.length - 1];
            prev.text = `${prev.text}\n\n${current.text}`;
            prev.tokenCount = estimateTokens(prev.text);
            prev.charRange = [prev.charRange[0], current.charRange[1]];
        } else {
            result.push({ ...current });
        }
    }

    return result;
}