// src/pipeline/orchestrator.ts
// Orchestrates Layers 0→6 in order.
// Checkpoint 3: Full pipeline with LLM enrichment + Safety Guard.
// Deterministic engine (Layers 1-3) is FROZEN — never modified here.

import type { ValidatedRequest } from '../validation/request-schema';
import type { TicketResponse } from '../validation/response-schema';
import type { Decision } from '../types';
import { extractSignals } from '../extractor/signal-extractor';
import { matchTransactions } from '../engine/transaction-matcher';
import { detectDuplicates } from '../engine/duplicate-detector';
import { classifyCaseType } from '../engine/classifier';
import { computeVerdict } from '../engine/evidence-reasoner';
import { computeRouting } from '../engine/router';
import { generateProse } from '../composer/text-templates';
import { enrichWithLlm, resetLlmState } from '../composer/llm-enricher';
import { sanitizeForLlm } from '../safety/injection-filter';
import { runSafetyGuard } from '../safety/safety-guard';
import { guardResponse } from '../guardian/schema-guardian';
import { logger } from '../utils/logger';

/** Whole-handler soft cap: ship deterministic immediately if exceeded (25s) */
const SOFT_CAP_MS = 25000;

/**
 * Process a validated ticket through the full investigation pipeline.
 *
 * Pipeline flow:
 * 1. Layer 1 — Signal Extractor: complaint → SignalSet
 * 2. Layer 2 — Deterministic Engine:
 *    a. Duplicate Detection (if duplicate intent)
 *    b. Transaction Matching
 *    c. Case Classification
 *    d. Evidence Reasoning
 *    e. Routing (department, severity, review, confidence, reason_codes)
 * 3. Layer 3 — Text Composer: deterministic prose templates
 * 4. Layer 4 — LLM Enricher: conditional Gemini rewrite (confidence < 0.85)
 * 5. Layer 5 — Safety Guard: terminal scan of prose fields
 * 6. Layer 6 — Schema Guardian: terminal validation + safety backstop
 *
 * @param request - The validated request object
 * @returns A fully validated, spec-compliant, safe response
 */
export async function investigate(request: ValidatedRequest): Promise<TicketResponse> {
  const t0 = Date.now();

  // Reset per-invocation LLM state
  resetLlmState();

  logger.info('Pipeline started', { ticketId: request.ticket_id });

  // ─── Layer 1: Signal Extraction ────────────────────────────────
  const signals = extractSignals(request.complaint, request.language);

  logger.debug('Signals extracted', {
    ticketId: request.ticket_id,
    amounts: signals.amounts,
    intents: signals.intents,
    typeHints: signals.typeHints,
    statusHints: signals.statusHints,
    language: signals.language,
    adversarialFlags: signals.adversarialFlags,
  });

  // ─── Layer 2a: Duplicate Detection ─────────────────────────────
  const transactions = request.transaction_history ?? [];
  let duplicatePair = null;

  if (signals.intents.includes('duplicate_payment')) {
    duplicatePair = detectDuplicates(transactions);
    if (duplicatePair) {
      logger.debug('Duplicate pair detected', {
        ticketId: request.ticket_id,
        first: duplicatePair.first.transaction_id,
        second: duplicatePair.second.transaction_id,
        timeDiff: duplicatePair.timeDiffSeconds,
      });
    }
  }

  // ─── Layer 2b: Transaction Matching ────────────────────────────
  const matchResult = matchTransactions(signals, transactions);

  logger.debug('Transaction matching complete', {
    ticketId: request.ticket_id,
    state: matchResult.state,
    bestScore: matchResult.bestMatch?.txScore ?? null,
    secondScore: matchResult.secondMatch?.txScore ?? null,
  });

  // ─── Layer 2c: Case Classification ─────────────────────────────
  const caseType = classifyCaseType(signals, matchResult);

  // ─── Determine relevant_transaction_id ─────────────────────────
  let relevantTransactionId: string | null = null;
  let matchedTransaction = null;

  if (duplicatePair && caseType === 'duplicate_payment') {
    // For duplicates, pick the later tx of the closest pair
    relevantTransactionId = duplicatePair.second.transaction_id;
    matchedTransaction = duplicatePair.second;
  } else if (matchResult.state === 'SINGLE_MATCH' && matchResult.bestMatch) {
    relevantTransactionId = matchResult.bestMatch.transaction.transaction_id;
    matchedTransaction = matchResult.bestMatch.transaction;
  }
  // NO_MATCH, AMBIGUOUS, SPECIAL_NO_MATCH → null

  // ─── Layer 2d: Evidence Reasoning ──────────────────────────────
  const evidenceResult = computeVerdict(
    matchResult,
    signals,
    caseType,
    transactions,
    duplicatePair
  );

  logger.debug('Evidence verdict computed', {
    ticketId: request.ticket_id,
    verdict: evidenceResult.verdict,
    support: evidenceResult.supportCount,
    contradictions: evidenceResult.contradictions,
  });

  // ─── Layer 2e: Routing ─────────────────────────────────────────
  const routing = computeRouting(
    caseType,
    evidenceResult,
    matchResult,
    signals,
    duplicatePair,
    request.user_type,
    matchedTransaction
  );

  // ─── Assemble Decision ─────────────────────────────────────────
  const decision: Decision = {
    ticketId: request.ticket_id,
    relevantTransactionId,
    evidenceVerdict: evidenceResult.verdict,
    caseType,
    severity: routing.severity,
    department: routing.department,
    humanReviewRequired: routing.humanReviewRequired,
    confidence: routing.confidence,
    reasonCodes: routing.reasonCodes,
    matchResult,
    signalSet: signals,
    duplicatePair,
    language: signals.language,
    matchedTransaction,
  };

  // ─── Layer 3: Text Composer (deterministic templates) ──────────
  const prose = generateProse(decision);

  // Start with deterministic prose
  let agentSummary = prose.agentSummary;
  let recommendedNextAction = prose.recommendedNextAction;
  let customerReply = prose.customerReply;

  // ─── Layer 4: LLM Enricher (conditional) ───────────────────────
  // Only call if: LLM_ENABLED && confidence < 0.85 && within time budget
  const elapsed = Date.now() - t0;
  if (elapsed < SOFT_CAP_MS) {
    const sanitized = sanitizeForLlm(request.complaint);
    if (sanitized.trim().length === 0) {
      logger.debug('LLM skipped: sanitized prompt is empty', { ticketId: request.ticket_id });
    } else {
      try {
        const llmResult = await enrichWithLlm(decision);
        if (llmResult) {
          agentSummary = llmResult.agent_summary;
          recommendedNextAction = llmResult.recommended_next_action;
          customerReply = llmResult.customer_reply;

          logger.debug('LLM enrichment applied', {
            ticketId: request.ticket_id,
          });
        }
      } catch (error: unknown) {
        // Any unhandled LLM error → keep deterministic prose
        logger.warn('LLM enrichment failed — using templates', {
          ticketId: request.ticket_id,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }
  } else {
    logger.warn('Soft cap exceeded before LLM — shipping deterministic', {
      ticketId: request.ticket_id,
      elapsedMs: elapsed,
    });
  }

  // ─── Layer 5: Safety Guard ─────────────────────────────────────
  // Scans prose fields and replaces unsafe content with Barrier-A templates
  const safetyInput: Record<string, unknown> = {
    customer_reply: customerReply,
    recommended_next_action: recommendedNextAction,
    agent_summary: agentSummary,
  };

  const safetyResult = runSafetyGuard(safetyInput, {
    customer_reply: prose.customerReply,
    recommended_next_action: prose.recommendedNextAction,
    agent_summary: prose.agentSummary,
  });

  if (safetyResult.modified) {
    agentSummary = safetyResult.sanitizedFields.agent_summary;
    recommendedNextAction = safetyResult.sanitizedFields.recommended_next_action;
    customerReply = safetyResult.sanitizedFields.customer_reply;

    logger.info('Safety Guard modified response', {
      ticketId: request.ticket_id,
      violations: safetyResult.violations.length,
    });
  }

  // ─── Layer 6: Schema Guardian (terminal — always runs) ─────────
  const rawResponse: Record<string, unknown> = {
    ticket_id: decision.ticketId,
    relevant_transaction_id: decision.relevantTransactionId,
    evidence_verdict: decision.evidenceVerdict,
    case_type: decision.caseType,
    severity: decision.severity,
    department: decision.department,
    agent_summary: agentSummary,
    recommended_next_action: recommendedNextAction,
    customer_reply: customerReply,
    human_review_required: decision.humanReviewRequired,
    confidence: decision.confidence,
    reason_codes: decision.reasonCodes,
  };

  const response = guardResponse(rawResponse, request.ticket_id);

  const durationMs = Date.now() - t0;
  logger.info('Pipeline completed', {
    ticketId: request.ticket_id,
    durationMs,
    caseType: response.case_type,
    verdict: response.evidence_verdict,
    department: response.department,
    severity: response.severity,
    confidence: response.confidence,
    humanReview: response.human_review_required,
    matchState: matchResult.state,
    llmUsed: safetyResult.modified ? 'yes (safety-modified)' : 'template',
  });

  return response;
}
