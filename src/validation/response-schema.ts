// src/validation/response-schema.ts
// Strict output validator. Enforces exact enum values and required fields.
// Used by Schema Guardian for terminal validation.

import { z } from 'zod';
import {
  EVIDENCE_VERDICTS,
  SEVERITIES,
  CASE_TYPES,
  DEPARTMENTS,
} from '../config/enums';

export const responseSchema = z.object({
  ticket_id: z.string(),
  relevant_transaction_id: z.string().nullable(),
  evidence_verdict: z.enum(EVIDENCE_VERDICTS),
  case_type: z.enum(CASE_TYPES),
  severity: z.enum(SEVERITIES),
  department: z.enum(DEPARTMENTS),
  agent_summary: z.string(),
  recommended_next_action: z.string(),
  customer_reply: z.string(),
  human_review_required: z.boolean(),
  confidence: z.number().min(0).max(1),
  reason_codes: z.array(z.string()),
});

export type TicketResponse = z.infer<typeof responseSchema>;

/**
 * Validates a response object against the strict output schema.
 * Returns the validated object or null if validation fails.
 */
export function validateResponse(
  data: unknown
): { valid: true; data: TicketResponse } | { valid: false; errors: string[] } {
  const result = responseSchema.safeParse(data);
  if (result.success) {
    return { valid: true, data: result.data };
  }
  return {
    valid: false,
    errors: result.error.issues.map(
      (i) => `${i.path.join('.')}: ${i.message}`
    ),
  };
}
