// src/engine/rules.ts
// All tunable constants — single source of truth.
// Every threshold, weight, and magic number lives here.

// ─── Transaction Matching Weights ──────────────────────────────────────

/** Weighted scoring formula: txScore = Σ(weight_i * score_i) + recencyBoost */
export const MATCH_WEIGHTS = {
  amount: 0.40,
  type: 0.20,
  temporal: 0.15,
  counterparty: 0.15,
  status: 0.10,
} as const;

/** Recency boost for the most recent transaction */
export const RECENCY_BOOST = 0.05;

// ─── Amount Matching Thresholds ────────────────────────────────────────

/** Exact amount match score */
export const AMOUNT_EXACT = 1.0;
/** Amount within ±2% */
export const AMOUNT_CLOSE = 0.85;
/** Amount within ±10% */
export const AMOUNT_LOOSE = 0.5;
/** No amount mentioned in complaint */
export const AMOUNT_NONE = 0.25;
/** Amount mismatch score */
export const AMOUNT_MISMATCH = 0.0;

/** Close match tolerance (±2%) */
export const AMOUNT_CLOSE_TOLERANCE = 0.02;
/** Loose match tolerance (±10%) */
export const AMOUNT_LOOSE_TOLERANCE = 0.10;

// ─── Type Matching ─────────────────────────────────────────────────────

/** Type hint matches tx.type */
export const TYPE_MATCH = 1.0;
/** No type hint in complaint */
export const TYPE_NONE = 0.5;
/** Type hint conflicts with tx.type */
export const TYPE_CONFLICT = 0.0;

// ─── Temporal Matching ─────────────────────────────────────────────────

/** Transaction within detected time window */
export const TEMPORAL_INSIDE = 1.0;
/** Transaction within ±3 hours of time reference */
export const TEMPORAL_CLOSE = 0.6;
/** No time reference in complaint */
export const TEMPORAL_NONE = 0.5;
/** Time tolerance for "close" match (3 hours in ms) */
export const TEMPORAL_CLOSE_WINDOW_MS = 3 * 60 * 60 * 1000;

// ─── Counterparty Matching ─────────────────────────────────────────────

/** Exact phone number match */
export const COUNTERPARTY_EXACT = 1.0;
/** Role match (agent/merchant/biller) or prefix match ≥7 digits */
export const COUNTERPARTY_ROLE = 0.8;
/** Relation word + transfer context */
export const COUNTERPARTY_RELATION = 0.4;
/** No counterparty mentioned */
export const COUNTERPARTY_NONE = 0.4;
/** Minimum digit prefix length for partial match */
export const COUNTERPARTY_PREFIX_MIN_DIGITS = 7;

// ─── Status Matching ───────────────────────────────────────────────────

/** Status hint agrees with tx.status */
export const STATUS_AGREE = 1.0;
/** No status hint in complaint */
export const STATUS_NONE = 0.5;
/** Status hint conflicts with tx.status */
export const STATUS_CONFLICT = 0.2;

// ─── Match State Thresholds ────────────────────────────────────────────

/** Minimum txScore to consider a match */
export const MATCH_MIN_SCORE = 0.40;
/** Ambiguity gap: if second is within this of best and ≥ MIN_SCORE */
export const AMBIGUITY_GAP = 0.12;

// ─── Duplicate Detection ──────────────────────────────────────────────

/** Maximum time difference for duplicate pair (120 seconds) */
export const DUPLICATE_MAX_TIME_DIFF_S = 120;

// ─── Evidence Reasoning ────────────────────────────────────────────────

/** Established-recipient: transactions in 30-day window */
export const ESTABLISHED_RECIPIENT_WINDOW_DAYS = 30;
/** Established-recipient: prior count threshold (long window) */
export const ESTABLISHED_RECIPIENT_COUNT = 2;
/** Established-recipient: prior count threshold (7-day window) */
export const ESTABLISHED_RECIPIENT_RECENT_COUNT = 1;
/** Established-recipient: recent window in days */
export const ESTABLISHED_RECIPIENT_RECENT_DAYS = 7;

// ─── Confidence Scoring ───────────────────────────────────────────────

/** Confidence threshold that gates LLM enrichment (Checkpoint 3) */
export const CONFIDENCE_THRESHOLD = 0.85;

/** Inconsistent verdict confidence range */
export const CONFIDENCE_INCONSISTENT_MIN = 0.70;
export const CONFIDENCE_INCONSISTENT_MAX = 0.80;

/** Insufficient data confidence range */
export const CONFIDENCE_INSUFFICIENT_MIN = 0.55;
export const CONFIDENCE_INSUFFICIENT_MAX = 0.70;

/** Ambiguous match confidence */
export const CONFIDENCE_AMBIGUOUS = 0.60;

/** Phishing confidence */
export const CONFIDENCE_PHISHING = 0.90;
/** Phishing boost when credential words are present */
export const CONFIDENCE_PHISHING_CREDENTIAL_BOOST = 0.05;

/** Duplicate pair found confidence */
export const CONFIDENCE_DUPLICATE = 0.90;

/** Default base when NO_MATCH or vague */
export const CONFIDENCE_DEFAULT_BASE = 0.50;

// ─── Severity ──────────────────────────────────────────────────────────

/** High-value amount threshold (BDT) */
export const HIGH_VALUE_AMOUNT = 10000;

// ─── Case Type Severity Priority (for tie-breaking) ────────────────────

/** Higher index = higher severity priority */
export const CASE_TYPE_PRIORITY: Record<string, number> = {
  other: 0,
  refund_request: 1,
  wrong_transfer: 2,
  payment_failed: 3,
  merchant_settlement_delay: 4,
  agent_cash_in_issue: 5,
  duplicate_payment: 6,
  phishing_or_social_engineering: 7,
};

// ─── Money-Movement Case Types ─────────────────────────────────────────

export const MONEY_MOVEMENT_CASES = new Set([
  'wrong_transfer',
  'payment_failed',
  'duplicate_payment',
  'agent_cash_in_issue',
]);

// ─── Cases Requiring Human Review ──────────────────────────────────────

export const ALWAYS_REVIEW_CASES = new Set([
  'wrong_transfer',
  'duplicate_payment',
  'agent_cash_in_issue',
  'phishing_or_social_engineering',
]);
