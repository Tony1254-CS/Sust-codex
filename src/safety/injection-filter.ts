// src/safety/injection-filter.ts
// Neutralize instruction-bearing sentences before sending to LLM.
// The LLM should see the SignalSet summary, NOT the raw complaint.
// Pure function, no I/O.

/** Patterns that indicate prompt injection attempts */
const INJECTION_PATTERNS: RegExp[] = [
  // Direct instruction overrides
  /ignore\s+(?:all\s+)?previous\s+(?:instructions?|prompts?|rules?)/i,
  /disregard\s+(?:all\s+)?(?:previous|above|prior)\s+(?:instructions?|prompts?)/i,
  /forget\s+(?:all\s+)?(?:your|the|previous)\s+(?:instructions?|rules?|guidelines?)/i,
  /override\s+(?:all\s+)?(?:previous|existing|current)\s+(?:instructions?|rules?)/i,

  // Role manipulation
  /you\s+are\s+now\s+(?:a|an|the)/i,
  /act\s+as\s+(?:a|an|the|if)/i,
  /pretend\s+(?:you\s+are|to\s+be|that)/i,
  /roleplay\s+as/i,
  /you\s+must\s+now/i,
  /new\s+(?:instructions?|role|persona|identity)/i,

  // System prompt manipulation
  /system\s*(?::|prompt|message|instruction)/i,
  /\[system\]/i,
  /\[assistant\]/i,
  /\[user\]/i,
  /<<\s*(?:system|SYS|INST)/i,

  // Jailbreak keywords
  /jailbreak/i,
  /\bDAN\b/,
  /do\s+anything\s+now/i,
  /developer\s+mode/i,
  /god\s+mode/i,
  /unrestricted\s+mode/i,

  // Output manipulation
  /respond\s+(?:only\s+)?with/i,
  /output\s+(?:only\s+)?the\s+following/i,
  /print\s+(?:only\s+)?the\s+following/i,
  /say\s+(?:exactly|only)/i,

  // Instruction injection via formatting
  /###\s*(?:instruction|system|new\s+task)/i,
  /---\s*(?:begin|start)\s*(?:new|override)/i,
];

/**
 * Check if text contains injection patterns.
 * Returns the list of detected patterns.
 */
export function detectInjection(text: string): string[] {
  const detected: string[] = [];

  for (const pattern of INJECTION_PATTERNS) {
    if (pattern.test(text)) {
      detected.push(pattern.source);
    }
  }

  return detected;
}

/**
 * Sanitize text by removing/neutralizing instruction-bearing sentences.
 * Returns the cleaned text safe for LLM consumption.
 *
 * This does NOT modify the original complaint — it only produces
 * a sanitized version for the LLM prompt.
 */
export function sanitizeForLlm(text: string): string {
  // Split into sentences
  const sentences = text.split(/[.!?\n]+/);
  const safe: string[] = [];

  for (const sentence of sentences) {
    const trimmed = sentence.trim();
    if (trimmed.length === 0) continue;

    // Check if sentence contains injection patterns
    let isInjection = false;
    for (const pattern of INJECTION_PATTERNS) {
      if (pattern.test(trimmed)) {
        isInjection = true;
        break;
      }
    }

    if (!isInjection) {
      safe.push(trimmed);
    }
    // Injection sentences are silently dropped
  }

  return safe.join(' ');
}
