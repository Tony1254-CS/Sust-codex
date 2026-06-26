// src/extractor/signal-extractor.ts
// Layer 1: Complaint → SignalSet.
// Extracts amounts, time refs, type hints, counterparty mentions,
// status hints, intents, language, and adversarial flags.
// Pure function, no I/O.

import type { SignalSet, TimeRef } from '../types';
import { parseAmounts, parsePhoneNumbers } from './numerals';
import { detectLanguage } from './lang-detect';
import {
  INTENT_KEYWORDS,
  TYPE_KEYWORDS,
  STATUS_KEYWORDS,
  COUNTERPARTY_ROLES,
  RELATION_WORDS,
  CREDENTIAL_WORDS,
  INJECTION_PATTERNS,
} from './banglish-keywords';

/**
 * Normalize text for keyword matching:
 * lowercase, collapse whitespace, remove excessive punctuation.
 */
function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Check if any keyword from the list appears in the normalized text.
 * Returns the matched keywords.
 */
function matchKeywords(text: string, keywords: string[]): string[] {
  const matched: string[] = [];
  for (const kw of keywords) {
    if (text.includes(kw.toLowerCase())) {
      matched.push(kw);
    }
  }
  return matched;
}

/**
 * Extract time references from complaint text.
 * Handles: "yesterday", "today", "morning", "last night",
 * ISO timestamps, relative expressions.
 */
function extractTimeRefs(text: string): TimeRef[] {
  const refs: TimeRef[] = [];
  const lower = normalize(text);
  const now = new Date();

  // Relative time references
  const relativePatterns: Array<{
    pattern: RegExp;
    label: string;
    offsetDays: number;
  }> = [
    { pattern: /yesterday|গতকাল|gotkal|gotokal/i, label: 'yesterday', offsetDays: -1 },
    { pattern: /today|আজ|আজকে|ajke|ajk/i, label: 'today', offsetDays: 0 },
    { pattern: /last night|গত রাতে|gotorat|gato rate/i, label: 'last_night', offsetDays: -1 },
    { pattern: /this morning|আজ সকালে|aj sokale/i, label: 'this_morning', offsetDays: 0 },
    { pattern: /last week|গত সপ্তাহে|goto soptahe/i, label: 'last_week', offsetDays: -7 },
    { pattern: /few days ago|কিছুদিন আগে|kichudin age/i, label: 'few_days_ago', offsetDays: -3 },
    { pattern: /just now|এইমাত্র|eimatro/i, label: 'just_now', offsetDays: 0 },
    { pattern: /few minutes ago|কিছুক্ষণ আগে/i, label: 'minutes_ago', offsetDays: 0 },
    { pattern: /an hour ago|এক ঘণ্টা আগে|ek ghonta age/i, label: 'hour_ago', offsetDays: 0 },
    { pattern: /(\d+)\s*(?:minutes?|mins?)\s*ago/i, label: 'n_minutes_ago', offsetDays: 0 },
    { pattern: /(\d+)\s*(?:hours?|hrs?)\s*ago/i, label: 'n_hours_ago', offsetDays: 0 },
  ];

  for (const { pattern, label, offsetDays } of relativePatterns) {
    if (pattern.test(lower)) {
      const estimated = new Date(now);
      estimated.setDate(estimated.getDate() + offsetDays);
      refs.push({
        type: 'relative',
        value: label,
        estimatedDate: estimated,
      });
    }
  }

  // Time-of-day references
  const todPatterns: Array<{ pattern: RegExp; label: string }> = [
    { pattern: /morning|সকাল|sokal/i, label: 'morning' },
    { pattern: /afternoon|দুপুর|dupur/i, label: 'afternoon' },
    { pattern: /evening|সন্ধ্যা|sondhya|bikale/i, label: 'evening' },
    { pattern: /night|রাত|rat/i, label: 'night' },
  ];

  for (const { pattern, label } of todPatterns) {
    if (pattern.test(lower)) {
      refs.push({ type: 'time_of_day', value: label });
    }
  }

  // ISO timestamp patterns
  const isoPattern = /\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}(?::\d{2})?(?:Z|[+-]\d{2}:?\d{2})?)?/g;
  let isoMatch: RegExpExecArray | null;
  while ((isoMatch = isoPattern.exec(text)) !== null) {
    const parsed = new Date(isoMatch[0]);
    if (!isNaN(parsed.getTime())) {
      refs.push({
        type: 'absolute',
        value: isoMatch[0],
        estimatedDate: parsed,
      });
    }
  }

  return refs;
}

/**
 * Extract counterparty mentions from complaint.
 * Includes phone numbers, role keywords, and relation words.
 */
function extractCounterpartyMentions(text: string): string[] {
  const mentions: string[] = [];
  const lower = normalize(text);

  // Phone numbers
  const phones = parsePhoneNumbers(text);
  mentions.push(...phones);

  // Role keywords (agent, merchant, biller)
  for (const [role, keywords] of Object.entries(COUNTERPARTY_ROLES)) {
    if (matchKeywords(lower, keywords).length > 0) {
      mentions.push(`role:${role}`);
    }
  }

  // Relation words (friend, brother, etc.)
  for (const word of RELATION_WORDS) {
    if (lower.includes(word.toLowerCase())) {
      mentions.push(`relation:${word}`);
      break; // one relation mention is enough
    }
  }

  return mentions;
}

/**
 * Extract all signals from a complaint text.
 */
export function extractSignals(
  complaint: string,
  providedLanguage?: string
): SignalSet {
  const lower = normalize(complaint);

  // 1. Parse amounts
  const amounts = parseAmounts(complaint);

  // 2. Extract time references
  const timeRefs = extractTimeRefs(complaint);

  // 3. Extract type hints
  const typeHints: string[] = [];
  for (const { type, keywords } of TYPE_KEYWORDS) {
    if (matchKeywords(lower, keywords).length > 0) {
      typeHints.push(type);
    }
  }

  // 4. Extract counterparty mentions
  const counterpartyMentions = extractCounterpartyMentions(complaint);

  // 5. Extract status hints
  const statusHints: string[] = [];
  for (const { status, keywords } of STATUS_KEYWORDS) {
    if (matchKeywords(lower, keywords).length > 0) {
      statusHints.push(status);
    }
  }

  // 6. Detect intents (case type signals)
  const intents: string[] = [];
  for (const { caseType, keywords } of INTENT_KEYWORDS) {
    if (matchKeywords(lower, keywords).length > 0) {
      intents.push(caseType);
    }
  }

  // 7. Detect language
  const language =
    providedLanguage && ['en', 'bn', 'mixed'].includes(providedLanguage)
      ? providedLanguage
      : detectLanguage(complaint);

  // 8. Detect adversarial flags
  const adversarialFlags: string[] = [];
  for (const pattern of INJECTION_PATTERNS) {
    if (lower.includes(pattern.toLowerCase())) {
      adversarialFlags.push(pattern);
    }
  }

  // 9. Check for credential words
  const hasCredentialWords = CREDENTIAL_WORDS.some((cw) =>
    lower.includes(cw.toLowerCase())
  );

  return {
    amounts,
    timeRefs,
    typeHints,
    counterpartyMentions,
    statusHints,
    intents,
    language,
    adversarialFlags,
    hasCredentialWords,
  };
}
