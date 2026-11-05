# Acceptance check (SRS section 9)

Result of the check of AC-01 to AC-10, run in phase 6. "Evidence" is something you can run again.

| ID | Criterion | Result | Evidence |
|---|---|---|---|
| AC-01 | A customer books in under 60 s on a phone | **PASS** (automatic) | `node apps/web/scripts/booking-e2e.mjs` measures the whole booking at 360 px: **2.3 s (ar), 1.8 s (fr)**, limit 60 s. A robot is faster than a person: do one timed manual try too (see below). |
| AC-02 | Two customers booking the same slot at the same time: only one wins | **PASS** | `bookings.e2e.spec.ts` "double booking": 7 tests, including 2 and 20 parallel requests, overlapping slots, and "any employee" with 3 employees (exactly 3 win). The guarantee is a PostgreSQL exclusion constraint (`no_overlap`). |
| AC-03 | Slots do not show breaks, days off or existing bookings | **PASS** | `availability.engine.spec.ts` and the slot tests of `bookings.e2e.spec.ts`: 48 tests (hours, breaks, time off, closing days, buffer, notice, time zones). |
| AC-04 | Arabic interface fully RTL, no cut text, no wrongly flipped icon | **PASS** (automatic + screenshots) | `node apps/web/scripts/screenshots.mjs`: 14 screens × 3 widths (360, 768, 1280) in ar and fr, `dir=rtl` checked, **no horizontal overflow**. No `left/right` utility left in the components (logical `ms/me/ps/pe/start/end` only). Axe passes in ar. Screens were looked at one by one. |
| AC-05 | The AI proposes real slots and creates no booking without a click | **PASS** (fake model) / real model to confirm | `ai-chat.e2e.spec.ts` (17) and `ai-scenarios.e2e.spec.ts` (ar, fr, en: "a haircut tomorrow after 5 pm"): real slots only, a draft is not a booking, only the signed draft + click books. `node apps/web/scripts/ai-e2e.mjs` runs it in the browser (ar, fr). With a real key: `LIVE_GROQ=1 pnpm --filter api exec jest src/ai/ai-live`. |
| AC-06 | If Groq is down, the normal form still works | **PASS** | `ai-switch.e2e.spec.ts` and `ai-gateway.e2e.spec.ts` (timeout, retry, kill switch, no key, quota → clear error) and `ai-e2e.mjs`: the chat shows the fallback and the booking form still books. |
| AC-07 | A business cannot read another business's data | **PASS** | `security/routes.e2e.spec.ts` (all routes guarded or public, 401 without session, 403 for the wrong role) + isolation tests on every business table (`modules.e2e`, `tenant.e2e`, `phase5.e2e`, `admin.e2e`): 53 tests. |
| AC-08 | The Groq key is neither in the browser nor in git | **PASS** | `key-security.spec.ts` (6): no `gsk_...` key in any file tracked by git, the real key of your local `.env` is in no tracked file, `.env` files are ignored, the web source never reads a Groq variable, the built web bundle contains no key, and only the API reads it. `gitleaks` on the full history (all commits): **no leak**. A manual `git log -p` search for `gsk_`, `re_`, private keys: nothing. |
| AC-09 | A prompt injection ("ignore your rules...") is refused | **PASS** (fake obedient model) / real model to confirm | `ai-injection.e2e.spec.ts`: 14 attacks in ar, fr, en, a fake `system` role and a forged draft (18 tests). The server keeps its guarantees even if the model obeys. The real model's refusals are checked with `ai-live.spec.ts` and `docs/ai-conversations.md`. |
| AC-10 | Confirmation and reminder emails arrive on time | **PASS** (automatic) / **real mailbox: to do by you** | `notifications.e2e.spec.ts` (38 with the other notification tests): confirmation queued at once, reminder scheduled exactly 24 h before and removed on cancel or move, retries and `FAILED` status. Real delivery needs your Resend account: `pnpm --filter api build && pnpm --filter api mail:check you@example.com` sends the 3 email types (fr, ar, en) to a real inbox. |

**Score: 10/10 pass the automatic checks. Three checks still need something only you have:** a real Groq key
(AC-05, AC-09), a real mailbox with Resend (AC-10), and one timed manual booking (AC-01).

## What to do by hand
1. **AC-01:** open the public page on your phone, start a stopwatch, book a service. It should take well under 60 s.
2. **AC-05 / AC-09:** put a real `GROQ_API_KEY` in `apps/api/.env`, run `LIVE_GROQ=1 pnpm --filter api exec jest src/ai/ai-live`
   and try the scenarios in `docs/ai-conversations.md` in the browser (ar, fr, en).
3. **AC-10:** set `RESEND_API_KEY` and `MAIL_FROM` (a verified domain), run `mail:check`, look in the inbox and the
   spam folder, and note how long the emails take to arrive.

## Run everything again
```bash
pnpm lint && pnpm typecheck && pnpm test          # unit + integration, about 290 tests
bash scripts/e2e-ci.sh                             # all browser tests on a fresh build (AC-01, AC-04, AC-05, AC-06...)
                                                   # also runs in CI (job "e2e")
```
