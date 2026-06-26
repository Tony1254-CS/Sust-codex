# QueueStorm Investigator

An AI-powered REST API that analyzes fintech customer support tickets by combining the complaint with transaction history. The API identifies the correct transaction, determines whether the complaint is supported by evidence, classifies the case, routes it to the appropriate department, generates a safe customer response, and indicates whether human review is required.

## Core Features

- **Deterministic First**: A rigid rules engine processes the transaction history, scores matches, and computes evidence before any AI is involved.
- **Gemini Enrichment**: Google Gemini 2.0 Flash is used *only* to enrich the prose fields (agent summary, next actions, customer reply) if the case is complex. It cannot alter routing or decisions.
- **Safety Guard (Barrier C)**: A terminal post-processing layer scans all generated text for credential requests, refund promises, third-party routing, and secret leaks, reverting to safe deterministic templates if a violation is found.
- **Schema Guardian**: Guarantees output is structurally sound and strictly follows the official schema (no stray fields, valid enums, clamped confidences).
- **Vercel Serverless Ready**: Designed for cold-start performance and serverless timeout boundaries (25s soft cap).

## API Endpoints

### `GET /health`
Returns a `200 OK` readiness probe. Available within 60ms of startup.

### `POST /analyze-ticket`
The primary investigation pipeline.

**Request Schema:**
```json
{
  "ticket_id": "string",
  "complaint": "string",
  "user_type": "customer | merchant | agent", // Optional
  "language": "en | bn | mixed",              // Optional
  "transaction_history": [
    {
      "transaction_id": "string",
      "timestamp": "ISO-8601 string",
      "type": "transfer | payment | cash_in | cash_out | settlement",
      "amount": number,
      "counterparty": "string",
      "status": "pending | completed | failed | reversed"
    }
  ]
}
```

**Response Schema:**
```json
{
  "ticket_id": "string",
  "relevant_transaction_id": "string | null",
  "evidence_verdict": "consistent | inconsistent | insufficient_data",
  "case_type": "wrong_transfer | payment_failed | refund_request | duplicate_payment | merchant_settlement_delay | agent_cash_in_issue | phishing_or_social_engineering | other",
  "severity": "low | medium | high | critical",
  "department": "customer_support | payments_ops | dispute_resolution | merchant_operations | agent_operations | fraud_risk",
  "agent_summary": "string",
  "recommended_next_action": "string",
  "customer_reply": "string",
  "human_review_required": boolean,
  "confidence": number,
  "reason_codes": ["string"]
}
```

## Running Locally

1. `npm install`
2. Create a `.env` file based on `.env.example` and add your `GEMINI_API_KEY`.
3. `npm run dev` (Starts Vercel dev server on localhost:3000)

### Testing

Run the full 31-case comprehensive test suite:
`npm run type-check`
`npx ts-node tests/runner.ts`

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `GEMINI_API_KEY` | Your Google Gemini API Key | - |
| `LLM_ENABLED` | Enable LLM enrichment (true/false) | `false` |
| `LLM_TIMEOUT_MS` | Max time allowed for LLM call before fallback | `5500` |
| `LOG_LEVEL` | Application logging level | `info` |

## Pipeline Architecture (Layers 0-6)

1. **Layer 0 (Validation)**: Drops invalid requests (`400` / `422`).
2. **Layer 1 (Signal Extractor)**: Parses text into intents, amounts, and adversarial flags using deterministic Banglish/English rules.
3. **Layer 2 (Deterministic Engine)**: Scores transactions, detects duplicates, classifies severity, and issues an `evidence_verdict`.
4. **Layer 3 (Text Templates)**: Generates guaranteed-safe Barrier-A prose.
5. **Layer 4 (LLM Enricher)**: If enabled, calls Gemini under strict timeout to rewrite prose. (Bypassed if confidence > 0.85).
6. **Layer 5 (Safety Guard)**: Scans LLM text for leaks/promises/credentials and replaces them with Layer 3 templates.
7. **Layer 6 (Schema Guardian)**: Terminal schema enforcer ensuring valid enums and types.
