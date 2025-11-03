# Prompts to Recreate Sign-In in Loveable

These are copy-paste ready prompts to give to Loveable's AI to recreate the sign-in system.

---

## PROMPT 1: Create the Main Sign-In Page

```
Create a sign-in page at route /auth with the following:

1. A top hero section with:
   - Animated orange gradient background that shifts horizontally
   - Text "The Best Way to Network"
   - Large "INTRO" logo text with drop shadow effect using Changa One font
   - Orange gradient colors: #EC874E, #BF341E, #D2691E

2. Import and display an AuthForm component (will create next)
3. Centered max-width-md container

4. Footer text: "Contact us if you want to use INTRO at your event"

Use dark theme with charcoal background (#242424).
```

---

## PROMPT 2: Create the Auth Form Component

```
Create an AuthForm component with:

AUTHENTICATION METHODS:
1. Google OAuth button with Google logo
2. "OR" separator
3. Email/password form with Sign In / Sign Up toggle

STATE MANAGEMENT:
- Toggle between sign in and sign up modes
- Form fields: email, password, firstName (sign up only), lastName (sign up only)
- Checkbox for terms consent (sign up only)
- Loading state
- Track event code from URL params

FEATURES:
- Google sign in button uses Supabase OAuth with redirect to /auth/callback
- Email sign up creates account via Supabase, shows success message
- Email sign in authenticates via Supabase, redirects to /event/join if eventCode exists, otherwise to /
- Toast notifications for errors and success
- "Forgot password?" link (sign in only)
- Switch between "Sign in" and "Sign up" at bottom

STYLING:
- Dark card background (#242424)
- White "WELCOME!" heading
- Google button: white background, rounded-xl
- Gradient orange button for submit (linear-gradient to right: #EC874E to #BF341E)
- Input fields: dark gray background, rounded-xl borders
- Orange accent color for links

CONSENT CHECKBOX TEXT (for sign up):
"By signing up, I accept the Terms of Service and Privacy Policy. I understand that my name and image will be visible to event attendees and that OpenAI will be used for matching."

Links should go to /terms and /privacy respectively.
```

---

## PROMPT 3: Create Root Page with Routing Logic

```
Create a root page at route / that handles authentication routing:

LOGIC:
1. Check if user is authenticated with Supabase
2. If authenticated:
   - Check if user has completed onboarding (has profile with first_name, last_name, job_title, company)
   - Redirect to /home if onboarding complete
   - Redirect to /onboarding if incomplete
3. If not authenticated:
   - Show same sign-in page as /auth (with INTRO logo and AuthForm)

AUTH STATE LISTENING:
- Listen for auth state changes
- Automatically redirect when user logs in

LOADING STATES:
- Show loading spinner while checking auth
- Show loading spinner while redirecting

Include the same hero section as sign-in page with animated gradient.
```

---

## PROMPT 4: Create Event Join Scanner Component

```
Create an EventJoinScanner component for scanning QR codes and entering event codes:

SCANNER SECTION:
1. Large scan button with camera icon
2. When clicked, request camera access
3. Show video preview with QR scanner overlay
4. Scanning overlay with corner indicators
5. Stop scanning button
6. Error handling for camera permissions

MANUAL CODE SECTION:
1. "OR" divider
2. Input field for 5-character event code
3. Auto-uppercase and only allow A-Z 0-9
4. Join event button with arrow icon
5. Disabled until 5 characters entered

PROPS:
- onJoinEvent: function to call when event code is provided
- onScanQR: callback (can be empty)
- isLoading: boolean
- className: optional

FEATURES:
- Use @zxing/browser for QR scanning
- Parse QR codes that are URLs with ?code=ABC12 param
- Parse QR codes that are plain 5-character codes
- Cooldown on scans (1 second) to prevent duplicates
- Stop scanning button
- Processing state while handling scanned code

SCANNER UI:
- Video element with rounded-2xl borders
- 264x264 container
- Corner indicators on scanning frame
- "Position the QR code within the frame" text below

INTEGRATION:
- Create EventQRCodeService to handle parsing
- Supports URL format: https://app.com/event/join?code=ABC12
- Supports plain text format: ABC12
- Returns uppercase code

STYLING:
- Dark theme
- Rounded-2xl borders
- Gradient buttons (orange)
- Monospace font for code input
```

---

## PROMPT 5: Create Event Join Page

```
Create an event join page at route /event/join:

PAGE LOGIC:
1. Check if user is authenticated
2. If not authenticated:
   - Check for 'code' URL param
   - Redirect to /auth?eventCode=CODE if code exists
   - Redirect to /auth if no code
3. If authenticated and code exists:
   - Auto-join the event
   - Show loading spinner
   - On success, redirect to /onboarding with eventId param

EVENT JOINING:
1. Validate event exists and is active
2. Check if user already member
3. Add user to event_members table if not already member
4. On success, show toast
5. Redirect to /onboarding?from=event-join&eventId=EVENT_ID
6. On error, show toast

PAGE LAYOUT:
- Header with back button to /onboarding
- "JOIN EVENT" title
- Center-align content
- Card with EventJoinScanner component
- Loading state while checking auth
- Auto-joining state while joining event

Use createClientComponentClient from Supabase.
```

---

## PROMPT 6: Create OAuth Callback Handler

```
Create a server route at /auth/callback/route.ts:

LOGIC:
1. Get 'code' and 'eventCode' params from URL
2. Exchange OAuth code for session using Supabase
3. On success, check for eventCode param
4. Redirect to /event/join?code=EVENT_CODE if eventCode exists
5. Redirect to / (root) if no eventCode
6. Handle errors by redirecting to /auth with error param

Use createServerComponentClient from Supabase.
```

---

## PROMPT 7: Create Supabase Client Utilities

```
Create supabase.ts file in lib/ folder:

FUNCTION: createClientComponentClient()
- Uses @supabase/ssr createBrowserClient
- Needs NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY env vars
- Returns configured Supabase client for browser use
```

---

## PROMPT 8: Create UI Components

```
Create these UI components in components/ui/:

1. CARD COMPONENT:
   - Card wrapper with dark background
   - CardHeader, CardTitle, CardContent sub-components
   - Rounded-2xl borders
   - Shadow elevation

2. INPUT COMPONENT:
   - Dark background, rounded-2xl
   - Placeholder styling
   - Focus states with border color
   - Supports type, placeholder, value, onChange

3. CHECKBOX COMPONENT:
   - Uses Radix UI Checkbox primitive
   - Small square with check icon
   - Checked state styling
   - Supports checked, onCheckedChange props

4. LABEL COMPONENT:
   - Uses Radix UI Label
   - Text styling for forms
   - Links to input via htmlFor

5. GRADIENT BUTTON COMPONENT:
   - Variants: default, outline, icon
   - Gradient background (orange to red)
   - Rounded-2xl
   - Hover states
   - Disabled states
   - Icon support

6. TOAST/SONNER COMPONENT:
   - Use sonner library Toaster
   - Configured for dark theme
   - Needs to be in root layout

All components should use Tailwind CSS with rounded-2xl corners.
```

---

## PROMPT 9: Update Root Layout

```
Update the root layout to include:

1. Import Toaster from sonner
2. Add <Toaster /> component before closing body tag
3. Keep existing layout structure

This enables toast notifications throughout the app.
```

---

## PROMPT 10: Create Event QR Service

```
Create lib/event-qr-service.ts:

CLASS: EventQRCodeService

METHOD: parseEventQRCodeData(content: string): string | null
- Takes scanned QR code content
- Returns null if not parseable
- Parse 5-character codes: return uppercase if matches /^[A-Z0-9]{5}$/
- Parse URL with code param: extract ?code=ABC12, validate, return uppercase
- Parse JSON with eventCode field: extract eventCode, return uppercase
- Always return null if invalid

This service handles multiple QR code formats.
```

---

## PROMPT 11: Add Global Styles

```
Add to globals.css:

1. Import Changa One font from Google Fonts
2. Gradient animation keyframes:
   - gradientShift: background position animation
   - 8s ease infinite

3. Utility classes:
   - .animate-gradient: applies gradientShift animation
   - .gradient-primary: orange to red gradient background
   - .shadow-elevation: modern shadow styling

4. Color theme variables (dark):
   - --background: #242424
   - --foreground: #D9D9D9
   - --primary: #EC874E
   - --primary-foreground: #FFFFFF
   - --destructive: #BF341E
   - etc.

5. Typography scale
6. Touch target sizes

Use Tailwind CSS 4 syntax.
```

---

## PROMPT 12: Environment Setup

```
Add to .env.local:

NEXT_PUBLIC_SUPABASE_URL=your_supabase_project_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
```

---

## PROMPT 13: Install Dependencies

```
Install these npm packages:

@supabase/ssr
@supabase/supabase-js
@zxing/browser
@zxing/library
@radix-ui/react-checkbox
@radix-ui/react-label
@radix-ui/react-slot
class-variance-authority
clsx
tailwind-merge
lucide-react
sonner
next-themes
qrcode

Run: npm install [packages]
```

---

## SUMMARY: Quick Implementation Order

Use these prompts in order:

1. PROMPT 13 (Install dependencies)
2. PROMPT 7 (Supabase client)
3. PROMPT 8 (UI components)
4. PROMPT 11 (Global styles)
5. PROMPT 10 (Event QR service)
6. PROMPT 2 (Auth form component)
7. PROMPT 1 (Auth page)
8. PROMPT 6 (OAuth callback)
9. PROMPT 4 (Event scanner)
10. PROMPT 5 (Event join page)
11. PROMPT 3 (Root page with routing)
12. PROMPT 9 (Update layout)
13. PROMPT 12 (Environment variables)

This order ensures dependencies are available before use.
