# Homepage Design Essentials - Post-Onboarding Interface

## Overview
This document outlines the essential UI elements for the homepage interface that appears after a user completes onboarding and joins a conference event. The user is waiting for matches, can check in, and access settings.

---

## 1. HEADER SECTION

### Left Side:
- **User Avatar** (circular)
  - Shows user's profile photo or initials
  - Has a presence indicator (border/ring) showing if user is "present" at the event
  - Clickable - opens Settings page

### Center/Left of Center:
- **App Logo/Brand Name**: "INTRO" wordmark

### Right Side:
- **Messages Icon** (circular button)
  - Shows unread message count badge if messages exist
  - Clickable - opens Messages page

---

## 2. EVENT INFORMATION CARD

### Display:
- **Event Name** (large, prominent text)
- **Event Date & Time** (formatted: "January 15, 2024 @ 2:00 PM - 5:00 PM")
- **Event Location** (if available)

### Action Button:
- **"I'm Here" Button** (only shown if user hasn't checked in yet)
  - Large, prominent button
  - Clicking marks user as "present" at the event
  - Once clicked, button disappears and presence indicator shows on avatar

### Visual Separator:
- Horizontal line/divider between event info and check-in button

---

## 3. PEOPLE YOU SHOULD KNOW SECTION

### Section Header:
- Icon (Users/People icon)
- Title: "People You Should Know"

### Content States:

#### A. When Matchmaking is Disabled (Waiting State):
- **Icon**: Users icon (centered, larger)
- **Title**: "Waiting for matchmaking to begin"
- **Description**: "The event organizer will start the AI matchmaking process soon. Check back later for personalized introductions!"
- **Visual**: Three animated pulsing dots (loading indicator)

#### B. When Matchmaking is Enabled but No Matches Yet:
- **Icon**: Users icon
- **Title**: "No matches yet"
- **Description**: "Matche s will appear here once the event starts and matching is run."

#### C. When Matches Exist:
- **Match Cards** (up to 3 matches displayed)
  - Each card shows:
    - Match's profile photo or initials
    - Match's full name
    - Match's job title
    - Match's company
    - Presence indicator (if they're at the event)
    - AI-generated match summary text
    - "Why Meet" information
    - Clickable - opens match's profile page

---

## 4. ADD OTHER ATTENDEES SECTION

### Section Header:
- Icon (QR Code icon)
- Title: "Add other attendees"

### Content:
- **QR Code Card/Display**
  - Shows user's personal QR code (for others to scan)
  - Button/Icon to **Scan QR Code** (opens QR scanner camera)
  - Description text explaining: "Scan someone's QR code to connect, or share yours to be scanned"

---

## 5. YOUR CONNECTIONS SECTION

### Display Logic:
- Only shows if user has any connections

### Section Header:
- Icon (UserPlus icon)
- Title: "Your Connections"

### Content:
- **Connection List** (scrollable if many)
  - Each connection shows:
    - Connection's profile photo or initials
    - Connection's full name
    - Connection's job title and company
    - Connection source/reason ("QR Code Connection" or "AI Match")
    - Arrow icon indicating clickability
    - Clickable - opens connection's profile page

---

## 6. SETTINGS ACCESS

### Primary Access:
- **Header Avatar**: Clicking user's avatar in header opens Settings page

### Settings Page Contains:
- User profile information
- Ability to edit profile details (job title, company, location, etc.)
- Ability to change/update presence status
- Event switching (if user is in multiple events)
- Add new event option

---

## LAYOUT STRUCTURE

### Overall Layout:
1. **Header** (fixed/sticky at top)
2. **Main Content** (scrollable, max-width container):
   - Event Information Card
   - People You Should Know Section
   - Add Other Attendees Section
   - Your Connections Section (if applicable)

### Spacing:
- Consistent spacing between sections
- Cards have padding and visual separation
- Content is centered with max-width constraint

---

## ESSENTIAL INTERACTIONS

1. **Avatar Click** → Opens Settings page
2. **Messages Icon Click** → Opens Messages page (with event context)
3. **"I'm Here" Button Click** → Updates presence status, button disappears
4. **Match Card Click** → Opens match's profile page
5. **QR Scanner Button** → Opens camera QR scanner interface
6. **Connection Item Click** → Opens connection's profile page

---

## STATE HANDLING

### Loading State:
- Shows loading spinner while data is being fetched
- Displays "Loading..." text

### Error States:
- If profile not found: Shows "Please complete your profile setup" with button to onboarding
- If event not found: Shows appropriate empty state

### Empty States:
- No event: Shows welcome message and "Join an Event" button
- No matches: Shows appropriate waiting/empty message
- No connections: Section doesn't appear

---

## NOTES FOR DESIGNER

- **No colors specified** - use brand colors as appropriate
- **Hobbies not shown** - this is intentional as they're not part of the new onboarding flow
- **Responsive design** - should work on mobile and desktop
- **Accessibility** - ensure all interactive elements are properly labeled and keyboard navigable
- **Visual hierarchy** - Event info and matches should be most prominent
- **Consistent card styling** - all cards should have similar appearance/feel

---

## SIMPLIFIED CHECKLIST

Essential elements that must be present:
- [ ] Header with avatar, logo, and messages icon
- [ ] Event name, date/time, location display
- [ ] "I'm Here" check-in button (when not checked in)
- [ ] "People You Should Know" section with appropriate state (waiting/no matches/matches)
- [ ] "Add other attendees" section with QR code display and scanner
- [ ] "Your Connections" section (when connections exist)
- [ ] Settings page accessible via avatar click
- [ ] All interactive elements properly linked

