# Sorted — an AI support inbox where a person approves every reply (Next.js + Supabase + Claude)

Support email arrives through a signed webhook. Claude picks a category and priority, writes a two-line summary and drafts a reply. Nothing is sent until a teammate reads it, edits it if needed, and clicks **Approve & send**. Refunds, deletion requests, legal threats and emails that try to give the AI instructions are flagged for a careful look.

It is a portfolio project, set up for a sample note-taking app called Tidebook with 12 sample emails. The "send" step records the reply in an outbox instead of emailing anyone.

![Triage and draft waiting for approval](docs/screenshots/03-triage-and-draft.png)

> **About these screenshots:** they show the built-in rules provider, which runs without an API key and labels its results "Rules (no AI)". With a Claude API key, Claude does the triage; see [Running with Claude](#running-with-claude).

## How a message flows

```
mail provider ── POST /api/inbound/<team>  (HMAC-SHA256 over timestamp + body, 5-minute window)
                   │ verify signature → validate (Zod) → ingest_message()  (idempotent on the provider's id)
                   │ 202 at once; triage starts after the response (Next.js after())
                   ▼
              triage_jobs queue (Postgres)
                   │ claim_triage_jobs(): FOR UPDATE SKIP LOCKED: no two workers claim the same job; after 5 minutes it can be claimed again
                   ▼
              provider.triage()  ── Claude (structured output, Zod-checked)  or  offline rules
                   │ done → complete_triage_job()      → message waits for review
                   │ outage / bad answer → retry with backoff (30 s, 2 min), give up after 3
                   │ refusal → no retry, straight to a person
                   ▼
              Inbox (sorted by priority) → a person edits / approves / dismisses / asks for a new draft
                   │ approve_reply(): row lock, exactly one reply even if two people click at once
                   ▼
              Outbox + per-message history (who did what, edited or as-is)
```

A cron-style endpoint (`POST /api/worker`, bearer secret; `npm run worker` locally) picks up retries and anything the post-response run missed. A job stuck in `running` for 5 minutes (a crashed worker) becomes claimable again; after 3 attempts that all crashed, the message goes to a person instead of looping. Each claim gets a new random token, and finishing or failing a job checks it, so a worker that comes back after its job was taken over, or after an agent asked for a new draft, can't overwrite the newer attempt. (The first version checked the attempt number instead; a review found that a new draft starts the count again, so an old number could match.)

## The parts worth looking at

- **The AI call** ([`lib/triage/claude.ts`](lib/triage/claude.ts)): Claude Opus 5.5 with structured output. The SDK enforces the JSON shape, and Zod checks it again before anything is stored. Low effort, because this is classification and a short draft. Rate limits, 5xx errors and malformed answers are retried; 4xx errors and refusals are not.
- **Prompt injection** ([`lib/triage/prompt.ts`](lib/triage/prompt.ts)): the email is wrapped in an `<email>` block, and the system prompt treats it as data. A closing tag inside the email, in any case or spacing (`</EMAIL >`, `< / email>`), is neutralized, so the email can't end the block early. The model only returns labels and a draft. It has no tools, and nothing it writes is sent without a person, so a successful injection can at worst produce a bad draft that gets flagged. The UI renders everything as text.
- **The database decides who can do what** ([`supabase/migrations/0001_sorted.sql`](supabase/migrations/0001_sorted.sql)): agents read their team's rows through RLS and can't write tables at all. Every change goes through a function. The webhook and the worker use the service role and are the only callers of the queue functions. Supabase grants new functions to everyone by default, so the migration revokes them all first and grants back only what each role needs (a test caught this).
- **The webhook** ([`app/api/inbound/[team]/route.ts`](app/api/inbound/[team]/route.ts), [`lib/webhook.ts`](lib/webhook.ts)): rejects a declared size over 64 KB before reading and checks the real size after, verifies the signature before parsing, compares in constant time, and rejects replays outside the 5-minute window. The team id in the URL is part of the signed text, so a delivery signed for one team can't be replayed into another. A retried delivery returns 200 with the existing id instead of a second copy. A dropped database connection returns 503 with `retry-after`, so the sender retries.
- **Clear labels**: results from the offline rules provider say "Rules (no AI)" in the list and on the message, and the summary box only says "AI summary" when Claude wrote it; in rules mode it says how the result was made instead of repeating the email. The overview page shows Claude token usage and an estimated cost at list price.

Stack: Next.js 16.4, React 19.2, TypeScript 5.9, Tailwind CSS 4, Zod 4, `@anthropic-ai/sdk` 0.137, `@supabase/ssr`, Postgres 16, Vitest 4, Playwright 1.63.

## Tests

| Suite | What it covers | Result (Nov 7, 2026, Windows 11, local stack) |
| --- | --- | --- |
| `npm run test:unit` | 33 tests: the sign-in redirect guard (18, including every mix of dot, encoded-dot, slash and backslash segments four deep), webhook signatures (tampered body, wrong secret, replay, malformed header, signed for another team), payload validation, prompt fencing (closing tags in any case, spacing or with attributes), the Claude provider against a mocked client (parsed answer and usage, refusal → no retry, cut-off or malformed answer → retry, 429/5xx → retry, 400 → no retry), the rules provider's flags and label | 33 / 33 passed |
| `npm run test:db` | 19 tests against the real API with real JWTs: idempotent ingest, per-team ids, worker claim and completion, **three workers claiming at once (10 races)**, retry with backoff, give-up after 3, refusal, crashed-worker recovery, a worker that crashes on every attempt, a late worker that comes back after its job was taken over or after a new draft, approve and edit, **two agents approving at once**, empty reply, dismissed messages, requeue; anonymous access, another team, agents calling queue functions or writing tables | 19 / 19 passed |
| `npm run test:e2e` | 11 browser tests through the signed webhook: triage → review, edit and approve → outbox and history, dismiss, the injection sample shown as text and flagged, another team can't see or open a message, the webhook's 401 (unsigned, tampered, stale, signed for another team) / 404 / 422 / 202 / duplicate 200 responses, the worker endpoint's 401 (including a wrong secret of the same length in multibyte characters), sign-in never redirects to another site (two crafted links); on a phone viewport, no page scrolls sideways and sign-out works | 11 / 11 passed |
| `npm run typecheck`, `npm run lint`, `npm run build` | — | clean |

To check that the tests can fail, each rule below was broken on purpose, one at a time, and the suite that should notice was run against it. Every one was caught. `node scripts/mutations.mjs sorted` (from the repository root) does this, puts each file back and rebuilds the database afterwards; the full output, with the name of each test that caught it, is in [`docs/evidence/mutations.txt`](docs/evidence/mutations.txt).

| Deliberate weakness | Tests that failed |
| --- | --- |
| Agents allowed to call the worker's queue functions | 1 |
| `approve_reply` without the row lock | 1 |
| Job claim without `FOR UPDATE SKIP LOCKED` | 1 |
| Messages readable by every team | 1 |
| Row-level security switched off on messages | 2 |
| Retries that never give up | 2 |
| Requeue that keeps the old result | 2 |
| `approve_reply` without the team check | 1 |
| Crashed jobs reclaimed forever (how it was before the review) | 1: the message was claimed a fourth time and never reached a person |
| A late worker allowed to finish a job that was taken over (how it was before the review) | 2: the late result was saved over the newer attempt, and over the attempt after a new draft |
| A reclaimed job keeps its old claim token | 1: the late worker's result was accepted |
| Signature without the team id (how it was before the review) | 1 unit test: a delivery signed for Tidebook was accepted for Harbor |
| Only the lowercase `</email>` neutralized (how it was before the review) | 1 unit test: `</EMAIL >` survived |

The last four rows, and the late worker after a new draft, were found by code reviews in separate Claude sessions. So was an open redirect after sign-in: the `?next=` check let `/\evil.example` through, which browsers treat as another site. My first fix still let `/.//evil.example` through, because the path is normalized after the check; a sixth review found that. The check now runs on the normalized path ([`lib/safe-next.ts`](lib/safe-next.ts)). They were real, and they are fixed.

## Triage quality

`npm run eval` runs a provider over the 12 sample emails and compares it with labels written by hand before the first run. It reports accuracy, flags, tokens, cost and latency, and writes [`docs/eval/`](docs/eval).

| Provider | Category | Priority | Must-escalate emails flagged | Flagged without need | Cost |
| --- | --- | --- | --- | --- | --- |
| Rules (offline) | 10 / 12 | 10 / 12 | 3 / 3 | 0 | $0 |

The rules provider is a stand-in so the app runs and the tests are free and deterministic. Its keyword lists were written while looking at these same 12 emails, so its score says nothing about new email. Twelve emails are also too few to compare models seriously; a real evaluation would use a few hundred of the client's own past tickets.

## Running with Claude

- **Tests:** everything in the Tests table runs against the rules provider and a mocked Claude client, so the suite is free and gives the same result every time.
- **With an API key:** put it in `.env.local`, and `npm run eval:claude` runs Claude over the 12 emails and writes its results to `docs/eval/` (about $0.20–0.30 at list price).

## Run it locally

Requirements and the local stack are the same as the other apps in this repository (Node 20+, Postgres 16, PostgREST 12, no Docker; see the root README).

```bash
cd apps/sorted
npm run db:reset        # schema + seed, writes .env.local with local keys (TRIAGE_PROVIDER=rules)
npm run stack           # PostgREST + auth gateway, leave running
npm run dev             # http://localhost:4360
npm run send-samples    # deliver the 12 fictional emails through the signed webhook
npm run worker          # optional: the cron stand-in, for retries
```

To use Claude, set `TRIAGE_PROVIDER=claude` and `ANTHROPIC_API_KEY=...` in `.env.local` (never committed).

Demo accounts (password `demo-password-123`, all fictional): `ana@tidebook.test` and `ben@tidebook.test` (Tidebook support), `cleo@harbor.test` (another team, sees nothing of Tidebook's).

## Known limits

- No real email sending. Approved replies go to the outbox table; wiring a provider (Postmark, SES) would be one function after `approve_reply`.
- One webhook secret for the whole app. A product would keep a secret per team and support rotating it.
- No attachments, threads or HTML email; the webhook accepts plain text.
- `npm audit --omit=dev` reports no vulnerabilities in what the app runs. The full `npm audit` lists moderate advisories in dev tooling only (Vitest's mocker, and `minimatch` under ESLint), which don't ship with the app (checked Nov 4, 2026).
- Tested against the local Supabase-compatible stack, not a hosted Supabase project.

## Screenshots

| | |
| --- | --- |
| ![Inbox sorted by priority](docs/screenshots/02-inbox.png) | ![An email that tries to instruct the AI, flagged](docs/screenshots/04-instruction-injection-flagged.png) |
| ![Approved after an edit, with the history](docs/screenshots/05-approved-with-history.png) | ![Outbox](docs/screenshots/06-outbox.png) |

Phone: [inbox](docs/screenshots/08-mobile-inbox.png) · [review](docs/screenshots/09-mobile-review.png) · Overview: [dashboard](docs/screenshots/07-dashboard.png)
