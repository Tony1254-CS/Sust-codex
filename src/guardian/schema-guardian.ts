// src/guardian/schema-guardian.ts
// Terminal Schema Guardian. Runs LAST on every response.
// Guarantees: all required fields, valid enums, clamped confidence,
// correct ticket_id, no extra fields. Re-runs Safety Guard as final backstop.
// A schema-violating or unsafe response is structurally impossible to emit.

import {
  EVIDENCE_VERDICTS,
  SEVERITIES,
  CASE_TYPES,
  DEPARTMENTS,
  type EvidenceVerdict,
  type Severity,
  type CaseType,
  type Department,
} from '../config/enums';
import { type TicketResponse } from '../validation/response-schema';
import { runSafetyGuard } from '../safety/safety-guard';
import { logger } from '../utils/logger';

/** Safe defaults when a field is missing or has an invalid enum */
const SAFE_DEFAULTS: TicketResponse = {
  ticket_id: '',
  relevant_transaction_id: null,
  evidence_verdict: 'insufficient_data',
  case_type: 'other',
  severity: 'low',
  department: 'customer_support',
  agent_summary: 'This ticket requires further review by a support agent.',
  recommended_next_action: 'Review the ticket details and transaction history manually.',
  customer_reply:
    'Thank you for reaching out. Your concern has been noted and will be reviewed by our support team. Please contact us through official channels for updates.',
  human_review_required: true,
  confidence: 0.5,
  reason_codes: [],
};

/** Allowed output field names — everything else is stripped */
const ALLOWED_FIELDS = new Set<string>(Object.keys(SAFE_DEFAULTS));

function isValidEnum<T extends string>(
  value: unknown,
  allowed: readonly T[]
): value is T {
  return typeof value === 'string' && (allowed as readonly string[]).includes(value);
}

/**
 * Terminal guardian. Normalizes, validates, and sanitizes the response.
 * Guarantees a spec-compliant output regardless of upstream errors.
 *
 * @param raw - The raw response object from the pipeline
 * @param requestTicketId - The ticket_id from the original request (echoed back)
 */
export function guardResponse(
  raw: Record<string, unknown>,
  requestTicketId: string
): TicketResponse {
  const guarded: Record<string, unknown> = {};

  // 1. Force ticket_id to match request
  guarded.ticket_id = requestTicketId;

  // 2. relevant_transaction_id: string or null
  const rawTxId = raw.relevant_transaction_id;
  guarded.relevant_transaction_id =
    typeof rawTxId === 'string' && rawTxId.length > 0 ? rawTxId : null;

  // 3. Validate enums — substitute safe defaults on invalid
  guarded.evidence_verdict = isValidEnum(raw.evidence_verdict, EVIDENCE_VERDICTS)
    ? raw.evidence_verdict
    : SAFE_DEFAULTS.evidence_verdict;

  guarded.case_type = isValidEnum(raw.case_type, CASE_TYPES)
    ? raw.case_type
    : SAFE_DEFAULTS.case_type;

  guarded.severity = isValidEnum(raw.severity, SEVERITIES)
    ? raw.severity
    : SAFE_DEFAULTS.severity;

  guarded.department = isValidEnum(raw.department, DEPARTMENTS)
    ? raw.department
    : SAFE_DEFAULTS.department;

  // 4. Prose fields: must be non-empty strings
  guarded.agent_summary =
    typeof raw.agent_summary === 'string' && raw.agent_summary.trim().length > 0
      ? raw.agent_summary
      : SAFE_DEFAULTS.agent_summary;

  guarded.recommended_next_action =
    typeof raw.recommended_next_action === 'string' &&
    raw.recommended_next_action.trim().length > 0
      ? raw.recommended_next_action
      : SAFE_DEFAULTS.recommended_next_action;

  guarded.customer_reply =
    typeof raw.customer_reply === 'string' && raw.customer_reply.trim().length > 0
      ? raw.customer_reply
      : SAFE_DEFAULTS.customer_reply;

  // 5. Boolean: coerce to boolean
  guarded.human_review_required =
    typeof raw.human_review_required === 'boolean'
      ? raw.human_review_required
      : SAFE_DEFAULTS.human_review_required;

  // 6. Confidence: coerce to number, clamp [0, 1], round 2 decimals
  let confidence: number;
  if (typeof raw.confidence === 'number' && !isNaN(raw.confidence)) {
    confidence = raw.confidence;
  } else if (typeof raw.confidence === 'string') {
    confidence = parseFloat(raw.confidence);
    if (isNaN(confidence)) confidence = SAFE_DEFAULTS.confidence;
  } else {
    confidence = SAFE_DEFAULTS.confidence;
  }
  guarded.confidence = Math.round(Math.min(1, Math.max(0, confidence)) * 100) / 100;

  // 7. reason_codes: must be string array
  if (Array.isArray(raw.reason_codes)) {
    guarded.reason_codes = raw.reason_codes.filter(
      (rc: unknown) => typeof rc === 'string'
    );
  } else {
    guarded.reason_codes = SAFE_DEFAULTS.reason_codes;
  }

  // 8. Strip any extra fields (only allowed fields survive)
  const stripped = Object.keys(raw).filter((k) => !ALLOWED_FIELDS.has(k));
  if (stripped.length > 0) {
    logger.debug('Schema Guardian stripped extra fields', {
      fields: stripped,
    });
  }

  // 9. Re-run Safety Guard as final backstop
  const safetyResult = runSafetyGuard(guarded, {
    customer_reply: SAFE_DEFAULTS.customer_reply,
    recommended_next_action: SAFE_DEFAULTS.recommended_next_action,
    agent_summary: SAFE_DEFAULTS.agent_summary,
  });

  if (safetyResult.modified) {
    guarded.customer_reply = safetyResult.sanitizedFields.customer_reply;
    guarded.recommended_next_action = safetyResult.sanitizedFields.recommended_next_action;
    guarded.agent_summary = safetyResult.sanitizedFields.agent_summary;
    logger.warn('Schema Guardian safety backstop triggered', {
      violations: safetyResult.violations.length,
    });
  }

  return guarded as TicketResponse;
}
