// src/composer/text-templates.ts
// Layer 3: Safe deterministic prose per case_type × verdict × language.
// These templates are Barrier A — pre-verified sanctioned phrasing only.
// Pure function, no I/O.

import type { Decision } from '../types';
import type { CaseType, EvidenceVerdict } from '../config/enums';

export interface ProseFields {
  agentSummary: string;
  recommendedNextAction: string;
  customerReply: string;
}

/**
 * Generate deterministic prose for the three text fields.
 * Uses sanctioned phrasing only — no credential requests, no refund promises,
 * no third-party routing.
 */
export function generateProse(decision: Decision): ProseFields {
  const lang = decision.language;
  const isBangla = lang === 'bn';

  const templates = getTemplates(decision.caseType, decision.evidenceVerdict, decision);

  return {
    agentSummary: templates.agentSummary,
    recommendedNextAction: templates.recommendedNextAction,
    customerReply: isBangla
      ? templates.customerReplyBn ?? templates.customerReply
      : templates.customerReply,
  };
}

interface TemplateSet {
  agentSummary: string;
  recommendedNextAction: string;
  customerReply: string;
  customerReplyBn?: string;
}

function getTemplates(
  caseType: CaseType,
  verdict: EvidenceVerdict,
  decision: Decision
): TemplateSet {
  const txId = decision.relevantTransactionId ?? 'N/A';
  const amount = decision.matchedTransaction?.amount
    ? `BDT ${decision.matchedTransaction.amount}`
    : 'the mentioned amount';
  const counterparty = decision.matchedTransaction?.counterparty ?? 'the mentioned recipient';

  switch (caseType) {
    // ─── Wrong Transfer ──────────────────────────────────────────
    case 'wrong_transfer':
      if (verdict === 'consistent') {
        return {
          agentSummary: `Customer reports sending money to the wrong recipient. Transaction ${txId} for ${amount} to ${counterparty} has been identified. The complaint is supported by transaction evidence.`,
          recommendedNextAction: `Verify the transaction details for ${txId}. Initiate the wrong transfer dispute resolution process. Contact the recipient if needed through official channels.`,
          customerReply: `Thank you for reporting this issue. We have identified the transaction in question and your complaint has been forwarded to our dispute resolution team. They will review your case and contact you through official channels. Please do not share your PIN, OTP, or password with anyone.`,
          customerReplyBn: `আপনার অভিযোগ জানানোর জন্য ধন্যবাদ। আমরা সংশ্লিষ্ট লেনদেনটি চিহ্নিত করেছি এবং আপনার অভিযোগটি আমাদের বিরোধ নিষ্পত্তি দলের কাছে পাঠানো হয়েছে। তারা আপনার কেসটি পর্যালোচনা করবে এবং অফিসিয়াল চ্যানেলের মাধ্যমে আপনার সাথে যোগাযোগ করবে। অনুগ্রহ করে আপনার পিন, ওটিপি বা পাসওয়ার্ড কারো সাথে শেয়ার করবেন না।`,
        };
      }
      if (verdict === 'inconsistent') {
        return {
          agentSummary: `Customer reports a wrong transfer, but evidence shows inconsistencies. Transaction ${txId} to ${counterparty} shows prior transfer history to this recipient, suggesting an established relationship.`,
          recommendedNextAction: `Review the transaction history carefully. The recipient appears to be a previously used contact. Verify with the customer and escalate to dispute resolution if needed.`,
          customerReply: `Thank you for reaching out. We are reviewing your transaction details. Our team will investigate this matter and get back to you through official channels. Please do not share your PIN, OTP, or password with anyone.`,
          customerReplyBn: `যোগাযোগ করার জন্য ধন্যবাদ। আমরা আপনার লেনদেনের বিবরণ পর্যালোচনা করছি। আমাদের দল এই বিষয়টি তদন্ত করবে এবং অফিসিয়াল চ্যানেলের মাধ্যমে আপনার সাথে যোগাযোগ করবে। অনুগ্রহ করে আপনার পিন, ওটিপি বা পাসওয়ার্ড কারো সাথে শেয়ার করবেন না।`,
        };
      }
      return insufficientTemplate(caseType, decision);

    // ─── Payment Failed ──────────────────────────────────────────
    case 'payment_failed':
      if (verdict === 'consistent') {
        return {
          agentSummary: `Customer reports a failed payment. Transaction ${txId} for ${amount} has been identified as ${decision.matchedTransaction?.status ?? 'problematic'}. The complaint is consistent with transaction records.`,
          recommendedNextAction: `Check the payment status for ${txId}. If the amount was deducted but the payment did not complete, initiate a reversal or escalate to payments operations.`,
          customerReply: `Thank you for reporting this issue. We have identified the transaction and our payments team is reviewing it. Any eligible amount will be returned through official channels after review. Please do not share your PIN, OTP, or password with anyone.`,
          customerReplyBn: `এই সমস্যা জানানোর জন্য ধন্যবাদ। আমরা লেনদেনটি চিহ্নিত করেছি এবং আমাদের পেমেন্ট দল এটি পর্যালোচনা করছে। পর্যালোচনার পর যোগ্য পরিমাণ অফিসিয়াল চ্যানেলের মাধ্যমে ফেরত দেওয়া হবে। অনুগ্রহ করে আপনার পিন, ওটিপি বা পাসওয়ার্ড কারো সাথে শেয়ার করবেন না।`,
        };
      }
      if (verdict === 'inconsistent') {
        return {
          agentSummary: `Customer reports a failed payment, but transaction ${txId} shows a status that does not align with the complaint. Further investigation is needed.`,
          recommendedNextAction: `Verify the actual transaction status for ${txId}. Compare with the customer's description and resolve the discrepancy.`,
          customerReply: `Thank you for contacting us. We are reviewing your transaction and will provide an update through official channels. Please do not share your PIN, OTP, or password with anyone.`,
          customerReplyBn: `যোগাযোগ করার জন্য ধন্যবাদ। আমরা আপনার লেনদেন পর্যালোচনা করছি এবং অফিসিয়াল চ্যানেলের মাধ্যমে আপডেট প্রদান করব। অনুগ্রহ করে আপনার পিন, ওটিপি বা পাসওয়ার্ড কারো সাথে শেয়ার করবেন না।`,
        };
      }
      return insufficientTemplate(caseType, decision);

    // ─── Refund Request ──────────────────────────────────────────
    case 'refund_request':
      if (verdict === 'consistent') {
        return {
          agentSummary: `Customer is requesting a refund for transaction ${txId} (${amount}). The transaction has been identified and the request appears straightforward.`,
          recommendedNextAction: `Review the refund eligibility for transaction ${txId}. Process through standard refund workflow if eligible.`,
          customerReply: `Thank you for your refund request. We have noted your concern regarding the transaction. Any eligible amount will be returned through official channels after review. Please do not share your PIN, OTP, or password with anyone.`,
          customerReplyBn: `আপনার রিফান্ড অনুরোধের জন্য ধন্যবাদ। আমরা লেনদেন সম্পর্কে আপনার উদ্বেগ নোট করেছি। পর্যালোচনার পর যোগ্য পরিমাণ অফিসিয়াল চ্যানেলের মাধ্যমে ফেরত দেওয়া হবে। অনুগ্রহ করে আপনার পিন, ওটিপি বা পাসওয়ার্ড কারো সাথে শেয়ার করবেন না।`,
        };
      }
      if (verdict === 'inconsistent') {
        return {
          agentSummary: `Customer requests a refund but the evidence is inconsistent with the complaint. Transaction ${txId} details do not fully align with the customer's description.`,
          recommendedNextAction: `Escalate to dispute resolution. Verify the refund claim against the actual transaction details for ${txId}.`,
          customerReply: `Thank you for your request. We are reviewing the transaction details and will get back to you through official channels. Please do not share your PIN, OTP, or password with anyone.`,
          customerReplyBn: `আপনার অনুরোধের জন্য ধন্যবাদ। আমরা লেনদেনের বিবরণ পর্যালোচনা করছি এবং অফিসিয়াল চ্যানেলের মাধ্যমে আপনার সাথে যোগাযোগ করব। অনুগ্রহ করে আপনার পিন, ওটিপি বা পাসওয়ার্ড কারো সাথে শেয়ার করবেন না।`,
        };
      }
      return insufficientTemplate(caseType, decision);

    // ─── Duplicate Payment ───────────────────────────────────────
    case 'duplicate_payment':
      if (verdict === 'consistent') {
        return {
          agentSummary: `Customer reports a duplicate payment. A matching pair of transactions has been identified — same amount, same recipient, within a short time window. Transaction ${txId} appears to be the duplicate.`,
          recommendedNextAction: `Verify both transactions in the duplicate pair. Initiate reversal of the duplicate transaction ${txId} if confirmed. Process through payments operations.`,
          customerReply: `Thank you for reporting this. We have identified what appears to be a duplicate transaction and our payments team is reviewing it. Any eligible amount will be returned through official channels after review. Please do not share your PIN, OTP, or password with anyone.`,
          customerReplyBn: `জানানোর জন্য ধন্যবাদ। আমরা একটি ডুপ্লিকেট লেনদেন চিহ্নিত করেছি এবং আমাদের পেমেন্ট দল এটি পর্যালোচনা করছে। পর্যালোচনার পর যোগ্য পরিমাণ অফিসিয়াল চ্যানেলের মাধ্যমে ফেরত দেওয়া হবে। অনুগ্রহ করে আপনার পিন, ওটিপি বা পাসওয়ার্ড কারো সাথে শেয়ার করবেন না।`,
        };
      }
      return insufficientTemplate(caseType, decision);

    // ─── Merchant Settlement Delay ───────────────────────────────
    case 'merchant_settlement_delay':
      if (verdict === 'consistent') {
        return {
          agentSummary: `Merchant reports a settlement delay. Transaction ${txId} for ${amount} has been identified. The settlement appears to be pending or delayed.`,
          recommendedNextAction: `Check the settlement status for ${txId} in the merchant operations system. Expedite if the delay exceeds the standard settlement window.`,
          customerReply: `Thank you for reaching out about your settlement. We have noted your concern and our merchant operations team is looking into it. You will be updated through official channels. Please do not share your PIN, OTP, or password with anyone.`,
          customerReplyBn: `আপনার সেটেলমেন্ট সম্পর্কে যোগাযোগ করার জন্য ধন্যবাদ। আমরা আপনার উদ্বেগ নোট করেছি এবং আমাদের মার্চেন্ট অপারেশন দল এটি দেখছে। অফিসিয়াল চ্যানেলের মাধ্যমে আপনাকে আপডেট করা হবে। অনুগ্রহ করে আপনার পিন, ওটিপি বা পাসওয়ার্ড কারো সাথে শেয়ার করবেন না।`,
        };
      }
      return insufficientTemplate(caseType, decision);

    // ─── Agent Cash-In Issue ─────────────────────────────────────
    case 'agent_cash_in_issue':
      if (verdict === 'consistent') {
        return {
          agentSummary: `Customer reports an issue with agent cash-in. Transaction ${txId} for ${amount} has been identified with status '${decision.matchedTransaction?.status ?? 'unknown'}'. The complaint is supported by evidence.`,
          recommendedNextAction: `Verify the cash-in status for ${txId} with the agent. If the amount was collected but not credited, escalate to agent operations for resolution.`,
          customerReply: `Thank you for reporting this issue. We have identified the transaction and our agent operations team is reviewing it. Any eligible amount will be returned through official channels after review. Please do not share your PIN, OTP, or password with anyone.`,
          customerReplyBn: `এই সমস্যা জানানোর জন্য ধন্যবাদ। আমরা লেনদেনটি চিহ্নিত করেছি এবং আমাদের এজেন্ট অপারেশন দল এটি পর্যালোচনা করছে। পর্যালোচনার পর যোগ্য পরিমাণ অফিসিয়াল চ্যানেলের মাধ্যমে ফেরত দেওয়া হবে। অনুগ্রহ করে আপনার পিন, ওটিপি বা পাসওয়ার্ড কারো সাথে শেয়ার করবেন না।`,
        };
      }
      return insufficientTemplate(caseType, decision);

    // ─── Phishing / Social Engineering ───────────────────────────
    case 'phishing_or_social_engineering':
      return {
        agentSummary: `URGENT: Customer reports potential phishing or social engineering attack. ${decision.signalSet.hasCredentialWords ? 'Credential-related keywords detected in the complaint.' : 'Suspicious activity indicators present.'} This case requires immediate fraud risk review.`,
        recommendedNextAction: `Immediately escalate to the fraud risk team. Check for unauthorized transactions on the account. Advise the customer on security measures through official channels.`,
        customerReply: `Thank you for reporting this. Your account security is our top priority. Please do not share your PIN, OTP, or password with anyone, including anyone claiming to be from our company. Our fraud risk team will review your case and contact you through official channels only. If you suspect unauthorized access, please change your PIN immediately through the official app.`,
        customerReplyBn: `জানানোর জন্য ধন্যবাদ। আপনার অ্যাকাউন্টের নিরাপত্তা আমাদের সর্বোচ্চ অগ্রাধিকার। অনুগ্রহ করে আপনার পিন, ওটিপি বা পাসওয়ার্ড কারো সাথে শেয়ার করবেন না, এমনকি যারা আমাদের কোম্পানির পক্ষ থেকে দাবি করে তাদের সাথেও নয়। আমাদের জালিয়াতি ঝুঁকি দল আপনার কেসটি পর্যালোচনা করবে এবং শুধুমাত্র অফিসিয়াল চ্যানেলের মাধ্যমে আপনার সাথে যোগাযোগ করবে। অননুমোদিত অ্যাক্সেস সন্দেহ হলে, অফিসিয়াল অ্যাপের মাধ্যমে অবিলম্বে আপনার পিন পরিবর্তন করুন।`,
      };

    // ─── Other / Fallback ────────────────────────────────────────
    case 'other':
    default:
      return insufficientTemplate(caseType, decision);
  }
}

/**
 * Default template for insufficient_data or unmatched cases.
 */
function insufficientTemplate(caseType: CaseType, decision: Decision): TemplateSet {
  return {
    agentSummary: `Customer has submitted a support request${caseType !== 'other' ? ` related to ${caseType.replace(/_/g, ' ')}` : ''}. ${decision.matchResult.state === 'AMBIGUOUS' ? 'Multiple transactions could match the complaint — clarification is needed.' : decision.matchResult.state === 'NO_MATCH' ? 'No matching transaction was found in the provided history.' : 'Further investigation is required to resolve this ticket.'}`,
    recommendedNextAction: `${decision.matchResult.state === 'AMBIGUOUS' ? 'Request clarification from the customer about which specific transaction they are referring to.' : 'Review the complaint details and request additional information from the customer if needed.'} Escalate to the appropriate team through official channels.`,
    customerReply: `Thank you for contacting us. We have received your concern and our support team will review it. We may reach out to you for additional details through official channels. Please do not share your PIN, OTP, or password with anyone.`,
    customerReplyBn: `যোগাযোগ করার জন্য ধন্যবাদ। আমরা আপনার উদ্বেগ পেয়েছি এবং আমাদের সাপোর্ট দল এটি পর্যালোচনা করবে। অতিরিক্ত তথ্যের জন্য আমরা অফিসিয়াল চ্যানেলের মাধ্যমে আপনার সাথে যোগাযোগ করতে পারি। অনুগ্রহ করে আপনার পিন, ওটিপি বা পাসওয়ার্ড কারো সাথে শেয়ার করবেন না।`,
  };
}
