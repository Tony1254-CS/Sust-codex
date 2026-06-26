// src/engine/duplicate-detector.ts
// Detect near-identical payment pairs in transaction history.
// Triggered when duplicate_payment intent is detected.
// Pure function, no I/O.

import type { TransactionEntry } from '../validation/request-schema';
import type { DuplicatePair } from '../types';
import { DUPLICATE_MAX_TIME_DIFF_S } from './rules';

/**
 * Find duplicate transaction pairs in the history.
 *
 * A pair is a duplicate candidate if:
 * - Same amount
 * - Same counterparty
 * - |Δt| ≤ 120 seconds
 *
 * Returns the closest pair. The `second` (later) transaction is the one
 * to flag as `relevant_transaction_id` (per SAMPLE-10 behavior).
 *
 * @param transactions - Transaction history sorted by timestamp
 * @returns The closest duplicate pair, or null if none found
 */
export function detectDuplicates(
  transactions: TransactionEntry[]
): DuplicatePair | null {
  if (transactions.length < 2) return null;

  // Sort by timestamp ascending for pair comparison
  const sorted = [...transactions].sort((a, b) => {
    const ta = new Date(a.timestamp).getTime();
    const tb = new Date(b.timestamp).getTime();
    return ta - tb;
  });

  let closestPair: DuplicatePair | null = null;
  let closestTimeDiff = Infinity;

  for (let i = 0; i < sorted.length; i++) {
    for (let j = i + 1; j < sorted.length; j++) {
      const first = sorted[i];
      const second = sorted[j];

      // Check amount equality
      if (first.amount !== second.amount || first.amount <= 0) continue;

      // Check counterparty equality (case-insensitive, trimmed)
      const cp1 = (first.counterparty || '').trim().toLowerCase();
      const cp2 = (second.counterparty || '').trim().toLowerCase();
      if (cp1 !== cp2 || cp1 === '') continue;

      // Check time difference
      const t1 = new Date(first.timestamp).getTime();
      const t2 = new Date(second.timestamp).getTime();
      if (isNaN(t1) || isNaN(t2)) continue;

      const timeDiffSeconds = Math.abs(t2 - t1) / 1000;
      if (timeDiffSeconds > DUPLICATE_MAX_TIME_DIFF_S) continue;

      // This is a candidate — keep the closest pair
      if (timeDiffSeconds < closestTimeDiff) {
        closestTimeDiff = timeDiffSeconds;
        closestPair = {
          first,
          second,
          timeDiffSeconds,
        };
      }
    }
  }

  return closestPair;
}
