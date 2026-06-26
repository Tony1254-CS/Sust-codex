// src/engine/router.ts
// Compute department, severity, human_review, confidence, and reason_codes.
// All routing logic is deterministic. Pure function, no I/O.

import type { SignalSet, MatchResult, DuplicatePair } from '../types';
import type { TransactionEntry } from '../validation/request-schema';
import type {
  CaseType,
  Department,
  Severity,
  EvidenceVerdict,
} from '../config/enums';
import type { EvidenceResult } from './evidence-reasoner';
import {
  HIGH_VALUE_AMOUNT,
  ALWAYS_REVIEW_CASES,
  MONEY_MOVEMENT_CASES,
  CONFIDENCE_INCONSISTENT_MIN,
  CONFIDENCE_INCONSISTENT_MAX,
  CONFIDENCE_INSUFFICIENT_MIN,
  CONFIDENCE_INSUFFICIENT_MAX,
  CONFIDENCE_AMBIGUOUS,
  CONFIDENCE_PHISHING,
  CONFIDENCE_PHISHING_CREDENTIAL_BOOST,
  CONFIDENCE_DUPLICATE,
  CONFIDENCE_DEFAULT_BASE,
} from './rules';

export interface RoutingResult {
  department: Department;
  severity: Severity;
  humanReviewRequired: boolean;
  confidence: number;
  reasonCodes: string[];
}

/**
 * Compute full routing: department, severity, human review, confidence, reason codes.
 */
export function computeRouting(
  caseType: CaseType,
  evidenceResult: EvidenceResult,
  matchResult: MatchResult,
  signals: SignalSet,
  duplicatePair: DuplicatePair | null,
  userType?: string,
  matchedTx?: TransactionEntry | null
): RoutingResult {
  const reasonCodes: string[] = [];

  // Collect reason codes from evidence
  reasonCodes.push(...evidenceResult.flags);
  for (const c of evidenceResult.contradictions) {
    reasonCodes.push(`contradiction:${c}`);
  }

  // 1. Department
  const department = routeDepartment(
    caseType,
    evidenceResult.verdict,
    userType
  );

  // 2. Severity
  const severity = computeSeverity(
    caseType,
    evidenceResult,
    matchedTx,
    signals
  );

  // 3. Human review
  const humanReviewRequired = computeHumanReview(
    caseType,
    evidenceResult,
    matchResult,
    severity,
    matchedTx
  );

  // 4. Confidence
  const confidence = computeConfidence(
    matchResult,
    evidenceResult,
    signals,
    duplicatePair
  );

  // Add routing reason codes
  reasonCodes.push(`department:${department}`);
  if (humanReviewRequired) {
    reasonCodes.push('human_review_required');
  }

  return {
    department,
    severity,
    humanReviewRequired,
    confidence,
    reasonCodes,
  };
}

// ─── Department Routing ────────────────────────────────────────────────

function routeDepartment(
  caseType: CaseType,
  verdict: EvidenceVerdict,
  userType?: string
): Department {
  // User type overrides: merchant/agent
  if (userType) {
    const ut = userType.toLowerCase();
    if (ut === 'merchant' || ut.includes('merchant')) return 'merchant_operations';
    if (ut === 'agent' || ut.includes('agent')) return 'agent_operations';
  }

  switch (caseType) {
    case 'wrong_transfer':
      return 'dispute_resolution';

    case 'refund_request':
      // inconsistent/contested → dispute_resolution; else → customer_support
      if (verdict === 'inconsistent') return 'dispute_resolution';
      return 'customer_support';

    case 'payment_failed':
    case 'duplicate_payment':
      return 'payments_ops';

    case 'merchant_settlement_delay':
      return 'merchant_operations';

    case 'agent_cash_in_issue':
      return 'agent_operations';

    case 'phishing_or_social_engineering':
      return 'fraud_risk';

    case 'other':
    default:
      return 'customer_support';
  }
}

// ─── Severity ──────────────────────────────────────────────────────────

function computeSeverity(
  caseType: CaseType,
  evidenceResult: EvidenceResult,
  matchedTx?: TransactionEntry | null,
  signals?: SignalSet
): Severity {
  const amount = matchedTx?.amount ?? getMaxAmount(signals);

  // Phishing → critical (always)
  if (caseType === 'phishing_or_social_engineering') return 'critical';

  // Amount ≥ HIGH_VALUE on failed/dispute → high
  if (amount >= HIGH_VALUE_AMOUNT) {
    if (
      caseType === 'payment_failed' ||
      caseType === 'wrong_transfer' ||
      caseType === 'duplicate_payment'
    ) {
      return 'high';
    }
  }

  // Specific high-severity cases
  if (caseType === 'duplicate_payment') return 'high';
  if (caseType === 'agent_cash_in_issue') return 'high';

  // wrong_transfer with clear evidence → high
  if (caseType === 'wrong_transfer' && evidenceResult.verdict === 'consistent') {
    return 'high';
  }

  // payment_failed with deduction hint → high
  if (caseType === 'payment_failed') {
    const hasDeduction =
      signals?.statusHints.includes('deducted') ||
      evidenceResult.flags.includes('amount_matches');
    if (hasDeduction) return 'high';
    return 'medium';
  }

  // inconsistent on money-movement → medium
  if (
    evidenceResult.verdict === 'inconsistent' &&
    MONEY_MOVEMENT_CASES.has(caseType)
  ) {
    return 'medium';
  }

  // merchant_settlement_delay → medium
  if (caseType === 'merchant_settlement_delay') return 'medium';

  // wrong_transfer without consistent evidence → medium
  if (caseType === 'wrong_transfer') return 'medium';

  // refund_request (change of mind) → low
  if (caseType === 'refund_request') return 'low';

  // vague/other/insufficient_data without risk → low
  return 'low';
}

function getMaxAmount(signals?: SignalSet): number {
  if (!signals || signals.amounts.length === 0) return 0;
  return Math.max(...signals.amounts);
}

// ─── Human Review ──────────────────────────────────────────────────────

function computeHumanReview(
  caseType: CaseType,
  evidenceResult: EvidenceResult,
  matchResult: MatchResult,
  severity: Severity,
  matchedTx?: TransactionEntry | null
): boolean {
  // Always review for specific case types
  if (ALWAYS_REVIEW_CASES.has(caseType)) return true;

  // verdict inconsistent → true
  if (evidenceResult.verdict === 'inconsistent') return true;

  // insufficient_data driven by AMBIGUOUS → true
  if (
    evidenceResult.verdict === 'insufficient_data' &&
    matchResult.state === 'AMBIGUOUS'
  ) {
    return true;
  }

  // severity critical → true
  if (severity === 'critical') return true;

  // amount ≥ HIGH_VALUE on disputes
  if (matchedTx && matchedTx.amount >= HIGH_VALUE_AMOUNT) {
    if (
      caseType === 'wrong_transfer' ||
      caseType === 'duplicate_payment' ||
      caseType === 'refund_request'
    ) {
      return true;
    }
  }

  // false for: clean payment_failed, low-risk refund_request,
  // plain merchant_settlement_delay, vague-but-harmless other
  return false;
}

// ─── Confidence Scoring ────────────────────────────────────────────────

function computeConfidence(
  matchResult: MatchResult,
  evidenceResult: EvidenceResult,
  signals: SignalSet,
  duplicatePair: DuplicatePair | null
): number {
  // Base = best.txScore (0.5 if NO_MATCH/vague)
  let base = CONFIDENCE_DEFAULT_BASE;
  if (
    matchResult.bestMatch &&
    matchResult.state !== 'NO_MATCH' &&
    matchResult.state !== 'AMBIGUOUS'
  ) {
    base = matchResult.bestMatch.txScore;
  }

  let confidence: number;

  // Phishing → 0.90 (+0.05 if credential words)
  if (
    signals.intents.includes('phishing_or_social_engineering') ||
    matchResult.state === 'SPECIAL_NO_MATCH'
  ) {
    confidence = CONFIDENCE_PHISHING;
    if (signals.hasCredentialWords) {
      confidence += CONFIDENCE_PHISHING_CREDENTIAL_BOOST;
    }
    return roundConfidence(confidence);
  }

  // Duplicate pair found → 0.90
  if (duplicatePair) {
    return roundConfidence(CONFIDENCE_DUPLICATE);
  }

  // AMBIGUOUS → 0.60
  if (matchResult.state === 'AMBIGUOUS') {
    return roundConfidence(CONFIDENCE_AMBIGUOUS);
  }

  // Verdict-based clamping
  switch (evidenceResult.verdict) {
    case 'inconsistent':
      confidence = clamp(base, CONFIDENCE_INCONSISTENT_MIN, CONFIDENCE_INCONSISTENT_MAX);
      break;
    case 'insufficient_data':
      confidence = clamp(base, CONFIDENCE_INSUFFICIENT_MIN, CONFIDENCE_INSUFFICIENT_MAX);
      break;
    case 'consistent':
      confidence = base;
      break;
    default:
      confidence = base;
  }

  return roundConfidence(confidence);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function roundConfidence(value: number): number {
  const clamped = clamp(value, 0, 1);
  return Math.round(clamped * 100) / 100;
}
