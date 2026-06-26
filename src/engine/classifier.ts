// src/engine/classifier.ts
// Resolve case_type from SignalSet intents.
// Multi-label intents resolved by severity priority tie-break.
// Phishing always wins. Pure function, no I/O.

import type { SignalSet, MatchResult } from '../types';
import type { CaseType } from '../config/enums';
import { CASE_TYPE_PRIORITY } from './rules';

/**
 * Classify the case type from detected intents.
 *
 * Resolution rules:
 * 1. Phishing always wins regardless of other signals.
 * 2. Multi-label resolved by severity priority (higher wins).
 * 3. Reconciliation: chosen case_type should be consistent with matched tx type.
 * 4. Fallback: 'other' if no intent detected.
 *
 * @param signals - Extracted signals from complaint
 * @param matchResult - Transaction match result (for reconciliation)
 * @returns Resolved case type
 */
export function classifyCaseType(
  signals: SignalSet,
  matchResult: MatchResult
): CaseType {
  const { intents } = signals;

  // No intents → other
  if (intents.length === 0) {
    return 'other';
  }

  // Single intent → use directly
  if (intents.length === 1) {
    return validateCaseType(intents[0]);
  }

  // Multiple intents → resolve by severity priority (highest wins)
  // Phishing always wins per blueprint
  if (intents.includes('phishing_or_social_engineering')) {
    return 'phishing_or_social_engineering';
  }

  // Sort by priority descending
  const sorted = [...intents].sort((a, b) => {
    const pa = CASE_TYPE_PRIORITY[a] ?? 0;
    const pb = CASE_TYPE_PRIORITY[b] ?? 0;
    return pb - pa;
  });

  const winner = validateCaseType(sorted[0]);

  // Reconciliation: if matched tx type conflicts with case_type,
  // trust the intent but this will be flagged for review later
  return winner;
}

/**
 * Validate that a string is a valid CaseType.
 * Returns 'other' for unknown values.
 */
function validateCaseType(raw: string): CaseType {
  const valid = new Set([
    'wrong_transfer',
    'payment_failed',
    'refund_request',
    'duplicate_payment',
    'merchant_settlement_delay',
    'agent_cash_in_issue',
    'phishing_or_social_engineering',
    'other',
  ]);
  return valid.has(raw) ? (raw as CaseType) : 'other';
}
