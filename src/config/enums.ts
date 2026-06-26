// src/config/enums.ts
// Canonical enum values — single source of truth.
// These MUST match the official problem statement exactly (case-sensitive).

// --- Request Enums (lenient — tolerate unknown values) ---

export const LANGUAGES = ['en', 'bn', 'mixed'] as const;
export type Language = (typeof LANGUAGES)[number];

export const TRANSACTION_TYPES = [
  'transfer',
  'payment',
  'cash_in',
  'cash_out',
  'settlement',
  'refund',
] as const;
export type TransactionType = (typeof TRANSACTION_TYPES)[number];

export const TRANSACTION_STATUSES = [
  'completed',
  'failed',
  'pending',
  'reversed',
] as const;
export type TransactionStatus = (typeof TRANSACTION_STATUSES)[number];

// --- Response Enums (strict — must use exact values) ---

export const EVIDENCE_VERDICTS = [
  'consistent',
  'inconsistent',
  'insufficient_data',
] as const;
export type EvidenceVerdict = (typeof EVIDENCE_VERDICTS)[number];

export const SEVERITIES = ['low', 'medium', 'high', 'critical'] as const;
export type Severity = (typeof SEVERITIES)[number];

export const CASE_TYPES = [
  'wrong_transfer',
  'payment_failed',
  'refund_request',
  'duplicate_payment',
  'merchant_settlement_delay',
  'agent_cash_in_issue',
  'phishing_or_social_engineering',
  'other',
] as const;
export type CaseType = (typeof CASE_TYPES)[number];

export const DEPARTMENTS = [
  'customer_support',
  'dispute_resolution',
  'payments_ops',
  'merchant_operations',
  'agent_operations',
  'fraud_risk',
] as const;
export type Department = (typeof DEPARTMENTS)[number];
