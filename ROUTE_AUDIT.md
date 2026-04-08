# Route Audit - All Application Paths

## Main User-Facing Routes

### `/` (Root)
**What it does:** By default, **`next.config.ts` rewrites** this to **`/marketing/index.html`** (public marketing site). The **Next.js app does not render** at `/` unless:

- **`src/proxy.ts`** intercepts: OAuth `?code=` / `?state=` on `/` → redirect to **`/auth/callback`**; authenticated user on `/` → **`/onboarding`**; or  
- The **inline script** in **`public/marketing/index.html`** performs the same redirects if the request still hits the static file.

**What it records:** Marketing page only (no app DB access on `/` itself).

**See also:** `docs/APP-ROUTING-FLOW.md` for the full marketing vs app map and post–sign-in path.

---

### `/auth`
**What it does:** Displays authentication form for email/Google/LinkedIn sign-in and handles OAuth redirects.

**What it records:** No direct recording - authentication handled by Supabase Auth (creates `auth.users` entry via trigger to `users` table).

---

### `/auth/callback`
**What it does:** OAuth callback handler that exchanges auth code for session and redirects based on URL parameters (encrypted code, event code, or main page).

**What it records:** Upserts user metadata to `users` table (`user_id`, `email`, `first_name`, `last_name`, `photo_url`, `linkedin_raw_json`) from OAuth provider data.

---

### `/home`
**What it does:** Main application dashboard showing top 3 AI matches, QR scanner for connections, directory of attendees, event info, and allows joining events via 6-digit code when no event is selected.

**What it records:** 
- Reads: `users`, `attendance`, `connections`, `events`, `conversations` tables
- Writes: `attendance` table (when joining event - `event_id`, `user_id`, `checked_in_at`)
- Writes: `attendance` table (when toggling presence - `checked_in_at`, `last_seen_at`)
- Writes: `connections` table (when adding from directory - `connection_kind: user_request_pending`, `user_add_method: manual_directory`)
- Writes: `connections` table (when confirming/denying manual connections - updates `connection_kind`)

**Note:** Also handles auto-join via encrypted code in query param `?code={encryptedCode}` which inserts into `attendance` table.

---

### `/onboarding`
**What it does:** Multi-step onboarding flow collecting profile information (name, photo, job title, company, expertise, hobbies) and event-specific questions (why attending, connection types, follow-up responses, business need).

**What it records:**
- **Profile completion:** Upserts to `users` table (`user_id`, `first_name`, `last_name`, `photo_url`, `career_title`, `company_name`, `company_url`, `company_summary`, `career_years_experience`, `expertise_summary`, `hobbies`)
- **Event onboarding:** Upserts to `attendance` table (`event_id`, `user_id`, `why_attending_text`, `connection_types_selected`, `connection_followups_json`, `business_need_text`, `onboarding_completed: true`)
- **Background processing:** Triggers `/api/derive-attendance` which generates embeddings, tags, summaries

---

### `/join/[code]`
**What it does:** Handles encrypted event codes - decrypts code, checks auth and profile status, then redirects to appropriate page (auth if not logged in, onboarding if profile incomplete, or home with auto-join if complete).

**What it records:** No direct recording - only routing logic based on encrypted code parameter.

---

### `/event/join`
**What it does:** Event join page allowing users to scan QR codes or manually enter 6-digit event codes to join events (legacy unencrypted flow).

**What it records:**
- Writes: `attendance` table (`event_id`, `user_id`, `checked_in_at`) when joining an event
- Background: Triggers `/api/refresh-matches` for new user

---

### `/messages`
**What it does:** Displays list of message conversations for the current event.

**What it records:** Reads from `conversations` and `messages` tables - no direct writes (messages sent via API).

---

### `/messages/conversation`
**What it does:** Individual conversation view showing message thread between users.

**What it records:** 
- Reads: `conversations`, `messages` tables
- Writes: `messages` table (via API route `/api/messages/send`) - records message content, sender, conversation ID
- Writes: `connections` table (when messaging - creates `connection_kind: user_added`, `user_add_method: met`)

---

### `/profile/[userId]`
**What it does:** Displays user profile page showing match details, profile information, hobbies, and allows QR scanning or messaging.

**What it records:**
- Reads: `users`, `attendance`, `connections` tables
- Writes: `connections` table (when user clicks "Yes, we met" - creates `connection_kind: user_added`, `user_add_method: met`)
- Writes: `connections` table (when scanning QR code - creates `connection_kind: user_added`, `user_add_method: qr`)

---

### `/settings`
**What it does:** User settings page allowing profile updates (company, job title), event switching, business need updates, presence toggling, and logout.

**What it records:**
- Writes: `users` table (updates `company_name`, `career_title`)
- Writes: `attendance` table (updates `checked_in_at`, `last_seen_at` for presence toggle)
- Writes: `attendance` table (updates `business_need_text`, `last_profile_change_at`, `updated_at`)
- Background: Triggers `/api/derive-attendance` and `/api/refresh-matches` after business need updates

---

### `/survey/[token]`
**What it does:** Post-event survey page collecting ratings (custom organizer question, fixed questions about app usefulness and business likelihood) and selecting beneficial connections.

**What it records:** Writes to survey-related tables (likely `event_surveys` or similar) with ratings (`ratingCustom`, `ratingUseful`, `ratingBusiness`) and selected connection user IDs.

---

### `/privacy`
**What it does:** Static privacy policy page displaying data collection and usage information.

**What it records:** No data recording - read-only informational page.

---

### `/terms`
**What it does:** Static terms of service page displaying usage terms and conditions.

**What it records:** No data recording - read-only informational page.

---

## Admin Routes

**Access control (Phase A):** All `/admin/**` pages require a **platform admin** session (`PLATFORM_ADMIN_USER_IDS` env and/or `platform_admins` table). APIs used for event CRUD, matching, networking cards, and `GET /api/platform-admin/event-health` use the same check; see `docs/APP-ROUTING-FLOW.md`.

### `/admin/create-event`
**What it does:** Admin page for creating new events and viewing/list managing all events with QR codes and join links.

**What it records:**
- Writes: `events` table (creates event with `event_code`, `event_name`, `event_location`, `event_starts_at`, `event_ends_at`)
- Writes: `events` table (updates event name, location, dates via inline editing)

---

### `/admin/event`
**What it does:** Admin page displaying list of all events in a card grid layout.

**What it records:** Reads from `events` table - no writes (redirects to detail/edit page).

---

### `/admin/event/[eventId]`
**What it does:** Admin event detail/edit page for configuring onboarding questions, matching settings, event logo, survey questions, and triggering matching/networking cards.

**What it records:**
- Writes: `events` table (updates `event_name`, `onboarding_question_schema`, `matching_config` including `logo_url`, `survey_question`, `show_refresh_button`)
- Writes: Storage bucket `event-assets` (uploads event logos)
- Background: Triggers `/api/admin-start-matching` which creates `connections` records with `connection_kind: system_match`
- Background: Triggers `/api/admin-send-networking-cards` which sends emails

---

## Organizer routes (Phase B, read-only)

**Access control:** User must be in `event_organizers` for the event, or in `organizer_memberships` for the event’s `organization_id`. See `docs/APP-ROUTING-FLOW.md`.

### `/organizer`
**What it does:** Lists events the signed-in user may view as an organizer.

**What it records:** No writes — reads via server helper scoped to `event_organizers` + `organizer_memberships`.

---

### `/organizer/event/[eventId]`
**What it does:** Read-only dashboard: attendance summary, business-need buckets, connection breakdowns (same category semantics as platform Event health), paginated attendee roster, paginated `system_match` pair table.

**What it records:** No writes — client fetches `GET /api/organizer/*`.

---

## Duplicate/Similar Paths

### Event Joining Paths (3 different entry points):
1. **`/join/[code]`** - Uses encrypted event codes, handles auth/profile routing
2. **`/event/join`** - Legacy unencrypted event code entry (QR scan or manual input)
3. **`/home`** - Has built-in 6-digit code input when no event selected

**Note:** All three ultimately insert into `attendance` table with same structure, but routing logic differs.

---

## API Routes (Summary)

### `/api/create-event`
**What it records:** Creates entry in `events` table  
**Auth:** Platform admin only (`GET` lists events; `POST` creates).

### `/api/update-event`
**What it records:** Updates `events` table (name, location, dates)  
**Auth:** Platform admin only.

### `/api/platform-admin/event-health`
**What it does:** Read-only JSON aggregates for one event (attendance count, `system_match` count, `connections_by_kind`, `user_add_method` breakdown, `connection_types_selected` counts). Filters follow `docs/supabase-categories-reference.md` §1–3.  
**Auth:** Platform admin only.

### `/api/platform-admin/event-organizers`
**What it does:** `GET` lists organizers + eligible attendees for an event; `POST` inserts `event_organizers`; `DELETE` removes a row. Used by the **Organizer portal** card on `/admin/event/[eventId]`.  
**Auth:** Platform admin only.

### `/api/refresh-matches`
**What it records:** Triggers matching which creates `connections` with `connection_kind: system_match`

### `/api/match-incremental`
**What it records:** Creates incremental matches in `connections` table

### `/api/derive-attendance`
**What it records:** Updates `attendance` table with AI-generated embeddings, tags, summaries

### `/api/admin-start-matching`
**What it records:** Creates `connections` records for all users in event  
**Auth:** Platform admin only.

### `/api/admin-send-networking-cards`
**What it records:** No DB writes - sends emails with networking summaries  
**Auth:** Platform admin only.

### `/api/organizer/events`
**What it does:** Lists events the user can access as organizer.  
**Auth:** Logged-in user with `event_organizers` / `organizer_memberships` scope.

### `/api/organizer/event-health`
**What it does:** Same aggregates as [`src/lib/platform-admin-metrics.ts`](src/lib/platform-admin-metrics.ts) for one event.  
**Auth:** Organizer scoped to `eventId`.

### `/api/organizer/attendance-summary`
**What it does:** Read-only counts and grouped `business_need_text` buckets from `attendance`.  
**Auth:** Organizer scoped to `eventId`.

### `/api/organizer/attendance-roster`
**What it does:** Paginated roster: attendee + `users` name/email + onboarding + business need preview.  
**Auth:** Organizer scoped to `eventId`.

### `/api/organizer/matches-summary`
**What it does:** `system_match` counts, distinct users touched, `match_algorithm_version` distribution.  
**Auth:** Organizer scoped to `eventId`.

### `/api/organizer/matches-table`
**What it does:** Paginated `connections` where `connection_kind = system_match`, with display names for `a_id` / `b_id`.  
**Auth:** Organizer scoped to `eventId`.

### `/api/messages/send`
**What it records:** Creates entry in `messages` table

### `/api/survey/[token]`
**What it records:** Reads survey config, writes survey responses

### `/api/connect-qr`
**What it records:** Creates `connections` with `user_add_method: qr`

### `/api/save-phone-number`
**What it records:** Updates `users` table with phone number

### `/api/send-match-notification`
**What it records:** No DB writes - sends email notifications

---

## Summary of Tables Written To

1. **`users`** - Profile data (name, photo, company, job title, expertise, hobbies)
2. **`attendance`** - Event membership and onboarding responses (why attending, connection types, business need, presence status)
3. **`connections`** - User connections (system matches, QR scans, manual adds, meeting confirmations)
4. **`messages`** - Message content
5. **`conversations`** - Conversation metadata
6. **`events`** - Event configuration and settings
7. **Survey tables** - Survey responses (exact table name not confirmed in codebase)
8. **Storage buckets** - `avatars` (user photos), `event-assets` (event logos)


