# Seed Scripts

## Overview

This directory contains seed scripts for populating the Supabase database with sample data for testing and development.

## Seed Users Script

The `seed-users.ts` script generates 15 sample users with complete profiles, meeting preferences, follow-up responses, and AI questionnaire answers.

### Prerequisites

1. **Environment Variables**: Make sure you have a `.env.local` file (or `.env`) with:
   ```
   NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
   SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
   ```

2. **Dependencies**: Install dependencies with `npm install`

### Usage

#### Seed Users
```bash
npm run seed:users
```

This will create 15 users. You can also specify a custom count:
```bash
npx tsx scripts/seed-users.ts 20
```

#### Wipe All Seed Data
```bash
npm run wipe:all
```

This will delete all users with `@seed-example.com` email addresses and their associated attendance records.

### What Gets Created

Each seeded user includes:

1. **Full Profile**:
   - First name, last name, email
   - Job title, company, years of experience
   - Expertise summary
   - Hobbies (array)

2. **Meeting Preferences** (1-5 randomly selected):
   - Connection types: `general`, `biz_opps`, `find_mentor`, `be_mentor`, `find_job`, `recruit`, `other`
   - Stored in `attendance.connection_types_selected`

3. **Follow-up Questions**:
   - Short conversational answers (1-3 sentences) for each selected connection type
   - Stored in `attendance.connection_followups_json`

4. **Free Responses**:
   - "Why attending" text
   - "Business need" text
   - Stored in `attendance.why_attending_text` and `attendance.business_need_text`

5. **AI Questionnaire**:
   - 3-4 multiple-choice questions answered randomly
   - Stored in `attendance.adaptive_qna_json`

### Safety Features

- **Safe to run multiple times**: Uses unique email addresses (`@seed-example.com`)
- **Easy cleanup**: All seeded users can be deleted with `npm run wipe:all`
- **Error handling**: Continues processing even if individual users fail
- **Event creation**: Automatically creates a test event if none exists

### Notes

- Seeded users are identified by email addresses ending with `@seed-example.com`
- The script uses the Supabase service role key to bypass RLS policies
- All users are associated with the same event (created automatically if needed)

