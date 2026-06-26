// src/validation/request-schema.ts
// Lenient input validator. Tolerates unknown enums, coerces numbers,
// normalizes missing tx sub-fields. Only rejects truly broken input.

import { z } from 'zod';

// --- Transaction object schema (lenient) ---
// Unknown enum values are tolerated (string passthrough).
// Missing sub-fields get safe defaults.
const transactionSchema = z
  .object({
    transaction_id: z.string().default(''),
    timestamp: z.string().default(''),
    type: z.enum(['transfer', 'payment', 'cash_in', 'cash_out', 'settlement']).catch('transfer'),
    amount: z.coerce.number().default(0),
    counterparty: z.string().default(''),
    status: z.enum(['pending', 'completed', 'failed', 'reversed']).catch('completed'),
  })
  .passthrough();

// --- Metadata schema (completely passthrough) ---
const metadataSchema = z.record(z.unknown()).optional();

// --- Main request schema ---
export const requestSchema = z.object({
  ticket_id: z
    .string({ required_error: 'ticket_id is required' })
    .min(1, 'ticket_id must be non-empty'),
  complaint: z.string({ required_error: 'complaint is required' }).max(2000),
  language: z.enum(['en', 'bn', 'mixed']).catch('en').optional(),
  channel: z.string().optional(),
  user_type: z.enum(['customer', 'merchant', 'agent']).catch('customer').optional(),
  campaign_context: z.string().optional(),
  transaction_history: z.array(transactionSchema).optional().default([]),
  metadata: metadataSchema,
});

// Inferred types
export type ValidatedRequest = z.infer<typeof requestSchema>;
export type TransactionEntry = z.infer<typeof transactionSchema>;

// --- Validation result types ---
export interface ValidationSuccess {
  success: true;
  data: ValidatedRequest;
}

export interface ValidationError {
  success: false;
  statusCode: 400 | 422;
  error: string;
}

export type ValidationResult = ValidationSuccess | ValidationError;

/**
 * Validates and coerces the raw request body.
 *
 * Returns:
 * - 400 for malformed/missing required fields
 * - 422 for empty/whitespace complaint
 * - Success with coerced data otherwise
 */
export function validateRequest(rawBody: unknown): ValidationResult {
  let body = rawBody;
  
  if (Buffer.isBuffer(body)) {
    body = body.toString('utf-8');
  }
  
  if (typeof body === 'string') {
    try {
      body = JSON.parse(body);
    } catch {
      return {
        success: false,
        statusCode: 400,
        error: 'invalid_request',
      };
    }
  }

  // Check if body is an object at all
  if (body === null || body === undefined || typeof body !== 'object') {
    return {
      success: false,
      statusCode: 400,
      error: 'invalid_request',
    };
  }

  const result = requestSchema.safeParse(body);

  if (!result.success) {
    // Determine if it's a missing required field vs other parse error
    const issues = result.error.issues;
    const hasMissingRequired = issues.some(
      (i) =>
        i.code === 'invalid_type' &&
        i.received === 'undefined' &&
        ['ticket_id', 'complaint'].includes(i.path[0] as string)
    );

    if (hasMissingRequired) {
      return {
        success: false,
        statusCode: 400,
        error: 'invalid_request',
      };
    }

    return {
      success: false,
      statusCode: 400,
      error: 'invalid_request',
    };
  }

  // 422: complaint is present but empty/whitespace-only
  const complaint = result.data.complaint.trim();
  if (complaint.length === 0) {
    return {
      success: false,
      statusCode: 422,
      error: 'empty_complaint',
    };
  }

  return {
    success: true,
    data: result.data,
  };
}
