// src/engine/transaction-matcher.ts
// Layer 2a: Score each transaction against signals; pick best; classify match state.
// Formula: txScore = 0.40·amount + 0.20·type + 0.15·temporal + 0.15·counterparty + 0.10·status + recency
// Pure function, no I/O.

import type { TransactionEntry } from '../validation/request-schema';
import type { SignalSet, ScoredTransaction, MatchResult, MatchState, ScoreComponents } from '../types';
import {
  MATCH_WEIGHTS,
  RECENCY_BOOST,
  AMOUNT_EXACT, AMOUNT_CLOSE, AMOUNT_LOOSE, AMOUNT_NONE, AMOUNT_MISMATCH,
  AMOUNT_CLOSE_TOLERANCE, AMOUNT_LOOSE_TOLERANCE,
  TYPE_MATCH, TYPE_NONE, TYPE_CONFLICT,
  TEMPORAL_INSIDE, TEMPORAL_CLOSE, TEMPORAL_NONE, TEMPORAL_CLOSE_WINDOW_MS,
  COUNTERPARTY_EXACT, COUNTERPARTY_ROLE, COUNTERPARTY_RELATION, COUNTERPARTY_NONE,
  COUNTERPARTY_PREFIX_MIN_DIGITS,
  STATUS_AGREE, STATUS_NONE, STATUS_CONFLICT,
  MATCH_MIN_SCORE, AMBIGUITY_GAP,
} from './rules';

// ─── Type compatibility map ─────────────────────────────────────────────

/** Types that are conceptually related and don't conflict */
const TYPE_COMPATIBLE: Record<string, Set<string>> = {
  transfer: new Set(['transfer']),
  payment: new Set(['payment']),
  cash_in: new Set(['cash_in']),
  cash_out: new Set(['cash_out']),
  settlement: new Set(['settlement']),
  refund: new Set(['refund']),
};

// ─── Status mapping from signal hints to tx statuses ────────────────────

/** Map status hints from complaint to expected tx statuses */
const STATUS_AGREEMENT: Record<string, string[]> = {
  failed: ['failed'],
  pending: ['pending'],
  completed: ['completed'],
  reversed: ['reversed'],
  deducted: ['completed', 'pending'], // money was taken → tx went through
  not_received: ['failed', 'pending'], // didn't arrive → tx may have failed
};

/** Status pairs that are contradictory */
const STATUS_CONTRADICTIONS: Array<[string, string[]]> = [
  ['failed', ['completed']],
  ['completed', ['failed']],
  ['not_received', ['completed']], // says didn't get but tx completed
  ['reversed', ['completed', 'pending']],
];

// ─── Scoring Functions ──────────────────────────────────────────────────

function scoreAmount(signals: SignalSet, tx: TransactionEntry): number {
  if (signals.amounts.length === 0) return AMOUNT_NONE;

  const txAmount = tx.amount;
  if (txAmount <= 0) return AMOUNT_NONE;

  for (const sigAmount of signals.amounts) {
    // Exact match
    if (sigAmount === txAmount) return AMOUNT_EXACT;

    // Close match (±2%)
    const ratio = Math.abs(sigAmount - txAmount) / txAmount;
    if (ratio <= AMOUNT_CLOSE_TOLERANCE) return AMOUNT_CLOSE;

    // Loose match (±10%)
    if (ratio <= AMOUNT_LOOSE_TOLERANCE) return AMOUNT_LOOSE;
  }

  return AMOUNT_MISMATCH;
}

function scoreType(signals: SignalSet, tx: TransactionEntry): number {
  if (signals.typeHints.length === 0) return TYPE_NONE;

  const txType = tx.type.toLowerCase();

  for (const hint of signals.typeHints) {
    const compatible = TYPE_COMPATIBLE[hint.toLowerCase()];
    if (compatible && compatible.has(txType)) return TYPE_MATCH;
  }

  // If we have type hints but none match, it's a conflict
  // But only if the tx type is in our known types
  const knownTypes = new Set(Object.keys(TYPE_COMPATIBLE));
  if (knownTypes.has(txType)) return TYPE_CONFLICT;

  // Unknown tx type — no conflict, just no match
  return TYPE_NONE;
}

function scoreTemporal(signals: SignalSet, tx: TransactionEntry): number {
  if (signals.timeRefs.length === 0) return TEMPORAL_NONE;

  const txTime = new Date(tx.timestamp);
  if (isNaN(txTime.getTime())) return TEMPORAL_NONE;

  for (const ref of signals.timeRefs) {
    if (!ref.estimatedDate) continue;

    const diff = Math.abs(txTime.getTime() - ref.estimatedDate.getTime());

    // Inside the window (same day for relative refs)
    if (ref.type === 'relative' || ref.type === 'time_of_day') {
      // For relative refs, check if same calendar day
      const sameDay =
        txTime.getFullYear() === ref.estimatedDate.getFullYear() &&
        txTime.getMonth() === ref.estimatedDate.getMonth() &&
        txTime.getDate() === ref.estimatedDate.getDate();
      if (sameDay) return TEMPORAL_INSIDE;
    }

    if (ref.type === 'absolute') {
      // For absolute timestamps, close means within 1 hour
      if (diff < 60 * 60 * 1000) return TEMPORAL_INSIDE;
    }

    // Within ±3 hours
    if (diff <= TEMPORAL_CLOSE_WINDOW_MS) return TEMPORAL_CLOSE;
  }

  // Time refs exist but no match — still give base score
  return TEMPORAL_NONE;
}

function scoreCounterparty(
  signals: SignalSet,
  tx: TransactionEntry
): number {
  if (signals.counterpartyMentions.length === 0) return COUNTERPARTY_NONE;

  const txCounterparty = (tx.counterparty || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  if (!txCounterparty) return COUNTERPARTY_NONE;

  for (const mention of signals.counterpartyMentions) {
    // Skip role/relation tags for exact matching
    if (mention.startsWith('role:') || mention.startsWith('relation:')) continue;

    const cleanMention = mention.replace(/[^a-z0-9]/gi, '').toLowerCase();

    // Exact phone number match
    if (cleanMention === txCounterparty) return COUNTERPARTY_EXACT;

    // Prefix match (≥7 digits)
    const mentionDigits = cleanMention.replace(/[^0-9]/g, '');
    const txDigits = txCounterparty.replace(/[^0-9]/g, '');
    if (
      mentionDigits.length >= COUNTERPARTY_PREFIX_MIN_DIGITS &&
      txDigits.length >= COUNTERPARTY_PREFIX_MIN_DIGITS
    ) {
      if (txDigits.startsWith(mentionDigits) || mentionDigits.startsWith(txDigits)) {
        return COUNTERPARTY_ROLE; // 0.8, same as role match
      }
    }
  }

  // Check role matches
  for (const mention of signals.counterpartyMentions) {
    if (mention.startsWith('role:')) {
      const role = mention.replace('role:', '');
      // If tx counterparty contains the role name, it's a role match
      if (txCounterparty.includes(role)) return COUNTERPARTY_ROLE;
    }
  }

  // Check relation word + transfer context
  const hasRelation = signals.counterpartyMentions.some((m) =>
    m.startsWith('relation:')
  );
  const hasTransferType = signals.typeHints.some(
    (t) => t === 'transfer' || t === 'payment'
  );
  if (hasRelation && hasTransferType) return COUNTERPARTY_RELATION;

  return COUNTERPARTY_NONE;
}

function scoreStatus(signals: SignalSet, tx: TransactionEntry): number {
  if (signals.statusHints.length === 0) return STATUS_NONE;

  const txStatus = tx.status.toLowerCase();

  // Check for agreement first
  for (const hint of signals.statusHints) {
    const agreeing = STATUS_AGREEMENT[hint];
    if (agreeing && agreeing.includes(txStatus)) return STATUS_AGREE;
  }

  // Check for explicit contradictions
  for (const hint of signals.statusHints) {
    for (const [hintKey, contradicts] of STATUS_CONTRADICTIONS) {
      if (hint === hintKey && contradicts.includes(txStatus)) {
        return STATUS_CONFLICT;
      }
    }
  }

  return STATUS_NONE;
}

// ─── Main Matcher ──────────────────────────────────────────────────────

/**
 * Score all transactions and determine match state.
 *
 * @param signals - Extracted signals from complaint
 * @param transactions - Transaction history
 * @returns MatchResult with state, best/second match, and all scores
 */
export function matchTransactions(
  signals: SignalSet,
  transactions: TransactionEntry[]
): MatchResult {
  if (transactions.length === 0) {
    return {
      state: 'NO_MATCH',
      bestMatch: null,
      secondMatch: null,
      allScores: [],
    };
  }

  // Intent includes phishing → SPECIAL_NO_MATCH
  if (signals.intents.includes('phishing_or_social_engineering')) {
    // Still score for context, but state is SPECIAL_NO_MATCH
    const scores = scoreAll(signals, transactions);
    return {
      state: 'SPECIAL_NO_MATCH',
      bestMatch: scores[0] ?? null,
      secondMatch: scores[1] ?? null,
      allScores: scores,
    };
  }

  const scores = scoreAll(signals, transactions);

  if (scores.length === 0) {
    return {
      state: 'NO_MATCH',
      bestMatch: null,
      secondMatch: null,
      allScores: [],
    };
  }

  const best = scores[0];
  const second = scores.length > 1 ? scores[1] : null;

  // Determine match state
  let state: MatchState;

  if (best.txScore < MATCH_MIN_SCORE) {
    state = 'NO_MATCH';
  } else if (
    second &&
    second.txScore >= MATCH_MIN_SCORE &&
    second.txScore >= best.txScore - AMBIGUITY_GAP
  ) {
    state = 'AMBIGUOUS';
  } else {
    state = 'SINGLE_MATCH';
  }

  return {
    state,
    bestMatch: best,
    secondMatch: second ?? null,
    allScores: scores,
  };
}

/**
 * Score all transactions and sort by txScore descending.
 */
function scoreAll(
  signals: SignalSet,
  transactions: TransactionEntry[]
): ScoredTransaction[] {
  // Find the most recent transaction
  let mostRecentIdx = 0;
  let mostRecentTime = 0;
  for (let i = 0; i < transactions.length; i++) {
    const t = new Date(transactions[i].timestamp).getTime();
    if (!isNaN(t) && t > mostRecentTime) {
      mostRecentTime = t;
      mostRecentIdx = i;
    }
  }

  const scored: ScoredTransaction[] = transactions.map((tx, idx) => {
    const components: ScoreComponents = {
      amountScore: scoreAmount(signals, tx),
      typeScore: scoreType(signals, tx),
      temporalScore: scoreTemporal(signals, tx),
      counterpartyScore: scoreCounterparty(signals, tx),
      statusScore: scoreStatus(signals, tx),
      recencyBoost: idx === mostRecentIdx ? RECENCY_BOOST : 0,
    };

    const txScore =
      MATCH_WEIGHTS.amount * components.amountScore +
      MATCH_WEIGHTS.type * components.typeScore +
      MATCH_WEIGHTS.temporal * components.temporalScore +
      MATCH_WEIGHTS.counterparty * components.counterpartyScore +
      MATCH_WEIGHTS.status * components.statusScore +
      components.recencyBoost;

    return { transaction: tx, txScore, components };
  });

  // Sort descending by txScore
  scored.sort((a, b) => b.txScore - a.txScore);

  return scored;
}
