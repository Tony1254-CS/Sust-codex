// src/engine/evidence-reasoner.ts
// Compute evidence verdict from match state, contradictions, and support factors.
// Pure function, no I/O.

import type { TransactionEntry } from '../validation/request-schema';
import type { SignalSet, MatchResult, DuplicatePair } from '../types';
import type { EvidenceVerdict, CaseType } from '../config/enums';
import {
  ESTABLISHED_RECIPIENT_WINDOW_DAYS,
  ESTABLISHED_RECIPIENT_COUNT,
  ESTABLISHED_RECIPIENT_RECENT_COUNT,
  ESTABLISHED_RECIPIENT_RECENT_DAYS,
} from './rules';

export interface EvidenceResult {
  verdict: EvidenceVerdict;
  supportCount: number;
  contradictions: string[];
  flags: string[];
}

/**
 * Compute evidence verdict.
 *
 * Rules (from blueprint):
 * - No match / ambiguous / phishing → insufficient_data
 * - SINGLE_MATCH: compute support and contradictions
 *   - Any contradiction → inconsistent
 *   - support ≥ 1 → consistent
 *   - else → insufficient_data
 *
 * @param matchResult - Transaction match result
 * @param signals - Signal set from complaint
 * @param caseType - Resolved case type
 * @param transactions - Full transaction history
 * @param duplicatePair - Detected duplicate pair (if any)
 */
export function computeVerdict(
  matchResult: MatchResult,
  signals: SignalSet,
  caseType: CaseType,
  transactions: TransactionEntry[],
  duplicatePair: DuplicatePair | null
): EvidenceResult {
  // No match / ambiguous / phishing → insufficient_data
  if (
    matchResult.state === 'NO_MATCH' ||
    matchResult.state === 'AMBIGUOUS' ||
    matchResult.state === 'SPECIAL_NO_MATCH'
  ) {
    return {
      verdict: 'insufficient_data',
      supportCount: 0,
      contradictions: [],
      flags:
        matchResult.state === 'AMBIGUOUS'
          ? ['ambiguous_match']
          : matchResult.state === 'SPECIAL_NO_MATCH'
            ? ['phishing_case']
            : ['no_matching_transaction'],
    };
  }

  // SINGLE_MATCH — compute support and contradictions
  const matched = matchResult.bestMatch!;
  const tx = matched.transaction;
  let support = 0;
  const contradictions: string[] = [];
  const flags: string[] = [];

  // --- Support factors ---

  // Amount match
  if (matched.components.amountScore >= 0.85) {
    support += 1;
    flags.push('amount_matches');
  }

  // Type match
  if (matched.components.typeScore >= 1.0) {
    support += 1;
    flags.push('type_matches');
  }

  // Status agreement
  if (matched.components.statusScore >= 1.0) {
    support += 1;
    flags.push('status_agrees');
  }

  // --- Special support cases ---

  // agent_cash_in + pending → +1 support
  if (caseType === 'agent_cash_in_issue' && tx.status === 'pending') {
    support += 1;
    flags.push('agent_cash_in_pending_support');
  }

  // Duplicate pair found → +2 support
  if (duplicatePair) {
    support += 2;
    flags.push('duplicate_pair_found');
  }

  // refund_request is consistent by definition when matched
  if (caseType === 'refund_request') {
    support += 1;
    flags.push('refund_request_matched');
  }

  // --- Contradiction checks ---

  // Established-recipient check for wrong_transfer
  if (caseType === 'wrong_transfer' && tx.status === 'completed') {
    const established = checkEstablishedRecipient(tx, transactions);
    if (established) {
      contradictions.push('established_recipient');
      flags.push('established_recipient_detected');
    }
  }

  // Non-receipt vs completed: "not_received" statusHint ∧ tx.status=completed → contradiction
  if (
    signals.statusHints.includes('not_received') &&
    tx.status === 'completed'
  ) {
    // Exception: refund_request doesn't contradict on this
    // Exception: agent_cash_in + pending is handled above
    if (caseType !== 'refund_request') {
      contradictions.push('non_receipt_vs_completed');
    }
  }

  // General status contradiction
  if (
    matched.components.statusScore <= 0.2 &&
    signals.statusHints.length > 0
  ) {
    // Check specific contradictions
    const txStatus = tx.status.toLowerCase();

    // Failed hint but tx completed
    if (signals.statusHints.includes('failed') && txStatus === 'completed') {
      // Exception: refund_request
      if (caseType !== 'refund_request') {
        contradictions.push('status_failed_vs_completed');
      }
    }

    // Completed hint but tx failed
    if (signals.statusHints.includes('completed') && txStatus === 'failed') {
      contradictions.push('status_completed_vs_failed');
    }

    // Deducted hint but tx failed (money couldn't have been deducted if tx failed)
    // Actually "deducted but failed" is a valid complaint pattern — no contradiction
    // The user says money was cut but service wasn't received
  }

  // --- Compute verdict ---
  let verdict: EvidenceVerdict;

  if (contradictions.length > 0) {
    verdict = 'inconsistent';
  } else if (support >= 1) {
    verdict = 'consistent';
  } else {
    verdict = 'insufficient_data';
  }

  return { verdict, supportCount: support, contradictions, flags };
}

/**
 * Check if the counterparty is an established recipient (prior transfers).
 *
 * For wrong_transfer: count OTHER completed transfers to the same counterparty
 * in the 30-day window before the matched transaction.
 * Flag if n_prior ≥ 2 OR n_prior ≥ 1 within 7 days.
 */
function checkEstablishedRecipient(
  matchedTx: TransactionEntry,
  allTransactions: TransactionEntry[]
): boolean {
  const counterparty = (matchedTx.counterparty || '').trim().toLowerCase();
  if (!counterparty) return false;

  const matchedTime = new Date(matchedTx.timestamp).getTime();
  if (isNaN(matchedTime)) return false;

  const windowMs = ESTABLISHED_RECIPIENT_WINDOW_DAYS * 24 * 60 * 60 * 1000;
  const recentWindowMs = ESTABLISHED_RECIPIENT_RECENT_DAYS * 24 * 60 * 60 * 1000;

  let priorCount = 0;
  let recentPriorCount = 0;

  for (const tx of allTransactions) {
    // Skip the matched transaction itself
    if (tx.transaction_id === matchedTx.transaction_id) continue;

    // Only count completed transfers to the same counterparty
    if (tx.status !== 'completed') continue;
    if ((tx.counterparty || '').trim().toLowerCase() !== counterparty) continue;
    if (tx.type !== 'transfer' && tx.type !== 'payment') continue;

    const txTime = new Date(tx.timestamp).getTime();
    if (isNaN(txTime)) continue;

    // Must be before the matched tx
    if (txTime >= matchedTime) continue;

    // Within 30-day window
    if (matchedTime - txTime <= windowMs) {
      priorCount++;
    }

    // Within 7-day window
    if (matchedTime - txTime <= recentWindowMs) {
      recentPriorCount++;
    }
  }

  return (
    priorCount >= ESTABLISHED_RECIPIENT_COUNT ||
    recentPriorCount >= ESTABLISHED_RECIPIENT_RECENT_COUNT
  );
}
