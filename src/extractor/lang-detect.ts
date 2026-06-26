// src/extractor/lang-detect.ts
// Classify language as en | bn | mixed by Unicode script ratio.
// Pure function, no I/O.

/**
 * Bangla Unicode range: U+0980–U+09FF (Bengali script).
 */
const BANGLA_RANGE = /[\u0980-\u09FF]/g;
const LATIN_RANGE = /[a-zA-Z]/g;

/**
 * Detect the language of the text based on script distribution.
 *
 * - 'bn' — Primarily Bengali script (>60% of script chars are Bangla)
 * - 'en' — Primarily Latin script (>60% of script chars are Latin)
 * - 'mixed' — Significant presence of both, or Banglish (Latin script with Bangla keywords)
 *
 * @param text - The input text to classify
 * @returns 'en' | 'bn' | 'mixed'
 */
export function detectLanguage(text: string): 'en' | 'bn' | 'mixed' {
  const banglaChars = (text.match(BANGLA_RANGE) || []).length;
  const latinChars = (text.match(LATIN_RANGE) || []).length;
  const total = banglaChars + latinChars;

  if (total === 0) return 'en'; // No script chars (numbers/symbols only) → default English

  const banglaRatio = banglaChars / total;

  if (banglaRatio > 0.6) return 'bn';
  if (banglaRatio < 0.1) return 'en';
  return 'mixed';
}
