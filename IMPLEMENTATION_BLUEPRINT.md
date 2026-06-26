# QueueStorm Investigator — Implementation Blueprint

> **Status:** FROZEN single source of truth. Implement; do not re-decide architecture.
> **Authority:** SUST Preliminary Problem Statement, Evaluation Rubric, Team Instructions, Sample Case Pack (10 cases).
> **Stack:** Node.js 20 + TypeScript (strict) on Vercel Serverless. Stateless. Free-tier Gemini only.

---

# Project Overview

QueueStorm Investigator is a stateless support copilot that investigates one customer complaint against the customer's recent transaction history and returns a structured, safety-checked verdict for human agents.

**Evaluation priorities (from the Rubric):**
- Evidence Reasoning — 35 pts (right transaction, right verdict, right classification, right routing).
- Safety & Escalation — 20 pts (no credential requests, no unauthorized refund promises, correct escalation).
- API Contract & Schema — 15 pts (exact fields, types, enums, status codes).
- Performance & Reliability — 10 pts (≤30s timeout; ≤5s p95 full credit).
- Response Quality — 10 pts (manual, shortlist-only; prose clarity).
- Deployment & Reproducibility — 5 pts.
- Documentation — 5 pts.

**Safety penalties are severe:** −15 (credential request), −10 (unauthorized refund/third-party), disqualification on two critical violations.

**Design philosophy — one sentence:** Determinism owns every score-bearing field; the LLM owns only prose; a terminal safety/schema guard owns the last word.

---

# Architecture Overview

A single synchronous request flows through seven ordered layers. Only Layer 4 touches the network. All decision logic is pure and testable.

| Layer | Name | Responsibility | Network? | On failure |
|---|---|---|---|---|
| 0 | Edge / HTTP | Parse + validate input | no | 400 / 422 |
| 1 | Signal Extractor | Complaint → SignalSet | no | — |
| 2 | Deterministic Engine | SignalSet × history → Decision | no | — |
| 3 | Text Composer | Decision + language → safe prose | no | — |
| 4 | LLM Enricher (conditional) | Rewrite 3 prose fields if confidence < threshold | **yes** | revert to Layer 3 |
| 5 | Safety Guard | Scan prose; veto/replace unsafe text | no | replace with template |
| 6 | Schema Guardian | Normalize + validate final output | no | substitute safe defaults |

**Request lifecycle:**
1. Vercel receives `POST /analyze-ticket`; record `t0`.
2. Layer 0: parse JSON. Malformed → 400. Empty complaint → 422.
3. Lenient coercion of inputs (numeric coercion, unknown input enums tolerated, tx-entry defaults applied).
4. Layer 1: extract signals (amounts, time refs, type hints, counterparty mentions, status hints, intents, language, adversarial flags).
5. Layer 2: matcher → duplicate detector → evidence reasoner → classifier → router → fully scored `Decision`.
6. Layer 3: deterministic templates fill the three prose fields.
7. Branch: if `LLM_ENABLED && confidence < 0.85` → Layer 4, else skip to Layer 5.
8. Layer 4: single Gemini call (JSON mode, 5500ms timeout, injection-filtered input). Any failure → keep Layer-3 prose.
9. Layer 5: scan final prose; replace any unsafe field with its template.
10. Layer 6: normalize, validate enums/types, clamp confidence, force `ticket_id`, strip disallowed fields.
11. Return 200. Whole-handler 25s soft cap → ship deterministic immediately if exceeded.

**Invariants at every exit:** `ticket_id` echoed; all 10 required fields present with valid enums; `confidence ∈ [0,1]`; no secret/stack-trace leakage. The process never exits.

---

# Folder Structure

```
api/
  health.ts
  analyze-ticket.ts
src/
  config/        env.ts, enums.ts
  validation/    request-schema.ts, response-schema.ts
  extractor/     signal-extractor.ts, numerals.ts, lang-detect.ts, banglish-keywords.ts
  engine/        transaction-matcher.ts, duplicate-detector.ts, evidence-reasoner.ts,
                 classifier.ts, router.ts, rules.ts
  composer/      text-templates.ts, llm-enricher.ts, llm-prompt.ts
  safety/        safety-guard.ts, injection-filter.ts, forbidden-lexicon.ts
  guardian/      schema-guardian.ts
  pipeline/      orchestrator.ts
  utils/         async.ts (withTimeout, neverThrow), logger.ts
tests/
  samples/   unit/   fuzz/   banglish/   adversarial/   malformed/   latency/
vercel.json
```

One folder per architecture layer. Tests mirror `src/` for one-to-one traceability. No deeper nesting; no speculative abstractions.

---

# Module Responsibilities

| Module | Purpose | Inputs | Outputs | Dependencies |
|---|---|---|---|---|
| `api/analyze-ticket.ts` | HTTP boundary, orchestration entry | Request body | 200/400/422/500 response | orchestrator, logger |
| `api/health.ts` | Readiness probe | — | `{"status":"ok"}` | — |
| `pipeline/orchestrator` | Execute Layers 0→6 in order; own try/catch | Parsed body | Final response object | all layers |
| `validation/request-schema` | Lenient Zod input parse + coerce | Raw body | Validated body or throw | enums |
| `validation/response-schema` | Output Zod contract | Response object | Validate or throw | enums |
| `extractor/signal-extractor` | Complaint → SignalSet | complaint, language? | SignalSet | numerals, lang-detect, banglish-keywords |
| `extractor/numerals` | Parse Bangla/Banglish/Western digits, ৳, grouping | string | number[] | — |
| `extractor/lang-detect` | Classify en/bn/mixed by script ratio | string | language | — |
| `extractor/banglish-keywords` | EN/BN/Romanized triplet tables | — | keyword maps | — |
| `engine/transaction-matcher` | Score each tx; pick best; classify match state | SignalSet, history | MatchResult | rules |
| `engine/duplicate-detector` | Find near-identical payment pairs | history, intent | suspected duplicate tx | rules |
| `engine/evidence-reasoner` | Compute verdict from match + contradictions | MatchResult, history, case_type | verdict | rules |
| `engine/classifier` | Resolve case_type from signals | SignalSet, MatchResult | case_type | banglish-keywords |
| `engine/router` | department, severity, review, confidence, reason_codes | case_type, verdict, user_type, MatchResult | routing bundle | rules |
| `engine/rules` | **All tunable constants (single source of truth)** | — | constants | — |
| `composer/text-templates` | Safe deterministic prose per case_type × verdict × language | Decision, language | 3 prose fields | — |
| `composer/llm-enricher` | Gemini call with timeout + fallback | Decision, language | 3 prose fields or null | llm-prompt, utils/async, env |
| `composer/llm-prompt` | Hardened prompt builder | Decision, language | system + user prompt | — |
| `safety/safety-guard` | Terminal scanner; replace unsafe field | response object | sanitized object | forbidden-lexicon, text-templates |
| `safety/injection-filter` | Neutralize instruction-bearing sentences before LLM | complaint | sanitized text | — |
| `safety/forbidden-lexicon` | Credential/refund/third-party synonym sets + semantic rules | — | pattern data | — |
| `guardian/schema-guardian` | Terminal normalize + validate | response object | compliant object | response-schema, safety-guard |
| `config/env` | Typed env access | process.env | typed config | — |
| `config/enums` | Canonical enum unions | — | enum sets | — |
| `utils/async` | `withTimeout`, `neverThrow` | promise | guarded promise | — |
| `utils/logger` | Redacted logger | fields | log lines | — |

**Rule:** every module under `src/engine`, `src/safety`, `src/guardian`, and `src/composer/text-templates` is a pure function with no I/O.

---

# API Contract

## GET /health
- Returns `{"status":"ok"}` within 60s of service start. No request body expected.
- Always 200.

## POST /analyze-ticket
- Accepts one ticket per Request Schema. Must complete within 30s (harness cap).
- Returns structured JSON per Response Schema.

**Request validation (lenient):**
- Required: `ticket_id` (non-empty string), `complaint` (non-empty string).
- Optional: `language` (en|bn|mixed), `channel`, `user_type`, `campaign_context`, `transaction_history` (array), `metadata`.
- Malformed JSON / wrong content-type / missing required field → **400** `{"error":"invalid_request"}`.
- Valid JSON but empty/whitespace `complaint` → **422** `{"error":"empty_complaint"}`.
- Numeric coercion (`z.coerce.number()`). Unknown input enum values tolerated, not rejected. Missing tx-entry sub-fields normalized to safe defaults.

**Response validation (strict):**
- Required output fields: `ticket_id`, `relevant_transaction_id` (string|null), `evidence_verdict` (consistent|inconsistent|insufficient_data), `case_type`, `severity` (low|medium|high|critical), `department`, `agent_summary`, `recommended_next_action`, `customer_reply`, `human_review_required` (boolean).
- Optional: `confidence` (∈[0,1]), `reason_codes` (string[]).
- Enum values match canonical sets **exactly** (case-sensitive).
- `ticket_id` in response MUST equal request value.
- No extra fields (stripped by guardian).
- Errors must never include stack traces, tokens, or secrets.

**Status behavior:** 200 success; 400 malformed input; 422 empty complaint; 500 internal (non-sensitive message only). Process must never crash on malformed input.

**Do not redefine the official schema.** The official allowed enums are the only allowed enums.

---

# Deterministic Investigation Engine

This section owns the 35-point Evidence bucket plus escalation decisions. All fields below are **always deterministic** — Gemini never writes them:
`relevant_transaction_id`, `evidence_verdict`, `case_type`, `severity`, `department`, `human_review_required`, `confidence`, `reason_codes`.

All tunables live in `engine/rules.ts` as binding constants.

## Transaction Matching
For each tx, compute `txScore = 0.40·amountScore + 0.20·typeScore + 0.15·temporalScore + 0.15·counterpartyScore + 0.10·statusScore + recencyBoost` where:
- amountScore: exact=1.0; ±2%=0.85; ±10%=0.5; else=0; no amount in complaint=0.25.
- typeScore: tx.type ∈ typeHints=1.0; none=0.5; conflict=0.0.
- temporalScore: inside window=1.0; ±3h=0.6; none=0.5.
- counterpartyScore: exact phone=1.0; role match (agent/merchant/biller)=0.8; prefix match ≥7 digits=0.8; relation word+transfer=0.4; none=0.4.
- statusScore: agree=1.0; none=0.5; conflict=0.2.
- recencyBoost: +0.05 if most recent tx.

**Match state:** sort by txScore desc; `best`, `second`.
- intent includes phishing → `SPECIAL_NO_MATCH`.
- `best.txScore < 0.40` → `NO_MATCH`.
- `second.txScore ≥ best.txScore − 0.12` and `≥ 0.40` → `AMBIGUOUS`.
- else → `SINGLE_MATCH(best)`.

`NO_MATCH` / `SPECIAL_NO_MATCH` / `AMBIGUOUS` ⇒ `relevant_transaction_id = null`. `SINGLE_MATCH` ⇒ matched id.

## Duplicate Detection
Triggered when `duplicate_payment` intent fires, before generic matching. For each pair (i<j by timestamp): if amount equal, counterparty equal, and `|Δt| ≤ 120s` → candidate. Pick the **later** tx of the closest pair as `relevant_transaction_id` (SAMPLE-10 behavior). Multiple pairs → still pick latest close pair; reason_code `duplicate_payment`.

## Evidence Reasoning
- No match / ambiguous / phishing → `insufficient_data` (phishing is its own category but verdict is insufficient_data per SAMPLE-05).
- SINGLE_MATCH: compute support (+1 each for amount match, type match, status agree) and contradictions.
  - Established-recipient (SAMPLE-02): for `wrong_transfer`, count OTHER completed transfers to counterparty in 30d before tx. Flag if `n_prior ≥ 2` OR `n_prior ≥ 1 within 7d`.
  - Non-receipt vs completed: "non_receipt" statusHint ∧ tx.status=completed → contradiction.
  - General status contradiction: any direct conflict between statusHint and tx.status → contradiction, unless case_type overrides (refund_request; agent_cash_in + pending).
  - Specials: agent_cash_in + pending → +1 support; duplicate pair found → +2 support; refund_request consistent by definition when matched.
- Verdict: any contradiction → `inconsistent`; support ≥ 2 → `consistent`; support == 1 → `consistent`; else `insufficient_data`.

## Confidence Scoring
`base = best.txScore` (0.5 if NO_MATCH/vague). Then:
- inconsistent → clamp(base, 0.70, 0.80).
- insufficient_data → clamp(base, 0.55, 0.70).
- AMBIGUOUS → 0.60.
- phishing → 0.90 (+0.05 if credential words present).
- duplicate pair found → 0.90.
- clamp [0,1]; round 2 decimals.

`CONFIDENCE_THRESHOLD = 0.85` (drives the LLM gate only; not scored).

## Case Classification
Multilingual keyword matrix (EN/BN/Romanized triplets). Multi-label then resolved by **severity** tie-break (critical > high > medium > low), not list order. Phishing always wins regardless of history.
- Priority order: phishing_or_social_engineering, duplicate_payment, agent_cash_in_issue, merchant_settlement_delay, payment_failed, wrong_transfer, refund_request, other (fallback).
- Reconciliation: chosen case_type must be consistent with matched tx type; otherwise trust intent but flag for review.

## Severity
- phishing → `critical`.
- inconsistent on money-movement → `medium`.
- amount ≥ HIGH_VALUE (10000 BDT) on failed/dispute → `high`.
- payment_failed+deduction, duplicate_payment, agent_cash_in_issue, clear wrong_transfer → `high`.
- merchant_settlement_delay → `medium`.
- refund_request (change of mind) → `low`.
- vague/other/insufficient_data without risk → `low`.

## Department Routing
- wrong_transfer → `dispute_resolution`.
- refund_request ∧ inconsistent/contested → `dispute_resolution`; refund_request ∧ consistent/insufficient → `customer_support`.
- payment_failed, duplicate_payment → `payments_ops`.
- merchant_settlement_delay or user_type=merchant → `merchant_operations`.
- agent_cash_in_issue or user_type=agent → `agent_operations`.
- phishing → `fraud_risk`.
- other / vague / insufficient (non-risk) → `customer_support`.
- Precedence: user_type (merchant/agent) overrides channel mismatch.

## Human Review
`human_review_required = true` if ANY:
- case_type ∈ {wrong_transfer, duplicate_payment, agent_cash_in_issue, phishing_or_social_engineering}.
- verdict inconsistent OR insufficient_data driven by AMBIGUOUS.
- severity critical.
- amount ≥ HIGH_VALUE on disputes.

`false` for: clean payment_failed, low-risk refund_request, plain merchant_settlement_delay, vague-but-harmless other.

---

# Gemini Integration

**Scope:** Gemini rewrites exactly three fields — `agent_summary`, `customer_reply`, `recommended_next_action`. It NEVER touches any decision field. It is an enhancement layer only.

**Model:** `gemini-2.0-flash`, `responseMimeType: application/json`, streaming disabled.

**Trigger:** `LLM_ENABLED && confidence < 0.85`.

**Input to Gemini:** `Decision` object + `language` ONLY — never the raw complaint (injection-filtered). System prompt (immutable, top priority) forbids credential requests, refund promises, third-party routing; mandates JSON with exactly three keys; mandates reply language.

**Timeout:** `LLM_TIMEOUT_MS = 5500` (Vercel Hobby function cap is 10s; 5.5s + overhead stays safely under).

**Failure handling — instant fallback, NO retry:** 429, 5xx, network error, timeout, JSON parse failure, Zod validation failure, auth failure → silently keep Layer-3 deterministic templates. First auth failure → disable LLM for process life (in-memory flag; stateless-safe per invocation).

**Cost-awareness:** high-confidence fast path (≥70–80% of cases) consumes zero quota. With ~200 hidden cases, expect <30 LLM calls — well within free-tier 15 RPM.

**Why no retry:** retry burns latency/quota; deterministic fallback is already safe and instant.

---

# Safety Guard

Three independent barriers. A violation must defeat all three to ship — by construction it cannot.

**Barrier A — Pre-verified deterministic templates.** Sanctioned phrasing only:
- Credential *warning* allowed (never a request): "Please do not share your PIN or OTP with anyone."
- Refund: exact sanctioned form "any eligible amount will be returned through official channels." Never "we will refund".
- Routing: official channels only; never a phone number or third party.

**Barrier B — LLM hardening + injection filtering.** `injection-filter` neutralizes instruction-bearing sentences before the prompt. LLM sees SignalSet summary, not raw complaint. Immutable system prompt re-asserts all rules at top priority.

**Barrier C — Terminal Safety Guard (always runs on final merged object).** Operates on `customer_reply` and `recommended_next_action`. If any rule fires, the offending field is replaced wholesale with its Barrier-A template.

**Rule families (synonym sets + semantics, NOT literal words):**
- **Credential REQUEST:** verb-of-request (`share|provide|send|enter|give .* your|type in`) near a credential term (PIN, OTP, **one-time code, verification code, security code, code from SMS, password, CVV/CVC, "3 digits", expiry, secret**) — UNLESS inside an explicit prohibition sentence (prohibition phrases detected as a set: `do not, never, don't, please avoid, refrain from, keep … private, never disclose`).
- **Refund PROMISE (semantic):** any future-tense restoration of money (`will refund, have refunded, will reverse, will unblock, will recover, funds will be restored, money's on its way back, expect the reversal, your account will be credited`) — UNLESS it contains the sanctioned phrase (`any eligible amount`, `if eligible`, `through official channels`).
- **Third-party routing:** raw phone number, or `contact <name>` where name ∉ official set.
- **Secret leak:** `sk-`, `Bearer `, `AIza`, 32+ hex, JWT shape → redact + replace.

**Prompt injection defense:** decisions are deterministic (engine never reads embedded instructions); injection-filter scrubs LLM input; minimal LLM input (Decision + language only); immutable system prompt; terminal Safety Guard scans LLM output regardless; `adversarialFlags` logged but never influence decisions.

---

# Schema Validator

**Two distinct validators — do not conflate.**

**Input validator (lenient):** Zod. Required `ticket_id`, `complaint`. Optional arrays/objects. Enums coerced/tolerated. Numeric coercion (`z.coerce.number()`). Malformed JSON / wrong content-type / missing required → 400. Empty complaint → 422. Missing tx-entry sub-fields normalized to safe defaults before matching.

**Output Schema Guardian (strict, terminal, always runs):** runs last on every response.
1. Assert all 10 required fields present; fill missing with deterministic defaults.
2. Coerce types (`human_review_required`→boolean, `confidence`→number).
3. Validate every enum against the canonical set; on any invalid value, substitute the case_type-safe default.
4. Clamp `confidence` to [0,1].
5. Force `ticket_id` to equal request value.
6. Strip any field not in the allowed output set.
7. Re-run the Safety Guard as a final backstop.

**Why split validators:** Rubric rewards input tolerance (survive malformed) and output exactness (match enums exactly). Each optimizes for its own goal. A schema-violating or unsafe response is structurally impossible to emit.

---

# Performance Strategy

| Metric | Target | Mechanism |
|---|---|---|
| Health readiness | < 60s | zod-only deps; trivial `/health` |
| Fast-path p95 | < 1s | ~70–80% of cases never call Gemini |
| LLM-path p95 | < 5.5s | `LLM_TIMEOUT_MS = 5500`, single attempt, no retry |
| Overall p95 | ≤ 5s (full credit tier) | 5.5s cap + instant fallback |
| Whole-handler soft cap | 25s | ship deterministic immediately if exceeded |
| Memory | ≪ 4GB | no models loaded; strings only |

**Serverless considerations:** Vercel function execution cap (Hobby = 10s) → 5.5s LLM timeout + deterministic-first keeps total execution safely under. Cold start minimized by minimal dependencies (zod only). `maxDuration` set to plan maximum.

**Stateless execution:** no DB, no in-memory cross-request state. Every request is independent. The in-memory "disable LLM on first auth failure" flag is per-invocation (safe under statelessness).

---

# Testing Strategy

| Suite | Purpose | Gate |
|---|---|---|
| `samples/` | Replay all 10 cases; assert functional equivalence on `relevant_transaction_id`, `evidence_verdict`, `case_type`, `department`, severity (±1), `human_review_required`, reply safety | all 10 green |
| `unit/` | One file per engine/safety/guardian/extractor module; all branches | all branches covered |
| `fuzz/` | Vary each sample ±amount, ±time, ±number; must still resolve equivalently | anti-overfitting gate |
| `banglish/` | Romanized + Bengali-script equivalents of each scenario | multilingual gate |
| `adversarial/` | injection, refund-begging, fake "system:" prefixes | safety gate (disqualification guard) |
| `malformed/` | bad JSON, missing fields, wrong types, 100KB payload, nested garbage → 400/422, no crash | reliability gate |
| `latency/` | fast-path p95 < 1s; LLM-path < 5.5s with fallback | performance gate |
| `gemini-timeout/` | Mock slow/failing Gemini → fallback within budget; output still valid & safe | reliability gate |
| `schema/` | Inject deliberately broken decisions → guardian repairs to valid output | schema gate |

**Golden rule:** samples are a regression set, not a target. Fuzz + Banglish + adversarial suites are built from the Rubric, not memorized from samples.

---

# Checkpoint Plan

Each checkpoint is independently deployable. Preserve passing functionality between checkpoints.

## Checkpoint 1 — Infrastructure
- `/health` + `/analyze-ticket` returning a hardcoded valid response.
- `vercel.json` root rewrites (`/health`→`/api/health`, `/analyze-ticket`→`/api/analyze-ticket`) + `maxDuration`.
- Schema Guardian in place. Secret hygiene (`.gitignore .env`, redacted logger).
- **Deployable:** endpoints reachable at root paths; `/health` returns ok.
- Unlocks: Schema (15) floor + Deployment reachability.

## Checkpoint 2 — Deterministic Reasoning Engine
- Extractor (numerals, lang-detect, banglish-keywords, signal-extractor).
- Engine (matcher, duplicate-detector, reasoner, classifier, router) with centralized `rules.ts`.
- All 10 samples resolve to correct `relevant_transaction_id`, `evidence_verdict`, `case_type`, `department`, `severity`, `human_review_required`.
- Deterministic text templates wired.
- **Deployable:** full correct responses with no LLM.
- Unlocks: bulk of Evidence (35) + escalation.

## Checkpoint 3 — Gemini Integration, Validator, Safety
- Input validator (lenient) + 400/422/500 behavior.
- LLM enricher behind `confidence < 0.85` + 5500ms timeout + fallback.
- Injection-filter + Safety Guard (semantic lexicon).
- Adversarial suite green; "do not share OTP" allowed, "share your OTP" blocked.
- **Deployable:** full pipeline with LLM enhancement + safety.
- Unlocks: Safety (20) + penalties avoided + Response Quality upside.

## Checkpoint 4 — Testing, Optimization, Deployment Verification
- Fuzz + Banglish + malformed + latency + schema + gemini-timeout suites green.
- p95 verified ≤ 5s fast path; < 5.5s LLM path.
- Dockerfile + RUNBOOK + README (with MODELS section) + sample-output file.
- Live URL reachable at root paths; redeploy via Docker verified.
- **Deployable & submission-ready.**
- Unlocks: Performance/Reliability (10) + Deployment/Docs (10) + finalist eligibility.

---

# Non-Negotiable Rules

- Never rename or alter official schema field names or enum values.
- Never redesign the architecture during implementation.
- Never let Gemini (or any LLM) determine `relevant_transaction_id`, `evidence_verdict`, `case_type`, `severity`, `department`, `human_review_required`, `confidence`, or `reason_codes`.
- Never return invalid JSON or a schema-violating response (Schema Guardian is terminal and mandatory).
- Never expose secrets, tokens, or stack traces in responses, logs, or the repo.
- Never remove or bypass the Safety Guard.
- Never retry Gemini calls (instant fallback only).
- Never exceed the 5500ms LLM timeout.
- Never guess a transaction on ambiguous evidence — return null + insufficient_data + clarification.
- Never rewrite a working module without justification; preserve passing tests between checkpoints.
- Never hardcode sample answers — the engine scores signals, not strings.
- Never route a customer to a third party or a raw phone number.

---

# Risk Register

| # | Risk | Probability | Impact | Mitigation |
|---|---|---|---|---|
| R1 | 404 on `/health` (missing root rewrites) | Medium (if forgotten) | Existential (0 score) | `vercel.json` rewrites — Checkpoint 1, non-negotiable |
| R2 | Vercel function timeout 504 under LLM path | Medium | Reliability/latency loss | `LLM_TIMEOUT_MS = 5500` + `maxDuration` + instant fallback |
| R3 | Paraphrased credential request ships (e.g. "one-time code") | Medium | −15 / disqualification risk | Semantic credential synonym set + prohibition-sentence detection |
| R4 | Indirect refund promise ships | Medium | −10 / disqualification risk | Semantic refund-promise detection + sanctioned phrase allowlist |
| R5 | Matcher thresholds overfit to 10 samples | High | −evidence on hidden | Centralized `rules.ts` + fuzz suite |
| R6 | Bangla/Banglish/numeral coverage gap | High | −evidence on hidden | Dedicated data tables + Banglish test suite |
| R7 | Ambiguous match guessed wrong | Medium | −evidence | AMBIGUOUS ⇒ null + insufficient_data + clarification |
| R8 | Gemini 429 quota | High (free tier) | Response Quality only (manual) | Threshold 0.85; high-confidence fast path uses no quota |
| R9 | Upstream bug emits invalid enum | Low | −schema | Schema Guardian substitutes valid defaults |
| R10 | Secret leak in logs/responses | Low | Reliability/trust penalty | Redacted logger; guardian strips non-schema fields; pre-commit grep |
| R11 | Cold start > 60s | Low | `/health` fail | Minimal deps (zod only) |
| R12 | Hardcoded sample answers | Medium | Hidden collapse | Engine scores signals; fuzz suite enforces generality |

---

# Final Implementation Checklist

- [ ] `vercel.json` configures `/health`→`/api/health` and `/analyze-ticket`→`/api/analyze-ticket` rewrites + `maxDuration`.
- [ ] `LLM_TIMEOUT_MS = 5500`; `CONFIDENCE_THRESHOLD = 0.85`.
- [ ] Safety Guard lexicon = synonym sets + semantic refund detection (not literal words).
- [ ] `banglish-keywords.ts` + `numerals.ts` (Bangla digits ০-৯, ৳, Indian grouping) implemented and unit-tested.
- [ ] All tunables centralized in `engine/rules.ts`.
- [ ] 10-sample replay suite green (functional equivalence).
- [ ] Fuzz suite green (±amount/±time/±number).
- [ ] Adversarial suite green (injection/refund-begging blocked).
- [ ] Malformed-input suite green (400/422, no crash).
- [ ] Latency suite green (fast-path <1s; LLM-path <5.5s).
- [ ] Schema Guardian repairs deliberately broken inputs.
- [ ] No secrets in repo/logs/responses; `.env` gitignored; `.env.example` present (names only).
- [ ] Dockerfile + RUNBOOK + README (with MODELS section) + sample-output file present.
- [ ] Live URL reachable at root paths; `/health` returns `{"status":"ok"}` within 60s.
