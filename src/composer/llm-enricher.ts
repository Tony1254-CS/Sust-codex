// src/composer/llm-enricher.ts
// Layer 4: Conditional Gemini call to rewrite 3 prose fields.
// Trigger: LLM_ENABLED && confidence < CONFIDENCE_THRESHOLD.
// Timeout: LLM_TIMEOUT_MS (5500ms). No retry. Instant fallback.
// Any failure → silently keep Layer-3 deterministic templates.

import { GoogleGenerativeAI } from '@google/generative-ai';
import { z } from 'zod';
import type { Decision } from '../types';
import { getConfig } from '../config/env';
import { buildSystemPrompt, buildUserPrompt } from './llm-prompt';
import { logger } from '../utils/logger';

/** Schema for validating LLM JSON output */
const llmOutputSchema = z.object({
  agent_summary: z.string().min(1),
  recommended_next_action: z.string().min(1),
  customer_reply: z.string().min(1),
});

export interface LlmResult {
  agent_summary: string;
  recommended_next_action: string;
  customer_reply: string;
}

/** In-memory flag: disable LLM on first auth failure (per-invocation, stateless-safe) */
let llmDisabledThisInvocation = false;

/**
 * Conditionally enrich prose fields via Gemini.
 *
 * Returns the enriched fields, or null if:
 * - LLM is disabled
 * - Confidence is above threshold (fast path)
 * - API call fails (timeout, auth, parse, validation)
 *
 * @param decision - The full deterministic Decision
 * @returns Enriched prose fields, or null (use Layer-3 templates)
 */
export async function enrichWithLlm(
  decision: Decision
): Promise<LlmResult | null> {
  const config = getConfig();

  // Fast path: skip LLM if disabled or confidence is high enough
  if (!config.llmEnabled) {
    logger.debug('LLM skipped: disabled', { ticketId: decision.ticketId });
    return null;
  }

  if (llmDisabledThisInvocation) {
    logger.debug('LLM skipped: disabled this invocation (auth failure)', {
      ticketId: decision.ticketId,
    });
    return null;
  }

  if (decision.confidence >= config.confidenceThreshold) {
    logger.debug('LLM skipped: confidence above threshold', {
      ticketId: decision.ticketId,
      confidence: decision.confidence,
      threshold: config.confidenceThreshold,
    });
    return null;
  }

  if (!config.geminiApiKey) {
    logger.warn('LLM skipped: no API key configured', {
      ticketId: decision.ticketId,
    });
    return null;
  }

  // Attempt LLM call with timeout via AbortController
  const abortController = new AbortController();
  const timeoutId = setTimeout(() => abortController.abort(), config.llmTimeoutMs);

  try {
    const result = await callGemini(decision, config.geminiApiKey, abortController.signal);
    clearTimeout(timeoutId);
    return result;
  } catch (error: unknown) {
    clearTimeout(timeoutId);
    if (error instanceof Error && error.name === 'AbortError') {
      logger.warn('LLM timeout — using deterministic fallback', {
        ticketId: decision.ticketId,
        timeoutMs: config.llmTimeoutMs,
      });
    } else if (isAuthError(error)) {
      logger.warn('LLM auth failure — disabling for this invocation', {
        ticketId: decision.ticketId,
      });
      llmDisabledThisInvocation = true;
    } else {
      logger.warn('LLM error — using deterministic fallback', {
        ticketId: decision.ticketId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
    return null;
  }
}

/**
 * Make the actual Gemini API call.
 */
async function callGemini(
  decision: Decision,
  apiKey: string,
  signal: AbortSignal
): Promise<LlmResult | null> {
  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({
    model: 'gemini-2.0-flash',
    generationConfig: {
      responseMimeType: 'application/json',
      temperature: 0.3,
      maxOutputTokens: 1024,
    },
  });

  const systemPrompt = buildSystemPrompt(decision.language);
  const userPrompt = buildUserPrompt(decision);

  logger.debug('LLM call initiated', {
    ticketId: decision.ticketId,
    model: 'gemini-2.0-flash',
  });

  const result = await model.generateContent(
    {
      systemInstruction: systemPrompt,
      contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
    },
    { signal }
  );

  const response = result.response;
  const text = response.text();

  if (!text || text.trim().length === 0) {
    logger.warn('LLM returned empty response', {
      ticketId: decision.ticketId,
    });
    return null;
  }

  // Parse JSON response
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    logger.warn('LLM response is not valid JSON', {
      ticketId: decision.ticketId,
    });
    return null;
  }

  // Validate with Zod
  const validated = llmOutputSchema.safeParse(parsed);
  if (!validated.success) {
    logger.warn('LLM response failed schema validation', {
      ticketId: decision.ticketId,
      errors: validated.error.issues.map((i) => i.message),
    });
    return null;
  }

  logger.debug('LLM enrichment successful', {
    ticketId: decision.ticketId,
  });

  return validated.data;
}

/**
 * Check if an error is an authentication/authorization error.
 */
function isAuthError(error: unknown): boolean {
  if (error instanceof Error) {
    const msg = error.message.toLowerCase();
    return (
      msg.includes('401') ||
      msg.includes('403') ||
      msg.includes('unauthorized') ||
      msg.includes('forbidden') ||
      msg.includes('invalid api key') ||
      msg.includes('api key not valid')
    );
  }
  return false;
}

/**
 * Reset the per-invocation LLM disabled flag.
 * Called at the start of each request to ensure fresh state.
 */
export function resetLlmState(): void {
  llmDisabledThisInvocation = false;
}
