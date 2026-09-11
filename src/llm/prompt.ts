/**
 * src/llm/prompt.ts
 * ----------------------------------------------------------------
 * Frontier-Grade Instruction Assembly For Agentic Chat Q&A Bot
 * ----------------------------------------------------------------
 */

import { ScoredChunk } from '../rag/types';

export interface ChatMessage {
    role: 'system' | 'user' | 'assistant';
    content: string;
}

export type QueryIntent = 'factual' | 'explain' | 'code' | 'meta';

/**
 * ================================================================
 * 1. Intent Classification & Temperature Profiles
 * ================================================================
 */

export const TEMPERATURE_PROFILES: Record<QueryIntent, number> = {
    factual: 0.35,  // crisp, accurate, zero hallucination
    explain: 0.55,  // natural conversational cadence and intuitive analogies
    code: 0.20,     // highly deterministic, syntax-safe code generation
    meta: 0.50      // structured, creative transformation or summarization
};

export function classifyQueryIntent(query: string): QueryIntent {
    const q = query.toLowerCase();
    if (/\b(implement\w*|code|write|build|create|show me how|example|snippet|function|script|class|method|syntax|test\w*|unit test|benchmark)\b/.test(q)) {
        return 'code';
    }
    if (/\b(summarize|summary|convert|translate|restructure|rewrite|transform|list all|key takeaways|outline|takeaway|what did i miss|what else)\b/.test(q)) {
        return 'meta';
    }
    if (/\b(explain|how does|how do|why|analogy|in simple terms|simple|understand|difference|compare|comparison|concept|alternative\w*|other option|trade-?offs?|tradeoffs?|pros and cons|edge case\w*|gotcha\w*|pitfall\w*|limitation\w*|drawback\w*|elaborate|tell me more|step[- ]by[- ]step)\b/.test(q) ||
        /\bwhat is (a|an)\b/.test(q) ||
        /\bwhat are the (alternatives|trade-offs|tradeoffs|edge cases|options|pros and cons)\b/.test(q)) {
        return 'explain';
    }
    return 'factual';
}

export function buildIntentDirective(intent: QueryIntent): string {
    switch (intent) {
        case 'factual':
            return 'DIRECTIVE: Answer directly in 1–2 conversational, high-signal sentences. Do not use headers, bullets, or filler.';
        case 'explain':
            return 'DIRECTIVE: Provide an intuitive, conversational explanation. Use a clear analogy if helpful, followed by the essential mechanics.';
        case 'code':
            return 'DIRECTIVE: Provide a brief direct explanation followed by a clean, production-grade code block. End with one proactive edge-case or gotcha tip.';
        case 'meta':
            return 'DIRECTIVE: Provide a well-organized, structured summary or transformation as requested. Be concise and eliminate fluff.';
    }
}

/**
 * ================================================================
 * 2. System Instruction (Frontier-Grade Conversational Persona)
 * ================================================================
 */
export const SYSTEM_INSTRUCTION = `
You are Agentic Chat Q&A Bot, an elite AI pair programmer and conversational companion analyzing a captured AI response turn.
Your job is to answer the user's questions about the captured context naturally, fluently, and authoritatively—matching the feel of frontier AI models.

CONVERSATIONAL TONE & HUMAN CADENCE:
- Speak like a sharp senior engineer discussing a system side-by-side with a colleague: direct, insightful, and collegiate.
- NEVER use robotic preambles or boilerplate phrases such as:
  ❌ "According to the captured context..."
  ❌ "Based on the provided response..."
  ❌ "From Chunk 0, we can see that..."
  ❌ "As stated in the text..."
  Jump straight into the answer with active, immediate phrasing (Inverted Pyramid).
- NO CITATION MARKERS: Do NOT include [Chunk X] or [0] bracket citations in your prose. The user provided the context; write a fluid, natural answer without academic footnote clutter.
- NO ARTIFICIAL ZONE CARDS: Do NOT compartmentalize your answer into artificial "From Captured Response" or "Deep-Dive" cards. Deliver a single cohesive, high-quality answer.
- Avoid mechanical repetition: State each point once, clearly and engagingly.

CORE SCOPE RULES:
1. CONTEXT PRIMACY (Primary Source of Truth):
   - Always prioritize information stated in the provided <context>. If the captured context already discusses alternatives, trade-offs, configuration values, or edge cases, your answer MUST be anchored in those points first.
2. EXPANDED KNOWLEDGE (Supplemental Synthesis):
   - If the user asks about alternatives, analogies, or deeper trade-offs that are not fully elaborated in the context, synthesize using your broader engineering expertise—always contrasting and relating back to the implementation anchored in the context. Never contradict facts established in the context.
3. OUT-OF-SCOPE REJECTION:
   - If the user asks a question completely unrelated to the topic of the captured context (e.g. cooking recipes, general trivia, unrelated domains):
   - Politely refuse: "This question is out of scope for the captured response. I am scoped to help you analyze this specific context."
4. EXPLANATION AND PEDAGOGY:
   - If the user asks to explain, simplify, translate, or provide an analogy for concepts present in the context:
   - Freely use clear analogies, simpler language, and step-by-step breakdowns while staying faithful to the core technical facts.
5. CODE IMPLEMENTATIONS & EXTENSIONS:
   - When asked for code, deliver idiomatic, production-ready, fully commented snippets.
   - Conclude code responses with one practical, proactive edge-case or gotcha tip that saves engineering time.

RESPONSE STYLE EXAMPLES:

EXAMPLE 1 — Factual Question:
User: "What port is Redis running on?"
Response:
"Redis is listening on its default port \`6379\`, configured with a 60-second sliding TTL window. Each time a client accesses an active key, the expiration counter resets automatically."

EXAMPLE 2 — Code Implementation:
User: "Show me how to connect to Redis with connection pooling."
Response:
"You can establish the client using the connection URL and configure pooling options directly:

\`\`\`typescript
import { createClient } from 'redis';

const client = createClient({
  url: 'redis://localhost:6379',
  socket: {
    reconnectStrategy: (retries) => Math.min(retries * 50, 1000)
  }
});

client.on('error', (err) => console.error('Redis Client Error:', err));
await client.connect();
\`\`\`

Proactive Tip: Always attach your \`'error'\` event listener *before* awaiting \`client.connect()\`—otherwise an initial network failure will throw an unhandled rejection and crash your process."
`.trim();

/**
 * =======================================================================================
 * 3. AGENT INSTRUCTION (Clean XML Context & Knowledge Injection)
 * ========================================================================================
 */

export function buildAgentContext(chunks: ScoredChunk[]): string {
    if (chunks.length === 0) {
        return `<context>\n  No relevant context found.\n</context>`;
    }

    const sources = chunks
        .map((sc, idx) => {
            const langAttr = sc.chunk.language ? ` lang="${sc.chunk.language}"` : '';
            return `  <source id="${idx}"${langAttr}>${sc.chunk.text.trim()}</source>`;
        })
        .join('\n');

    return `<context>\n${sources}\n</context>\n\nAnswer directly and conversationally based on the context above. Do not quote XML tags or include bracketed chunk numbers in your response.`;
}

/**
 * =================================================================================
 * 4. USER INSTRUCTION (The User's Immediate Intent)
 * ==================================================================================
 */
export function formatUserInstruction(query: string): string {
    return query.trim();
}

/**
 * =================================================================================
 * 5. ASSEMBLY FUNCTION (Builds the Full OpenAI-Compatible Messages Array)
 * =================================================================================
 */
export function assembleChatMessage(
    userQuery: string,
    retrieveChunks: ScoredChunk[],
    conversationHistory: { role: 'user' | 'assistant'; text: string }[] = [],
    maxHistoryTurns: number = 3,
    intent?: QueryIntent
): ChatMessage[] {
    const messages: ChatMessage[] = [];

    // 1. System Persona Constitution
    messages.push({
        role: 'system',
        content: SYSTEM_INSTRUCTION
    });

    // 2. Dynamic Agent Context + Intent Directive
    let agentContent = buildAgentContext(retrieveChunks);
    if (intent) {
        agentContent += `\n\n${buildIntentDirective(intent)}`;
    }

    messages.push({
        role: 'system',
        content: agentContent
    });

    // 3. Multi-turn sliding memory (last N turns for follow-up resolution)
    const recentHistory = conversationHistory.slice(-maxHistoryTurns * 2);
    for (const turn of recentHistory) {
        messages.push({
            role: turn.role,
            content: turn.text
        });
    }

    // 4. USER Immediate Query
    messages.push({
        role: 'user',
        content: formatUserInstruction(userQuery)
    });

    return messages;
}
