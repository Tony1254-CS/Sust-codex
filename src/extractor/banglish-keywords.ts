// src/extractor/banglish-keywords.ts
// EN / BN / Romanized Bangla keyword triplet tables.
// Used by signal-extractor and classifier for multilingual intent detection.
// Pure data module, no I/O.

// ─── Case Type Intent Keywords ─────────────────────────────────────────

export interface KeywordGroup {
  caseType: string;
  keywords: string[];
}

/**
 * Keywords that signal a particular case type.
 * Includes English, Bengali, and Romanized Bangla variants.
 * Order matters: matched top-to-bottom; first match wins for each group.
 */
export const INTENT_KEYWORDS: KeywordGroup[] = [
  {
    caseType: 'phishing_or_social_engineering',
    keywords: [
      // English
      'scam', 'fraud', 'phishing', 'hacked', 'hack', 'stolen', 'unauthorized',
      'someone called', 'tricked', 'social engineering', 'suspicious call',
      'fake', 'impersonat', 'pretend', 'stole', 'fraudulent',
      'gave otp', 'shared otp', 'gave pin', 'shared pin',
      'gave my otp', 'shared my otp', 'gave my pin', 'shared my pin',
      'they asked', 'asked for otp', 'asked for pin', 'asked for password',
      'called me', 'unknown call', 'threatened',
      // Bengali
      'প্রতারণা', 'জালিয়াতি', 'হ্যাক', 'চুরি', 'ফোন করেছে', 'অননুমোদিত',
      'ওটিপি দিয়ে', 'পিন দিয়ে', 'ঠকা', 'ঠগ', 'প্রতারক',
      // Romanized Bangla
      'pratarana', 'jaliati', 'thug', 'thagi', 'theka', 'chor',
      'otp diye', 'pin diye', 'otp diyechi', 'pin diyechi',
      'phone koreche', 'call koreche', 'bolse otp dite',
    ],
  },
  {
    caseType: 'duplicate_payment',
    keywords: [
      // English
      'duplicate', 'double charge', 'charged twice', 'paid twice',
      'double payment', 'two times', 'twice', 'double deduction',
      'double deducted', 'deducted twice', 'debited twice',
      // Bengali
      'ডাবল', 'দুইবার', 'ডুপ্লিকেট', 'দুইবার কেটেছে', 'দুবার',
      // Romanized
      'double', 'duibar', 'dubar', 'dui bar', 'duplicate payment',
      'double kata', 'double kete', 'double charge',
    ],
  },
  {
    caseType: 'agent_cash_in_issue',
    keywords: [
      // English
      'agent cash in', 'cash in', 'agent deposit', 'agent did not',
      'agent problem', 'cash-in', 'cashin', 'deposited but',
      'agent issue', 'agent missing', 'agent gave', 'agent took',
      // Bengali
      'এজেন্ট ক্যাশ ইন', 'ক্যাশ ইন', 'এজেন্ট', 'জমা হয়নি',
      'এজেন্ট সমস্যা', 'এজেন্ট থেকে',
      // Romanized
      'agent theke', 'agent e', 'cash in hoyni', 'cashin',
      'agent cash in', 'agent diyeche', 'agent joma',
    ],
  },
  {
    caseType: 'merchant_settlement_delay',
    keywords: [
      // English
      'settlement', 'merchant settlement', 'merchant payment',
      'not settled', 'settlement delay', 'pending settlement',
      'merchant not received', 'merchant account',
      // Bengali
      'সেটেলমেন্ট', 'মার্চেন্ট', 'বিলম্ব', 'সেটেল হয়নি',
      // Romanized
      'settlement hoyni', 'merchant settle', 'settle hoyni',
      'merchant payment', 'merchant er taka',
    ],
  },
  {
    caseType: 'payment_failed',
    keywords: [
      // English
      'failed', 'failure', 'unsuccessful', 'not completed', 'declined',
      'rejected', 'could not pay', 'payment error', 'transaction failed',
      'did not go through', 'not working', 'error',
      'deducted but', 'money deducted', 'balance deducted',
      'cut but', 'debited but', 'charged but',
      // Bengali
      'ব্যর্থ', 'ফেইল', 'হয়নি', 'কাজ করেনি', 'যায়নি',
      'কেটেছে কিন্তু', 'কেটে নিয়েছে', 'ব্যালান্স কমে গেছে',
      // Romanized
      'fail', 'fail hoyeche', 'hoini', 'hoyni', 'hoy nai',
      'kaj koreni', 'kaj kore nai', 'gese na',
      'kate niyeche', 'kete niyeche', 'kata gese', 'balance kome',
    ],
  },
  {
    caseType: 'wrong_transfer',
    keywords: [
      // English
      'wrong number', 'wrong person', 'wrong account', 'wrong recipient',
      'sent to wrong', 'transferred to wrong', 'incorrect number',
      'mistake', 'accidental', 'unintended', 'mistakenly',
      'wrong send', 'sent by mistake', 'wrong mobile',
      // Bengali
      'ভুল নম্বর', 'ভুল ব্যক্তি', 'ভুল একাউন্ট', 'ভুল', 'ভুলে',
      'ভুল নম্বরে পাঠিয়েছি', 'ভুল জায়গায়',
      // Romanized
      'bhul', 'vul', 'bhul number', 'vul number', 'galat',
      'bhul e pathiyechi', 'vul jaygay', 'bhul kore',
      'vul kore send', 'wrong e send', 'wrong jaygay',
    ],
  },
  {
    caseType: 'refund_request',
    keywords: [
      // English
      'refund', 'money back', 'give back', 'return my money',
      'reimburse', 'reimbursement', 'get back', 'want back',
      'return my', 'pay back', 'give my money',
      // Bengali
      'ফেরত', 'রিফান্ড', 'টাকা ফেরত', 'ফিরিয়ে দিন',
      'টাকা ফিরিয়ে', 'ফেরত চাই',
      // Romanized
      'ferat', 'ferot', 'refund chai', 'taka ferot',
      'taka ferat', 'money ferot', 'refund dite hobe',
      'refund korte hobe', 'taka fera',
    ],
  },
];

// ─── Transaction Type Keywords ─────────────────────────────────────────

export interface TypeKeyword {
  type: string;
  keywords: string[];
}

export const TYPE_KEYWORDS: TypeKeyword[] = [
  {
    type: 'transfer',
    keywords: [
      'send', 'sent', 'transfer', 'send money', 'money transfer',
      'পাঠিয়েছি', 'পাঠানো', 'ট্রান্সফার', 'সেন্ড',
      'pathiyechi', 'pathano', 'send korechi', 'transfer korechi',
    ],
  },
  {
    type: 'payment',
    keywords: [
      'pay', 'paid', 'payment', 'bill', 'purchase', 'buy', 'bought',
      'পেমেন্ট', 'বিল', 'কিনেছি', 'পেমেন্ট করেছি',
      'payment korechi', 'bill diyechi', 'pay korechi',
    ],
  },
  {
    type: 'cash_in',
    keywords: [
      'cash in', 'cashin', 'cash-in', 'deposit',
      'ক্যাশ ইন', 'জমা',
      'cash in korechi', 'joma korechi',
    ],
  },
  {
    type: 'cash_out',
    keywords: [
      'cash out', 'cashout', 'cash-out', 'withdraw', 'withdrawal',
      'ক্যাশ আউট', 'তোলা', 'উত্তোলন',
      'cash out korechi', 'tola', 'tulechi',
    ],
  },
  {
    type: 'settlement',
    keywords: [
      'settle', 'settlement',
      'সেটেল', 'সেটেলমেন্ট',
      'settle', 'settlement',
    ],
  },
  {
    type: 'refund',
    keywords: [
      'refund', 'refunded',
      'রিফান্ড', 'ফেরত',
      'refund', 'ferat',
    ],
  },
];

// ─── Status Keywords ───────────────────────────────────────────────────

export interface StatusKeyword {
  status: string;
  keywords: string[];
}

export const STATUS_KEYWORDS: StatusKeyword[] = [
  {
    status: 'failed',
    keywords: [
      'failed', 'failure', 'unsuccessful', 'declined', 'rejected', 'error',
      'ব্যর্থ', 'ফেইল',
      'fail', 'fail hoyeche',
    ],
  },
  {
    status: 'pending',
    keywords: [
      'pending', 'processing', 'in progress', 'waiting',
      'পেন্ডিং', 'চলছে',
      'pending', 'cholche',
    ],
  },
  {
    status: 'completed',
    keywords: [
      'completed', 'done', 'successful', 'success', 'went through',
      'সফল', 'হয়েছে', 'সম্পন্ন',
      'hoyeche', 'somporno', 'complete hoyeche',
    ],
  },
  {
    status: 'reversed',
    keywords: [
      'reversed', 'returned', 'cancelled', 'canceled',
      'রিভার্স', 'ফেরত',
      'reverse', 'cancel',
    ],
  },
  {
    // Special: money deducted/cut but not received (implies complaint about deduction)
    status: 'deducted',
    keywords: [
      'deducted', 'deduction', 'cut', 'debited', 'charged', 'balance reduced',
      'কেটেছে', 'কেটে নিয়েছে', 'কমে গেছে', 'ব্যালেন্স কমে',
      'kata', 'kete niyeche', 'kate geche', 'balance kome geche',
    ],
  },
  {
    // Special: payment/transfer didn't reach recipient
    status: 'not_received',
    keywords: [
      'not received', 'did not receive', 'didn\'t receive', 'haven\'t received',
      'not gotten', 'didn\'t get', 'did not get', 'haven\'t got',
      'missing', 'never received', 'not arrived',
      'পাইনি', 'পায়নি', 'আসেনি',
      'paini', 'payni', 'painai', 'aseni', 'pai nai',
    ],
  },
];

// ─── Counterparty Role Keywords ────────────────────────────────────────

export const COUNTERPARTY_ROLES: Record<string, string[]> = {
  agent: [
    'agent', 'এজেন্ট', 'agent er', 'agent theke',
  ],
  merchant: [
    'merchant', 'shop', 'store', 'seller', 'vendor', 'dukan',
    'মার্চেন্ট', 'দোকান', 'দোকানদার',
    'dokan', 'dokandar', 'merchant er',
  ],
  biller: [
    'biller', 'bill', 'utility', 'electricity', 'gas', 'water',
    'বিল', 'বিলার',
  ],
};

// ─── Relation Words (for counterparty context) ─────────────────────────

export const RELATION_WORDS = [
  'friend', 'brother', 'sister', 'mother', 'father', 'relative',
  'family', 'wife', 'husband', 'uncle', 'aunt', 'cousin',
  'বন্ধু', 'ভাই', 'বোন', 'মা', 'বাবা', 'আত্মীয়',
  'bondhu', 'bhai', 'bon', 'ma', 'baba', 'attio',
];

// ─── Credential Words (for phishing detection + safety) ────────────────

export const CREDENTIAL_WORDS = [
  'otp', 'pin', 'password', 'passwd', 'passcode',
  'cvv', 'cvc', 'card number', 'security code',
  'verification code', 'one-time', 'one time code',
  'ওটিপি', 'পিন', 'পাসওয়ার্ড',
];

// ─── Adversarial / Injection Patterns ──────────────────────────────────

export const INJECTION_PATTERNS = [
  'ignore previous',
  'ignore all previous',
  'disregard previous',
  'forget your instructions',
  'you are now',
  'new instructions',
  'system:',
  'system prompt',
  'override',
  'jailbreak',
  'DAN',
  'do anything now',
  'act as',
  'pretend you are',
];
