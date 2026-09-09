/**
 * src/llm/prompt.ts
 * ----------------------------------------------------------------
 * The 3 tier instruction Assembly For Agentic Chat Q&A Bot
 * ----------------------------------------------------------------
 */

import { ScoredChunk } from '../rag/types';

export interface ChatMessage {
    role: 'system' | 'user' | 'assistant';
    content: string;
}

/**
 * ================================================================
 * 1. System Instruction
 * ================================================================
 */
export const SYSTEM_INSTRUCTION = `
    You are Agentic Chat Q&A bot, a precision assistant analyzing a captured AI response.
    Your job is to help the user understand, interrogate, and explore the captured context.
    
    Core Rules:
    1. OUT-OF-SCOPE REJECTION:
        - If the user asks a question completely unrelated to the topic of the captured context (eg. cooking recpies, sports, unrelated trivia):
        - Politely refuse: "This question is out of scope for the captured response. I am scoped to help you analyze this specific context."
        
    2. EXPLANATION AND PEDAGOGY (ALLOWED AND ENCOURAGED):
        -If the user asks to explain, simply, translate, or provide an anology for concepts THAT EXIST in the context:
        -You ARE ALLOWED to use clear analogies, simpler language, and step-by-step breakdowns.
        -You must remain faithful to the core ideas and facts in the text.
        
    3. CONTEXT-GROUNDED EXPANSION(TRANSPARENT SOURCE BADGING):
        -If the user asks for deeper implementation details, code examples, or practical tutorials on a subtopic introduced in the context that lacks full code:
        -Structure your response into two explicitly labeled sections:
         ### 📌 From Captured Response:
            (Summarize what the captured text actually states about this topic, citing [Chunk X])
     
        ### 🌐 Deep-Dive & Implementation (Expanded Knowledge):
            (Provide the complete code implementation, best practices, and deep-dive)
    
    4. DIRECT FACT CITATIONS:
        -When answering factual questions directly from the context, cite the relevant chunck ID  (e.g [Chunk 0], [Chunk 2]).
`.trim();

/**
 * =======================================================================================
 * 2. AGENT INSTRUCTION (Dynamic Context & Knowledge Injection)
 * ========================================================================================
 */

export function buildAgentContext(chunks: ScoredChunk[]): string {
    if (chunks.length === 0) {
        return `---- NO RELEVANT CONTEXT CHUNKS RETRIEVED ----`;
    }

    const formattedChunks = chunks
        .map((sc, idx) => {
            const typeTag = sc.chunk.type.toUpperCase();
            const langTag = sc.chunk.language ? `(${sc.chunk.language})` : '';
            return `[Chunk ${idx}] [${typeTag}${langTag}] (Relevance Score:
        ${sc.combinedScore.toFixed(3)}):\n${sc.chunk.text}`;
        }).join('\n\n---\n\n');

    return `
    --- BEGIN RETRIEVED CONTEXT ---
    The following ${chunks.length} chunks were retrieved as most relevant to the user's questions:
    
    ${formattedChunks}
    ---- END RETRIEVED CONTEXT ---
    
    AGENT DIRECTIVE: Answer the user's prompt based on the context above according to the System Rules.
    `.trim();
}

/**
 * =================================================================================
 * 3. USER INSTRUCTION (The User's Immediate Intent)
 * ==================================================================================
 */
export function formatUserInstruction(query: string): string {
    return query.trim();
}

/**
 * =================================================================================
 * ASSEMBLY FUNCTION (Builds the Full OpenAI-Compatible Messages Array)
 * =================================================================================
 */
export function assembleChatMessage(
    userQuery: string,
    retrieveChunks: ScoredChunk[],
    conversationHistory: { role: 'user' | 'assistant'; text: string }[] = [],
    maxHistoryTurns: number = 3
): ChatMessage[] {
    const messages: ChatMessage[] = [];
    // System Instruction
    messages.push({
        role: 'system',
        content: SYSTEM_INSTRUCTION
    });
    // Agent Instruction
    messages.push({
        role: 'system',
        content: buildAgentContext(retrieveChunks)
    });
    // Multi-turn sliding memory (last N turns for follow-up resolution)
    const recentHistory = conversationHistory.slice(-maxHistoryTurns * 2);
    for (const turn of recentHistory) {
        messages.push({
            role: turn.role,
            content: turn.text
        });
    }

    // USER QUERY
    messages.push({
        role: 'user',
        content: formatUserInstruction(userQuery)
    });
    return messages;
}





