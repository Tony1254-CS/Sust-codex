// src/types/index.ts
// Shared pipeline types. Flow: Request → SignalSet → MatchResult → Decision → Response.

import type { TransactionEntry } from '../validation/request-schema';
import type {
  EvidenceVerdict,
  CaseType,
  Severity,
  Department,
} from '../config/enums';

// ─── Signal Extractor Output ───────────────────────────────────────────

export interface SignalSet {
  /** Parsed numeric amounts from complaint (Western, Bangla, ৳) */
  amounts: number[];
  /** Raw time references found in complaint */
  timeRefs: TimeRef[];
  /** Transaction type keywords detected in complaint */
  typeHints: string[];
  /** Phone numbers, names, or role mentions in complaint */
  counterpartyMentions: string[];
  /** Status-related keywords (failed, completed, pending, deducted, not_received) */
  statusHints: string[];
  /** Intent labels derived from keyword matching */
  intents: string[];
  /** Detected language */
  language: string;
  /** Adversarial / injection flags */
  adversarialFlags: string[];
  /** Whether credential-related words appear in complaint */
  hasCredentialWords: boolean;
}

export interface TimeRef {
  type: 'relative' | 'absolute' | 'time_of_day';
  value: string;
  /** Estimated Date object, if parseable */
  estimatedDate?: Date;
}

// ─── Transaction Matcher Output ────────────────────────────────────────

export interface ScoreComponents {
  amountScore: number;
  typeScore: number;
  temporalScore: number;
  counterpartyScore: number;
  statusScore: number;
  recencyBoost: number;
}

export interface ScoredTransaction {
  transaction: TransactionEntry;
  txScore: number;
  components: ScoreComponents;
}

export type MatchState =
  | 'SINGLE_MATCH'
  | 'NO_MATCH'
  | 'AMBIGUOUS'
  | 'SPECIAL_NO_MATCH';

export interface MatchResult {
  state: MatchState;
  bestMatch: ScoredTransaction | null;
  secondMatch: ScoredTransaction | null;
  allScores: ScoredTransaction[];
}

// ─── Duplicate Detector Output ─────────────────────────────────────────

export interface DuplicatePair {
  first: TransactionEntry;
  second: TransactionEntry;
  timeDiffSeconds: number;
}

// ─── Full Decision (all deterministic fields) ──────────────────────────

export interface Decision {
  ticketId: string;
  relevantTransactionId: string | null;
  evidenceVerdict: EvidenceVerdict;
  caseType: CaseType;
  severity: Severity;
  department: Department;
  humanReviewRequired: boolean;
  confidence: number;
  reasonCodes: string[];

  // Context for prose generation (not in final response)
  matchResult: MatchResult;
  signalSet: SignalSet;
  duplicatePair: DuplicatePair | null;
  language: string;
  matchedTransaction: TransactionEntry | null;
}
