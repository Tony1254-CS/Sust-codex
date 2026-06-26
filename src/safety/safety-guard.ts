// src/safety/safety-guard.ts
// Layer 5 / Barrier C: Terminal safety scanner.
// Runs on the final merged response object.
// Operates on customer_reply and recommended_next_action.
// If any rule fires, the offending field is replaced wholesale
// with its Barrier-A (deterministic template) version.
// Pure function, no I/O.

import { scanForViolations, type SafetyViolation } from './forbidden-lexicon';
import { logger } from '../utils/logger';

export interface SafetyResult {
  /** Whether any violations were found and fields were replaced */
  modified: boolean;
  /** List of violations detected */
  violations: SafetyViolation[];
  /** The sanitized fields */
  sanitizedFields: {
    customer_reply: string;
    recommended_next_action: string;
    agent_summary: string;
  };
}

/** Fields that the safety guard scans and can replace */
const GUARDED_FIELDS = [
  'customer_reply',
  'recommended_next_action',
  'agent_summary',
] as const;

/**
 * Run the terminal safety guard on a response object.
 *
 * Scans `customer_reply`, `recommended_next_action`, and `agent_summary`
 * for safety violations. If any field violates safety rules, it is
 * replaced wholesale with the provided safe fallback.
 *
 * @param response - The response object with prose fields
 * @param safeFallbacks - Safe Barrier-A templates to use as replacements
 * @returns SafetyResult with sanitized fields and violation details
 */
export function runSafetyGuard(
  response: Record<string, unknown>,
  safeFallbacks: {
    customer_reply: string;
    recommended_next_action: string;
    agent_summary: string;
  }
): SafetyResult {
  const allViolations: SafetyViolation[] = [];
  let modified = false;

  const sanitized = {
    customer_reply: String(response.customer_reply ?? ''),
    recommended_next_action: String(response.recommended_next_action ?? ''),
    agent_summary: String(response.agent_summary ?? ''),
  };

  // Scan each guarded field
  for (const field of GUARDED_FIELDS) {
    const text = sanitized[field];
    if (!text || text.trim().length === 0) continue;

    const violations = scanForViolations(text, field);

    if (violations.length > 0) {
      allViolations.push(...violations);
      modified = true;

      // Replace the entire field with the safe fallback
      sanitized[field] = safeFallbacks[field];

      logger.warn('Safety Guard replaced field', {
        field,
        violationCount: violations.length,
        violations: violations.map((v) => ({
          type: v.type,
          detail: v.detail,
        })),
      });
    }
  }

  if (allViolations.length > 0) {
    logger.warn('Safety Guard triggered', {
      totalViolations: allViolations.length,
      fieldsReplaced: allViolations.map((v) => v.field),
    });
  }

  return {
    modified,
    violations: allViolations,
    sanitizedFields: sanitized,
  };
}
