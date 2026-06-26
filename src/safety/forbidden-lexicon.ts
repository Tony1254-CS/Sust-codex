// src/safety/forbidden-lexicon.ts
// Semantic pattern sets for detecting unsafe content.
// Rule families use synonym sets + semantics, NOT literal words.
// Pure data + pure matching functions, no I/O.

// ─── Credential Request Detection ──────────────────────────────────────
// Pattern: verb-of-request NEAR credential-term
// Exception: prohibition sentence (do not, never, don't, please avoid, etc.)

/** Verbs that imply requesting/asking for something */
const REQUEST_VERBS = [
  'share', 'provide', 'send', 'enter', 'give', 'tell', 'type',
  'type in', 'input', 'submit', 'disclose', 'reveal', 'hand over',
  'pass', 'confirm your', 'verify your', 'validate your',
  'need your', 'require your', 'asking for your',
];

/** Credential/sensitive terms */
const CREDENTIAL_TERMS = [
  'pin', 'otp', 'password', 'passcode', 'passwd',
  'one-time code', 'one time code', 'verification code',
  'security code', 'code from sms', 'sms code',
  'cvv', 'cvc', 'card number', 'full card',
  '3 digit', 'three digit', 'expiry', 'expiration',
  'secret', 'secret code', 'secret key',
  'পিন', 'ওটিপি', 'পাসওয়ার্ড', 'গোপন',
];

/** Phrases that indicate a prohibition (safe context) */
const PROHIBITION_PHRASES = [
  'do not', 'don\'t', 'dont', 'never', 'please avoid',
  'refrain from', 'keep', 'private', 'never disclose',
  'never share', 'do not share', 'don\'t share',
  'please do not', 'should not', 'shouldn\'t',
  'must not', 'mustn\'t', 'avoid sharing',
  'never give', 'do not give', 'don\'t give',
  'করবেন না', 'শেয়ার করবেন না', 'দেবেন না',
];

// ─── Refund Promise Detection ──────────────────────────────────────────
// Pattern: future-tense restoration of money
// Exception: contains sanctioned phrase (any eligible amount, if eligible, through official channels)

/** Phrases that promise refund/reversal/recovery */
const REFUND_PROMISE_PATTERNS = [
  'will refund', 'will be refunded', 'have refunded',
  'will reverse', 'will be reversed', 'have reversed',
  'will unblock', 'will be unblocked',
  'will recover', 'will be recovered',
  'funds will be restored', 'money will be restored',
  'money\'s on its way back', 'money is on its way',
  'expect the reversal', 'reversal is being processed',
  'your account will be credited', 'we will credit',
  'you will receive your money', 'money will be returned',
  'we will return', 'we are returning',
  'refund has been initiated', 'refund is being processed',
  'we have processed your refund', 'your refund is confirmed',
  'guaranteed refund', 'guaranteed reversal',
  'ফেরত দেওয়া হবে', 'রিফান্ড করা হবে', 'টাকা ফেরত দেব',
];

/** Sanctioned phrases that make refund language acceptable */
const REFUND_SANCTIONED_PHRASES = [
  'any eligible amount',
  'if eligible',
  'through official channels',
  'after review',
  'upon verification',
  'subject to review',
  'subject to verification',
  'may be eligible',
];

// ─── Third-Party Routing Detection ─────────────────────────────────────
// Pattern: phone number in text, or "contact <name>" where name is unofficial

/** Official channels (allowed references) */
const OFFICIAL_CHANNELS = new Set([
  'bkash', 'bkash app', 'official app', 'official website',
  'customer support', 'support center', 'help center',
  'official channels', 'our support team', 'our team',
  'support team', 'helpline', 'official helpline',
]);

/** Pattern for "contact" followed by a potentially unsafe name */
const CONTACT_DIRECTIVES = [
  'contact', 'call', 'reach out to', 'get in touch with',
  'speak to', 'speak with', 'talk to', 'message',
  'whatsapp', 'telegram', 'viber',
];

// ─── Secret Leak Detection ─────────────────────────────────────────────
// API keys, tokens, JWT shapes

const SECRET_PATTERNS: RegExp[] = [
  /sk-[a-zA-Z0-9]{20,}/,           // OpenAI-style API keys
  /Bearer\s+[a-zA-Z0-9._-]{20,}/,  // Bearer tokens
  /AIza[a-zA-Z0-9_-]{30,}/,        // Google API keys
  /[a-fA-F0-9]{32,}/,              // Long hex strings (API keys, hashes)
  /eyJ[a-zA-Z0-9_-]+\.eyJ[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+/, // JWT
];

// ─── Phone Number Pattern ──────────────────────────────────────────────

const PHONE_PATTERN = /(?<![a-zA-Z0-9$৳£€,-])(?:\+?\d{1,3}[-.\s]?)?\(?\d{3,4}\)?[-.\s]?\d{3,4}[-.\s]?\d{3,4}(?![a-zA-Z0-9,-])/g;

// ─── Detection Functions ───────────────────────────────────────────────

export interface SafetyViolation {
  type: 'credential_request' | 'refund_promise' | 'third_party_routing' | 'secret_leak';
  detail: string;
  field: string;
}

/**
 * Check if text contains a credential request (not a prohibition).
 */
function detectCredentialRequest(text: string, fieldName: string): SafetyViolation | null {
  const lower = text.toLowerCase();

  // First check if there's a prohibition context
  const hasProhibition = PROHIBITION_PHRASES.some((p) => lower.includes(p));

  // Look for request verb + credential term proximity
  for (const verb of REQUEST_VERBS) {
    if (!lower.includes(verb)) continue;

    for (const term of CREDENTIAL_TERMS) {
      if (!lower.includes(term)) continue;

      // Found both verb and credential term — check context
      // If the sentence containing both also has a prohibition → safe
      const sentences = text.split(/[.!?\n]+/);
      for (const sentence of sentences) {
        const sentLower = sentence.toLowerCase();
        if (sentLower.includes(verb) && sentLower.includes(term)) {
          // Check if this sentence has a prohibition
          const sentHasProhibition = PROHIBITION_PHRASES.some((p) =>
            sentLower.includes(p)
          );
          if (!sentHasProhibition) {
            return {
              type: 'credential_request',
              detail: `Request verb "${verb}" near credential term "${term}" without prohibition`,
              field: fieldName,
            };
          }
        }
      }
    }
  }

  // Direct credential request patterns (even without verb proximity)
  const directPatterns = [
    /what\s+is\s+your\s+(?:pin|otp|password|passcode)/i,
    /enter\s+(?:your\s+)?(?:pin|otp|password|passcode)/i,
    /type\s+(?:your\s+)?(?:pin|otp|password|passcode)/i,
    /(?:pin|otp|password)\s+(?:number|code)?\s*(?:\?|please)/i,
  ];

  for (const pattern of directPatterns) {
    if (pattern.test(text) && !hasProhibition) {
      return {
        type: 'credential_request',
        detail: 'Direct credential request pattern detected',
        field: fieldName,
      };
    }
  }

  return null;
}

/**
 * Check if text contains an unauthorized refund promise.
 */
function detectRefundPromise(text: string, fieldName: string): SafetyViolation | null {
  const lower = text.toLowerCase();

  // Check for sanctioned phrases first
  const hasSanctioned = REFUND_SANCTIONED_PHRASES.some((p) => lower.includes(p));

  for (const pattern of REFUND_PROMISE_PATTERNS) {
    if (lower.includes(pattern)) {
      // If sanctioned phrase is present in the same text → safe
      if (hasSanctioned) continue;

      return {
        type: 'refund_promise',
        detail: `Unauthorized refund promise: "${pattern}"`,
        field: fieldName,
      };
    }
  }

  return null;
}

/**
 * Check if text routes user to third parties or unofficial channels.
 */
function detectThirdPartyRouting(text: string, fieldName: string): SafetyViolation | null {
  const lower = text.toLowerCase();

  // Check for phone numbers in the text
  const phoneMatches = text.match(PHONE_PATTERN);
  if (phoneMatches) {
    for (const phone of phoneMatches) {
      // Filter out very short number sequences that aren't phones
      const digits = phone.replace(/[^0-9]/g, '');
      if (digits.length >= 7) {
        return {
          type: 'third_party_routing',
          detail: `Phone number detected in response: "${phone}"`,
          field: fieldName,
        };
      }
    }
  }

  // Check for "contact <unofficial entity>" patterns
  for (const directive of CONTACT_DIRECTIVES) {
    // Ensure word boundaries so "contacting" doesn't match "contact"
    const regex = new RegExp(`\\b${directive}\\b`, 'i');
    const match = text.match(regex);
    if (!match) continue;
    
    const idx = match.index!;
    // Get the entity after the directive
    const after = text.substring(idx + match[0].length).trim();
    const entityEnd = after.search(/[.,;!?\n]/);
    const entity = entityEnd > 0 ? after.substring(0, entityEnd).trim().toLowerCase() : after.substring(0, 50).trim().toLowerCase();

    if (entity.length === 0) continue;

    // Check if it's an official channel
    const isOfficial = Array.from(OFFICIAL_CHANNELS).some(
      (ch) => entity.includes(ch) || ch.includes(entity)
    );

    if (!isOfficial && entity.length > 2) {
      // Allow "contact us", "contact our team", etc.
      const safeEntities = ['us', 'our', 'the', 'your', 'them', 'a', 'an'];
      const firstWord = entity.split(/\s+/)[0];
      if (safeEntities.includes(firstWord)) continue;

      return {
        type: 'third_party_routing',
        detail: `Directive to contact unofficial entity: "${directive} ${entity}"`,
        field: fieldName,
      };
    }
  }

  return null;
}

/**
 * Check if text contains leaked secrets.
 */
function detectSecretLeak(text: string, fieldName: string): SafetyViolation | null {
  for (const pattern of SECRET_PATTERNS) {
    if (pattern.test(text)) {
      return {
        type: 'secret_leak',
        detail: 'Potential secret/token detected in response',
        field: fieldName,
      };
    }
  }
  return null;
}

/**
 * Scan a text field for ALL safety violations.
 *
 * @param text - The text to scan
 * @param fieldName - Name of the field (for violation reporting)
 * @returns Array of violations found
 */
export function scanForViolations(
  text: string,
  fieldName: string
): SafetyViolation[] {
  const violations: SafetyViolation[] = [];

  const credential = detectCredentialRequest(text, fieldName);
  if (credential) violations.push(credential);

  const refund = detectRefundPromise(text, fieldName);
  if (refund) violations.push(refund);

  const thirdParty = detectThirdPartyRouting(text, fieldName);
  if (thirdParty) violations.push(thirdParty);

  const secret = detectSecretLeak(text, fieldName);
  if (secret) violations.push(secret);

  return violations;
}
