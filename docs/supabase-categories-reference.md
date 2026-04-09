# Supabase categories & taxonomies — reference

This document lists **enumerated or convention-based values** stored in Supabase (or derived into it) that behave like “categories”: what they mean, **canonical string forms**, and **where the codebase depends on them**. Use it when renaming values or tightening schemas so you know what to update and how to migrate data.

For generated TypeScript table shapes, see `src/lib/database.types.ts`.

---

## 1. Connection types (`attendance.connection_types_selected`)

**Purpose:** What the attendee wants from the event (multi-select). Stored as **snake_case** strings in the database.

**Canonical DB values (store these):**

| DB value | Typical meaning |
|----------|-----------------|
| `general` | Broad networking / hobbies-focused follow-ups |
| `biz_opps` | Business opportunities, partnerships, clients |
| `find_mentor` | Seeking mentorship |
| `be_mentor` | Offering mentorship |
| `find_job` | Job seeking |
| `recruit` | Hiring |
| `join_startup` | Joining a startup (UI-only label maps here) |
| `other` | Catch-all; custom follow-up |

**UI ↔ DB mapping** (hyphenated IDs in the app vs underscores in DB):

- File: `src/components/onboarding/new-onboarding-flow.tsx` — `mapConnectionTypeToDB` / `mapConnectionTypeFromDB`
- `business-opportunities` ↔ `biz_opps`, `find-mentor` ↔ `find_mentor`, etc.; `join-startup` ↔ `join_startup`

**Sponsor portal:** `attendance.is_sponsor` (boolean) gates **`/sponsor`**. Phase D adds **`sponsor_profiles`**, **`sponsor_leads`**, **`sponsor_interaction_events`**, and view **`sponsor_signal_outcomes`** (see migration `supabase/migrations/20260409_phase_d_sponsor_intelligence.sql`). Insights still read §1–§5 fields on non-sponsor attendees via [`GET /api/sponsor/event-insights`](src/app/api/sponsor/event-insights/route.ts). Outreach and ROI use [`/api/sponsor/outreach`](src/app/api/sponsor/outreach/route.ts) and [`/api/sponsor/roi-summary`](src/app/api/sponsor/roi-summary/route.ts).

**Downstream logic (if you rename a DB value, update these):**

| Area | File / location | What it does |
|------|-----------------|--------------|
| Tag derivation for event profile | `src/app/api/derive-attendance/route.ts` | Maps types to `event_offer_tags`, `event_want_tags`, `event_goals_tags`, role intent, availability |
| Seed / test data | `scripts/seed-users.ts` | `CONNECTION_TYPES`, `FOLLOW_UP_QUESTIONS` keys, `deriveDataForUser` branches |
| Matchmaking | `supabase/functions/matchmaker/index.ts` | Connection-type sets, want-kind mapping, scoring, explanations |
| Follow-up questions | `src/components/onboarding/new-onboarding-flow.tsx` | `getFollowUpQuestion` per type |
| Question contexts | `supabase/functions/question-engine/index.ts` | `switch` on connection type |
| Match explanations (client) | `src/lib/matching/explain.ts` | Slug sets like `biz_opps`, `find_job`, `recruit` |
| Match explanations (edge) | `supabase/functions/generate-match-explanations/index.ts` | Same slug patterns + `connection_followups_json` keys |

**Follow-up JSON keys:** Responses are keyed by **UI id** (e.g. `biz_opps`, `find_mentor`) or normalized variants — see `getFollowUpQuestion` and explain helpers. Renaming types requires aligning **DB values**, **UI ids**, and **keys inside `connection_followups_json`**.

---

## 2. Connection kinds (`connections.connection_kind`)

**Purpose:** Distinguishes how a row in `connections` was created and how the UI should treat it.

**Values used in code:**

| Value | Role |
|-------|------|
| `system_match` | Algorithm-suggested match; primary target for rematch/delete-match scripts |
| `user_added` | Explicit connect (e.g. QR) |
| `user_request_pending` | Pending connection request (messages / home flow) |
| `sponsor_outreach` | Sponsor-initiated outreach from `/sponsor` — row created when sponsor sends first message via [`POST /api/sponsor/outreach`](src/app/api/sponsor/outreach/route.ts) (`a_id` = sponsor, `b_id` = attendee) |

**Where used:**

- Match pipelines, notifications, surveys: filter `.eq('connection_kind', 'system_match')` in `src/app/api/*/route.ts`, `scripts/*.ts`, `supabase/functions/matchmaker/index.ts`
- UI: `src/components/home/home-page.tsx`, `src/components/profile/user-profile.tsx`, `src/components/messages/messages-page.tsx`, `conversation-view.tsx`
- Sponsor portal: `src/app/api/sponsor/outreach/route.ts` inserts `sponsor_outreach` alongside `conversations` / `messages`
- Explanation refresh allowlists: `supabase/functions/generate-match-explanations/index.ts`, `src/lib/matching/refresh-explanations.ts`

**If you add or rename a kind:** update every query that assumes only `system_match` vs `user_added`, RLS if any, and the allowlists in the two explanation modules above.

---

## 3. User add methods (`connections.user_add_method`)

**Purpose:** How the user relationship was advanced after the row existed (QR scan, directory, “met”, messaging, etc.). Nullable.

**Values referenced in the app:**

- `qr`, `manual_add`, `manual_directory`, `met`, `manual_message` (and null for “no interaction yet”)

**Where used:** `src/components/home/home-page.tsx` (connection list / source labeling), `src/components/profile/user-profile.tsx`, `src/app/api/survey/[token]/route.ts`, `src/app/api/survey/test/route.ts`, `src/app/api/connect-qr/route.ts`, `src/components/messages/conversation-view.tsx`

Renaming these affects analytics-style “source” strings and survey eligibility logic.

---

## 4. Industry tags — two different systems (important)

Industry-like data appears in **`users.industry_tags`**, **`attendance.event_industry_tags`**, and **AI-only** pipelines. There are **two taxonomies** today:

### 4a. SQL trigger (`derive_industry_tags`)

- **Definition:** `supabase/migrations/20250101_derive_industry_tags.sql` — function `derive_industry_tags`, trigger `trigger_update_industry_tags` on `users`
- **Behavior:** Keyword/regex extraction from `company_summary`, `company_name`, `company_url`; merges with existing `industry_tags` on insert/update
- **Example tags emitted:** `legal`, `fintech`, `healthcare`, `education`, `retail`, `sports`, `food`, `real_estate`, `travel`, `manufacturing`, `logistics`, `telecom`, `saas`, `marketing`, `gaming`, `entertainment`, `media`, `consulting`, `accounting` (see the migration for the full set of rules)

### 4b. Approved AI taxonomy (OpenAI prompts)

- **Definition:** Duplicated lists in:
  - `supabase/functions/update-industry-tags/index.ts` — `validTags`
  - `supabase/functions/fetch-company-metadata/index.ts` — same `validTags` array
- **Behavior:** Model must only return tags from this list (snake_case): `fintech`, `banking`, `payments`, `saas`, `healthtech`, `edtech`, `legaltech`, etc. (full list in those files)

**Mismatch risk:** Rows may contain **SQL-derived** tags (e.g. `healthcare`, `legal`) **and/or** **AI taxonomy** tags (e.g. `healthtech`, `legaltech`) depending on code path and history. Matching, metrics, and copy should not assume a single vocabulary until you normalize.

**Other industry-related usage:**

- `src/lib/networking-metrics.ts` — reads `industry_tags` / `event_industry_tags` for event metrics
- `src/app/api/classify-company-industry/route.ts` — single industry **name** string (not the tag array)
- `company_industries` table — `industry` TEXT per company name (`supabase/migrations/20250115_create_company_industries.sql`)

---

## 5. Profile & event tags (open vocabulary)

These columns are **`text[]`** with **no fixed enum in the DB**; values are produced by derivation and embeddings.

| Column(s) | Role |
|-----------|------|
| `users.offer_tags`, `want_tags`, `need_tags`, `career_goals_tags`, `industry_tags`, `hobby_tags` | Stable profile + matching inputs |
| `attendance.event_*` mirrors | Event-scoped copies: `event_offer_tags`, `event_want_tags`, `event_need_tags`, `event_industry_tags`, `event_hobby_tags`, `event_goals_tags` |

**Primary derivation:** `src/app/api/derive-attendance/route.ts` — builds tags from connection types, expertise text, follow-ups, etc.; normalizes with `normalizeTags` / `extractKeywordTags`.

**Merge into matchmaking:** `supabase/functions/matchmaker/index.ts` — `mergeUnique(user.*, attendance.event_*)` for each tag list.

If you change **tag strings** produced by derive-attendance (e.g. `job_opportunities` → something else), update **matchmaker** expectations, **explain** slug sets in `src/lib/matching/explain.ts`, and any **tests/scripts** that assert tag content.

---

## 6. Derived “role” and availability fields

Stored on **`users`** (`engagement_availability_status`, `collaboration_role_intent`) and **`attendance`** (`event_availability_status`, `event_role_intent`).

**Derived in** `src/app/api/derive-attendance/route.ts` (from connection types):

- `roleIntent`: e.g. `job_seeker`, `recruiter`, `mentor`, default `general`
- `availabilityStatus`: e.g. `actively_building` when job-seeking, else often `open`

**Consumed in** `supabase/functions/matchmaker/index.ts` as `roleIntent` / `availabilityStatus` on the merged profile.

**If you rename these strings:** update derive-attendance and any matchmaker branches that compare them (search `roleIntent` / `availabilityStatus` in the matchmaker file).

---

## 7. Matchmaker-internal “want kinds” (not DB columns)

**Type:** `WantKind` in `supabase/functions/matchmaker/index.ts` — used for scoring logic (`find_job`, `find_talent`, `find_clients`, …).

These are **internal enums** derived from tags/text, not raw Supabase columns. Changing them requires edits inside the matchmaker only, but **connection type → tag** mapping in derive-attendance still feeds the pipeline.

---

## 8. Change checklist (quick)

When you rename or add a **category-like** value:

1. **Database:** migration for any CHECK constraints; backfill existing rows if needed.
2. **Onboarding:** `new-onboarding-flow.tsx` mappings and follow-up keys.
3. **Derivation:** `derive-attendance/route.ts` for new tag/role outputs.
4. **Edge functions:** `matchmaker`, `question-engine`, `generate-match-explanations`, `update-industry-tags` / `fetch-company-metadata` as applicable.
5. **Client libs:** `src/lib/matching/explain.ts`, `refresh-explanations.ts`.
6. **Scripts:** `scripts/seed-users.ts` and any `scripts/check-*.ts` / `verify-*.ts`.
7. **Tests / manual flows:** rematch, QR connect, survey connection counts.
8. **Platform admin metrics:** `src/lib/platform-admin-metrics.ts`, `GET /api/platform-admin/event-health` — keep filters in sync with §1–3 and §9.

---

## 9. Platform admin metrics (dashboards)

Used by **`src/lib/platform-admin-metrics.ts`** and the Event health panel on **`/admin/event/[eventId]`**. If you change category semantics in §1–3, update this module and any SQL/PostgREST queries in the same change.

| Metric | Doc section | Rule |
|--------|-------------|------|
| `system_match_count` | §2 `connections.connection_kind` | Count rows where `connection_kind = 'system_match'` (algorithm matches only). |
| `connections_by_kind` | §2 | Group/count all `connection_kind` values for the event (transparent breakdown). |
| `connections_by_user_add_method` | §3 `connections.user_add_method` | Count non-null `user_add_method` values (QR, `met`, `manual_directory`, etc.). |
| `connection_types_selected_counts` | §1 `attendance.connection_types_selected` | Flatten snake_case DB values across attendance rows (e.g. `biz_opps`, `find_mentor`). |
| Industry or tag rollups | §4–5 | Not surfaced in Phase A; do not assume a single tag vocabulary without normalization. |

The **organizer** read-only dashboard (`/organizer`, `GET /api/organizer/event-health`) reuses the same §1–§3 semantics for connection health; match pair listings filter **`connection_kind = 'system_match'`** and read stable `connections` columns (`a_id`, `b_id`, `match_score`, `match_algorithm_version`, `created_at`).

The **sponsor** read-only dashboard (`/sponsor`, `GET /api/sponsor/event-insights`) aggregates §1 `connection_types_selected` and §5 `event_need_tags` / `event_want_tags` / `business_need_text` over **non-sponsor** attendance rows; **`GET /api/sponsor/my-matches`** filters the same **`system_match`** semantics for rows involving the sponsor user.

---

## 10. File index (definitions)

| Topic | Primary definition location |
|-------|----------------------------|
| Connection types (UI + DB map) | `src/components/onboarding/new-onboarding-flow.tsx` |
| Connection types (seed list) | `scripts/seed-users.ts` |
| `derive_industry_tags` (SQL) | `supabase/migrations/20250101_derive_industry_tags.sql` |
| AI industry taxonomy | `supabase/functions/update-industry-tags/index.ts`, `fetch-company-metadata/index.ts` |
| Attendance derivation | `src/app/api/derive-attendance/route.ts` |
| Matchmaking | `supabase/functions/matchmaker/index.ts` |
| Connection kind filters | grep `connection_kind` under `src/`, `scripts/`, `supabase/functions/` |
| Platform admin Event health aggregates | `src/lib/platform-admin-metrics.ts`, `src/app/api/platform-admin/event-health/route.ts` |
| Organizer read-only aggregates | `src/lib/organizer-metrics.ts`, `src/app/api/organizer/*` |
| Sponsor portal (auth + intelligence) | `src/lib/sponsor-auth.ts`, `src/lib/sponsor-intelligence.ts`, `src/lib/sponsor-outreach-db.ts`, `src/app/api/sponsor/*` |

---

*Last reviewed: generated from codebase snapshot; re-run a quick grep on the symbols above after large refactors to keep this doc accurate.*
