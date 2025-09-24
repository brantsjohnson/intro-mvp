# Intro - Conference Networking App

A mobile-first web app for conference networking with AI-powered matching, built with Next.js 14, TypeScript, TailwindCSS, and Supabase.

## Features

- **Authentication**: Google OAuth and email/password signup
- **Profile Setup**: Complete onboarding with photo upload, job details, and interests
- **Event Joining**: QR code scanning or manual event code entry
- **Smart Matching**: AI-powered recommendations based on career, personality, and interests
- **QR Connections**: Instant connections via QR code scanning
- **Presence System**: "I'm Here" toggle with real-time status
- **Messaging**: Direct messaging between attendees
- **Responsive Design**: Mobile-first with dark theme

## Tech Stack

- **Frontend**: Next.js 14 (App Router), TypeScript, React Server Components
- **Styling**: TailwindCSS, Shadcn/ui components, Lucide React icons
- **Backend**: Supabase (Auth, Postgres DB, Storage, Realtime)
- **AI**: OpenAI for matching algorithms
- **Email**: Resend for transactional emails
- **Deployment**: Vercel

## Setup Instructions

### 1. Environment Variables

Create a `.env.local` file in the root directory with the following variables:

```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url_here
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key_here
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key_here

# OpenAI
OPENAI_API_KEY=your_openai_api_key_here

# Admin
ADMIN_API_KEY=your_admin_api_key_here

# Email
RESEND_API_KEY=your_resend_api_key_here

# Owner
OWNER_EMAIL=your_owner_email_here
```

### 2. Supabase Setup

1. Create a new Supabase project
2. Run the SQL schema from `supabase-schema.sql` in your Supabase SQL editor
3. Enable Google OAuth in Authentication > Providers
4. Set up storage buckets for avatars and event headers

### 3. Install Dependencies

```bash
npm install
```

### 4. Run Development Server

```bash
npm run dev
```

The app will be available at `http://localhost:3000`.

## Project Structure

```
src/
├── app/                    # Next.js App Router pages
│   ├── auth/              # Authentication page
│   ├── onboarding/        # User onboarding flow
│   ├── home/              # Main dashboard
│   └── layout.tsx         # Root layout
├── components/            # React components
│   ├── auth/              # Authentication components
│   ├── onboarding/        # Onboarding components
│   ├── home/              # Home page components
│   └── ui/                # Reusable UI components
└── lib/                   # Utilities and configurations
    ├── supabase.ts        # Supabase client
    ├── types.ts           # TypeScript types
    └── utils.ts           # Utility functions
```

## Key Components

- **GradientButton**: Custom button with orange-to-red gradient
- **PresenceAvatar**: Avatar with optional green presence dot
- **MatchCard**: Card displaying match recommendations
- **QRCard**: QR code display and scanning interface
- **HobbiesGrid**: Interactive hobbies selection grid
- **EventJoinScanner**: QR scanner and manual code input

## Database Schema

The app uses the following main tables:
- `profiles`: User profile information
- `events`: Conference events
- `event_members`: User-event relationships
- `matches`: AI-generated match recommendations
- `connections`: User connections (QR or match-based)
- `messages`: Direct messages between users

## Deployment

The app is configured for Vercel deployment with:
- Automatic preview deployments for PRs
- Environment variable configuration
- Optimized build settings

## Next Steps

To complete the MVP, the following features need to be implemented:
1. Profile pages with AI-generated content
2. Messaging system with real-time updates
3. AI matching system with OpenAI integration
4. QR code generation and scanning
5. Email notifications

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## License
## AI Matching Priorities

Our North Star rule for matchmaking and profile insights:

- Career goals and networking objectives are the top filter. If one user’s goal can be answered by the other’s experience, expertise, or role, that is the strongest match. We lead the "Why You Two Should Meet" section with this alignment.
- After goals, we layer in:
  - Expertise & career context (complementary/parallel roles)
  - Interests & hobbies (icebreakers and activity ideas)
  - Personality (MBTI/Enneagram) as style guidance, not the lead

Implementation details:

- Prompts instruct the AI to open with goal alignment and to treat goal/objective alignment under the `career` basis in `matches.bases`.
- Fallback logic also prioritizes shared goals when present.

This project is proprietary and confidential.