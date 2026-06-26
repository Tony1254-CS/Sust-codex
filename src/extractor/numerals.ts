// src/extractor/numerals.ts
// Parse Bangla, Banglish, and Western digits, ৳ symbol, Indian grouping.
// Pure function, no I/O.

/** Bangla digit map: ০-৯ → 0-9 */
const BANGLA_DIGITS: Record<string, string> = {
  '০': '0', '১': '1', '২': '2', '৩': '3', '৪': '4',
  '৫': '5', '৬': '6', '৭': '7', '৮': '8', '৯': '9',
};

/** Banglish/English number word multipliers */
const WORD_MULTIPLIERS: Record<string, number> = {
  // English
  hundred: 100,
  thousand: 1000,
  lakh: 100000,
  lac: 100000,
  lakhs: 100000,
  crore: 10000000,
  million: 1000000,
  // Banglish / Romanized
  hazar: 1000,
  hajar: 1000,
  hazaar: 1000,
  shoto: 100,
  sho: 100,
  lakkho: 100000,
  koti: 10000000,
};

/** Bangla number words */
const BANGLA_WORD_MULTIPLIERS: Record<string, number> = {
  'শত': 100,
  'হাজার': 1000,
  'লক্ষ': 100000,
  'লাখ': 100000,
  'কোটি': 10000000,
};

/**
 * Convert a string containing Bangla digits to Western digits.
 */
function banglaToWestern(str: string): string {
  let result = '';
  for (const ch of str) {
    result += BANGLA_DIGITS[ch] ?? ch;
  }
  return result;
}

/**
 * Parse a numeric string that may contain commas (Indian grouping: 1,00,000)
 * or dots, and Bangla digits.
 */
function parseNumericToken(token: string): number | null {
  // Convert Bangla digits first
  let cleaned = banglaToWestern(token);

  // Remove ৳ / BDT / Tk / taka prefix/suffix
  cleaned = cleaned.replace(/[৳]/g, '').trim();

  // Remove commas (supports Indian grouping like 1,00,000)
  cleaned = cleaned.replace(/,/g, '');

  // Try parse
  const num = parseFloat(cleaned);
  if (isNaN(num) || num <= 0) return null;
  return num;
}

/**
 * Extract all amounts mentioned in text.
 * Handles: ৳5000, 5000৳, 5,000, ৫,০০০, "5 thousand", "5 hazar", BDT 500, Tk 500
 *
 * @returns Array of parsed positive numbers, deduplicated.
 */
export function parseAmounts(text: string): number[] {
  const amounts = new Set<number>();

  // --- Pattern 1: Currency symbol/prefix + number ---
  // Matches: ৳5000, ৳ 5000, BDT 5000, Tk 5000, Tk.5000, taka 5000
  const currencyPrefixPattern = /(?:৳|BDT|Tk\.?|taka)\s*([০-৯\d][০-৯\d,.\s]*)/gi;
  let match: RegExpExecArray | null;
  while ((match = currencyPrefixPattern.exec(text)) !== null) {
    const num = parseNumericToken(match[1].trim());
    if (num !== null) amounts.add(num);
  }

  // --- Pattern 2: Number + currency suffix ---
  // Matches: 5000৳, 5000 BDT, 5000 taka, 5000 টাকা
  const currencySuffixPattern = /([০-৯\d][০-৯\d,.\s]*)\s*(?:৳|BDT|Tk\.?|taka|টাকা)/gi;
  while ((match = currencySuffixPattern.exec(text)) !== null) {
    const num = parseNumericToken(match[1].trim());
    if (num !== null) amounts.add(num);
  }

  // --- Pattern 3: Number + word multiplier ---
  // Matches: "5 thousand", "10 hazar", "2 lakh"
  const wordMultiplierKeys = [
    ...Object.keys(WORD_MULTIPLIERS),
    ...Object.keys(BANGLA_WORD_MULTIPLIERS),
  ].join('|');
  const wordPattern = new RegExp(
    `([০-৯\\d][০-৯\\d,.]*)\\.?\\s*(?:${wordMultiplierKeys})`,
    'gi'
  );
  while ((match = wordPattern.exec(text)) !== null) {
    const base = parseNumericToken(match[1].trim());
    const wordRaw = match[0]
      .replace(/[০-৯\d,.\s]+/, '')
      .trim()
      .toLowerCase();
    const multiplier =
      WORD_MULTIPLIERS[wordRaw] ?? BANGLA_WORD_MULTIPLIERS[wordRaw] ?? 1;
    if (base !== null) amounts.add(base * multiplier);
  }

  // --- Pattern 4: Standalone numbers (≥3 digits, likely monetary) ---
  // Avoid matching dates, phone numbers etc. by requiring ≥ 3 digits
  // and not being adjacent to a long digit sequence (phone).
  const standalonePattern = /(?<!\d)([০-৯\d][০-৯\d,]*[০-৯\d])(?!\d)/g;
  while ((match = standalonePattern.exec(text)) !== null) {
    const raw = match[1];
    const num = parseNumericToken(raw);
    if (num !== null && num >= 10 && num <= 10000000) {
      // Avoid phone numbers: if the cleaned digit count is 10-11, skip
      const digitCount = banglaToWestern(raw).replace(/[^0-9]/g, '').length;
      if (digitCount >= 10) continue; // likely phone number
      amounts.add(num);
    }
  }

  // --- Pattern 5: Bangla standalone numbers ---
  const banglaStandalonePattern = /([০-৯][০-৯,]*[০-৯])/g;
  while ((match = banglaStandalonePattern.exec(text)) !== null) {
    const num = parseNumericToken(match[1]);
    if (num !== null && num >= 10 && num <= 10000000) {
      const digitCount = banglaToWestern(match[1]).replace(/[^0-9]/g, '').length;
      if (digitCount >= 10) continue;
      amounts.add(num);
    }
  }

  return Array.from(amounts);
}

/**
 * Extract phone-number-like sequences from text.
 * Bangla mobile: 01[3-9]XXXXXXXX (11 digits).
 * Also handles +880 prefix.
 */
export function parsePhoneNumbers(text: string): string[] {
  const phones = new Set<string>();

  // Normalize Bangla digits first
  const normalized = banglaToWestern(text);

  // Pattern: +880XXXXXXXXXX or 880XXXXXXXXXX → normalize to 0XXXXXXXXXXX
  const intlPattern = /\+?880[-\s]?(\d{10})/g;
  let match: RegExpExecArray | null;
  while ((match = intlPattern.exec(normalized)) !== null) {
    phones.add('0' + match[1]);
  }

  // Pattern: 01[3-9]XXXXXXXX (11 digits, BD mobile)
  const localPattern = /\b(01[3-9]\d{8})\b/g;
  while ((match = localPattern.exec(normalized)) !== null) {
    phones.add(match[1]);
  }

  return Array.from(phones);
}
