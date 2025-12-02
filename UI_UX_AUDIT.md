# UI/UX Design System Audit

**Date**: December 2024  
**Theme**: Light Mode - Warm Paper  
**Status**: Current Production State

## Color Palette

### Core Colors
- **Background (Primary)**: `#E0DFDC` (warm paper/beige)
- **Foreground (Text)**: `#111111` (near-black)
- **Card Background**: `#F2F2F2` (light gray)
- **Card Foreground**: `#111111` (dark text)
- **Popover Background**: `#F2F2F2` (light gray)
- **Popover Foreground**: `#111111` (dark text)

### Border & Input Colors
- **Border**: `#E0E0DD` (light gray-beige)
- **Input Background**: `#F2F2F2` (light gray)
- **Ring (Focus)**: `rgba(156, 76, 5, 0.25)` (ember-tinted, 25% opacity)

### Text Colors
- **Primary Text**: `#111111` (foreground - near-black)
- **Muted Text**: `#777777` (muted-foreground - medium gray)
- **Muted Background**: `#F7F7F6` (very light gray)

### Button Colors
- **Primary Button**: 
  - Background: `#111111` (solid dark)
  - Text: `#F7F7F6` (primary-foreground - off-white)
  - Hover: 90% opacity
  - Shadow: `shadow-card` (light shadow)
- **Secondary Button**: 
  - Background: `#F7F7F6` (muted)
  - Border: `#E0E0DD` (border)
  - Text: `#111111` (foreground)
  - Hover: 80% opacity
- **Destructive Button**: 
  - Background: `#BF341E` (red)
  - Text: `#FFFFFF` (white via destructive-foreground)
  - Hover: 90% opacity
- **Outline Button**: 
  - Border: `#E0E0DD` (border)
  - Background: `#F2F2F2` (card)
  - Text: `#111111` (foreground)
  - Hover: 80% opacity
- **Ghost Button**: 
  - Background: Transparent
  - Text: `#111111` (foreground)
  - Hover: `#F2F2F2` at 50% opacity

### Accent Colors
- **Accent (Warm Ember)**: `#9C4C05` (orange-brown)
- **Accent Foreground**: `#F7F7F6` (off-white)
- **Accent Gradient**: Linear gradient from `#9C4C05` to `#6E3303`

### Chart Colors
- Chart 1: `#1A2C24` (dark green)
- Chart 2: `#9C4C05` (accent orange)
- Chart 3: `#4B915A` (success green)
- Chart 4: `#0B3E16` (dark green)
- Chart 5: `#777777` (muted gray)

### OAuth Button Colors
- **LinkedIn Button**: 
  - Background: `#0A66C2` (LinkedIn blue)
  - Hover: `#084b8a` (darker blue)
  - Text: White
- **Google Button**: 
  - Background: White (`#FFFFFF`)
  - Text: `#1F2937` (slate-900)
  - Hover: `#F9FAFB` (gray-50)

## Typography

### Font Families
- **Primary**: Inter (via `--font-inter`), fallback to system fonts (-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif)
- **Display**: Changa One (Google Fonts) - used for "INTRO" logo text

### Font Sizes
- **xs**: 12px / 16px line-height
- **sm**: 14px / 20px line-height
- **base**: 16px / 24px line-height (mobile), 14px / 20px (desktop md:)
- **lg**: 20px / 28px line-height
- **xl**: 24px / 32px line-height
- **2xl**: 28px / 36px line-height

### Font Weights
- Regular: 400
- Medium: 500
- Semibold: 600
- Bold: 700

### Logo Typography
- **INTRO Logo**: Changa One font
- **Size**: Responsive from `text-[64px]` (mobile) to `text-[144px]` (xl screens)
- **Shadow Effect**: Accent color (`#9C4C05`) offset shadow at `top-[6px]` with foreground color on top

## Border Radius

- **Base Radius**: `1rem` (16px) - equivalent to `rounded-2xl`
- **Small**: `calc(var(--radius) - 4px)` = 12px
- **Medium**: `calc(var(--radius) - 2px)` = 14px
- **Large**: `1rem` (16px)
- **XL**: `calc(var(--radius) + 4px)` = 20px

### Component-Specific Radius
- **Buttons**: `rounded-2xl` (16px)
- **Cards**: `rounded-2xl` (16px)
- **Inputs**: `rounded-2xl` (16px)
- **Textareas**: `rounded-md` (6px)
- **Select**: `rounded-md` (6px)
- **Checkbox**: `rounded-[4px]` (4px)
- **Dialog**: `rounded-lg` (8px)
- **Dropdown**: `rounded-md` (6px)
- **Tabs**: `rounded-lg` (8px) for container, `rounded-md` (6px) for items

## Shadows

- **Card Shadow**: `0 2px 4px rgba(0,0,0,0.06), 0 6px 18px rgba(0,0,0,0.04)` (shadow-card)
- **Soft Shadow**: `0 8px 24px rgba(0, 0, 0, 0.06)` (shadow-soft)
- **Modern Shadow**: Same as card shadow
- **Elevation Shadow**: Same as card shadow
- **Dialog Shadow**: `shadow-lg` (Tailwind default - heavier shadow)
- **Shadow Color**: `rgba(0, 0, 0, 0.1)` (10% black)

## Buttons

### Standard Button (`Button` component)
**Base Styles:**
- Border radius: `rounded-2xl` (16px)
- Font: `text-sm font-medium`
- Transition: `transition-all`
- Focus ring: `ring-primary/20 ring-1`
- Minimum touch target: 44px × 44px (via touch-target class)

**Variants:**
1. **Default (Primary)**
   - Background: `gradient-primary` (solid `#111111`)
   - Text: `text-primary-foreground` (`#F7F7F6`)
   - Hover: `hover:opacity-90`
   - No shadow on standard button

2. **Destructive**
   - Background: `bg-destructive` (`#BF341E`)
   - Text: `text-destructive-foreground` (white)
   - Hover: `hover:bg-destructive/90`
   - Focus ring: `ring-destructive/20`

3. **Outline**
   - Border: `border border-border` (`#E0E0DD`)
   - Background: `bg-card` (`#F2F2F2`)
   - Text: `text-foreground` (`#111111`)
   - Hover: `hover:bg-card/80 hover:text-foreground`

4. **Secondary**
   - Background: `bg-card` (`#F2F2F2`)
   - Border: `border border-border` (`#E0E0DD`)
   - Text: `text-foreground` (`#111111`)
   - Hover: `hover:bg-card/80`

5. **Ghost**
   - Background: Transparent
   - Text: `text-foreground` (`#111111`)
   - Hover: `hover:bg-card/50 hover:text-foreground`

6. **Link**
   - Text: `text-primary` (uses primary color `#111111`)
   - Underline: `underline-offset-4 hover:underline`

**Sizes:**
- **default**: `h-10 px-4 py-2` (40px height)
- **sm**: `h-8 rounded-2xl gap-1.5 px-3` (32px height)
- **lg**: `h-12 rounded-2xl px-6` (48px height)
- **icon**: `size-10 rounded-2xl` (40px × 40px)

### Gradient Button (`GradientButton` component)
**Base Styles:**
- Border radius: `rounded-2xl` (16px)
- Font: `text-sm font-medium`
- Transition: `transition-colors`
- Focus ring: `ring-primary/20 ring-1`
- Touch target: `touch-target` class (44px min)

**Variants:**
1. **Default/Filled**
   - Background: `gradient-primary` (solid `#111111`)
   - Text: `text-primary-foreground` (`#F7F7F6`)
   - Shadow: `shadow-card`
   - Hover: `hover:opacity-90`

2. **Secondary**: Same as Button secondary
3. **Destructive**: Same as Button destructive
4. **Outline**: Same as Button outline
5. **Ghost**: Same as Button ghost
6. **Link**: Same as Button link

**Sizes:**
- **default**: `h-12 px-6 py-3` (48px height)
- **sm**: `h-10 rounded-2xl px-4` (40px height)
- **lg**: `h-14 rounded-2xl px-8 text-base` (56px height)
- **icon**: `h-10 w-10 rounded-2xl` (40px × 40px)

## Cards

### Card Component
**Base Styles:**
- Background: `bg-card` (`#F2F2F2`)
- Border: `border border-border` (`#E0E0DD`)
- Border radius: `rounded-2xl` (16px)
- Shadow: `shadow-card` (`0 2px 4px rgba(0,0,0,0.06), 0 6px 18px rgba(0,0,0,0.04)`)
- Padding: `py-4` (vertical), `px-6` (horizontal in content/header/footer)
- Text: `text-card-foreground` (`#111111`)
- Gap: `gap-1` (4px between flex children)

**Card Sections:**
- **CardHeader**: `px-6`, gap `1.5` (6px), grid layout
- **CardTitle**: `font-semibold leading-none`
- **CardDescription**: `text-muted-foreground text-sm`
- **CardContent**: `px-6`
- **CardFooter**: `px-6`, flex layout

### Match Card
- Extends base Card
- Hover: `hover:shadow-lg transition-shadow`
- Cursor: `cursor-pointer`
- Additional shadow: `shadow-elevation` (same as shadow-card)

## Inputs

### Input Component
**Base Styles:**
- Background: `bg-input` (`#F2F2F2`)
- Border: `border border-border` (`#E0E0DD`)
- Border radius: `rounded-2xl` (16px)
- Height: `h-10` (40px)
- Padding: `px-4 py-2`
- Text: `text-base` (16px) on mobile, `md:text-sm` (14px) on desktop
- Placeholder: `placeholder:text-muted-foreground` (`#777777`)
- Selection: `selection:bg-primary selection:text-primary-foreground`
- Focus: `focus-visible:border-primary/20 focus-visible:ring-ring focus-visible:ring-2`
- Invalid: `aria-invalid:ring-destructive/20 aria-invalid:border-destructive`
- Transition: `transition-[color,box-shadow]`

### Textarea Component
**Base Styles:**
- Background: `bg-input` (`#F2F2F2`)
- Border: `border border-border` (`#E0E0DD`)
- Border radius: `rounded-md` (6px)
- Min height: `min-h-16` (64px)
- Padding: `px-3 py-2`
- Placeholder: `placeholder:text-muted-foreground` (`#777777`)
- Focus: `focus-visible:border-ring focus-visible:ring-ring`
- Shadow: `shadow-xs`
- Text: `text-base` (16px) on mobile, `md:text-sm` (14px) on desktop

### Select Component
**Trigger:**
- Background: `bg-transparent` (default), `dark:bg-input/30` (dark mode)
- Border: `border border-input` (`#F2F2F2`)
- Border radius: `rounded-md` (6px)
- Height: `h-9` (default), `h-8` (sm)
- Padding: `px-3 py-2`
- Text: `text-sm`
- Placeholder: `data-[placeholder]:text-muted-foreground`
- Focus: `focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]`

**Content:**
- Background: `bg-popover` (`#F2F2F2`)
- Text: `text-popover-foreground` (`#111111`)
- Border: `border` (uses border color)
- Border radius: `rounded-md` (6px)
- Shadow: `shadow-md`
- Padding: `p-1`

**Item:**
- Hover: `focus:bg-accent focus:text-accent-foreground`
- Border radius: `rounded-sm` (2px)
- Padding: `py-1.5 pr-8 pl-2`
- Text: `text-sm`

## Checkboxes

**Base Styles:**
- Size: `size-4` (16px × 16px)
- Border: `border border-input` (`#F2F2F2`)
- Border radius: `rounded-[4px]` (4px)
- Background: `dark:bg-input/30` (dark mode)
- Checked: `data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground`
- Focus: `focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]`
- Shadow: `shadow-xs`
- Transition: `transition-shadow`

## Labels

**Base Styles:**
- Font: `text-sm leading-none font-medium`
- Display: `flex items-center gap-2`
- User select: `select-none`
- Disabled: `group-data-[disabled=true]:pointer-events-none group-data-[disabled=true]:opacity-50`

## Dialogs

### Dialog Overlay
- Background: `bg-black/50` (50% black overlay)
- Animation: Fade in/out
- Position: `fixed inset-0 z-50`

### Dialog Content
- Background: `bg-background` (`#E0DFDC`)
- Border: `border` (uses border color)
- Border radius: `rounded-lg` (8px)
- Padding: `p-6`
- Shadow: `shadow-lg`
- Max width: `max-w-lg` (512px) on desktop, `max-w-[calc(100%-2rem)]` on mobile
- Animation: Fade + zoom in/out
- Position: Centered via transform

### Dialog Close Button
- Position: `absolute top-4 right-4`
- Opacity: `opacity-70`
- Hover: `hover:opacity-100`
- Border radius: `rounded-xs`
- Focus: `focus:ring-2 focus:ring-offset-2`

## Dropdown Menus

### Dropdown Content
- Background: `bg-popover` (`#F2F2F2`)
- Text: `text-popover-foreground` (`#111111`)
- Border: `border` (uses border color)
- Border radius: `rounded-md` (6px)
- Padding: `p-1`
- Shadow: `shadow-md`
- Animation: Fade + zoom in/out
- Z-index: `z-50`

### Dropdown Item
- Hover: `focus:bg-accent focus:text-accent-foreground`
- Border radius: `rounded-sm` (2px)
- Padding: `py-1.5 px-2`
- Text: `text-sm`
- Destructive variant: `text-destructive focus:bg-destructive/10`

## Tabs

### Tabs List
- Background: `bg-muted` (`#F7F7F6`)
- Text: `text-muted-foreground` (`#777777`)
- Border radius: `rounded-lg` (8px)
- Padding: `p-[3px]`
- Height: `h-9` (36px)

### Tab Trigger
- Active: `data-[state=active]:bg-background` (`#E0DFDC`)
- Active (dark): `dark:data-[state=active]:bg-input/30`
- Text: `text-foreground` (active), `text-muted-foreground` (inactive)
- Border radius: `rounded-md` (6px)
- Padding: `px-2 py-1`
- Font: `text-sm font-medium`
- Focus: `focus-visible:ring-[3px] focus-visible:ring-ring/50`
- Shadow: `data-[state=active]:shadow-sm`

## Separators

**Base Styles:**
- Background: `bg-border` (`#E0E0DD`)
- Height: `h-px` (horizontal), `w-px` (vertical)
- Width: `w-full` (horizontal), `h-full` (vertical)

## Backgrounds

### Page Backgrounds
- **Primary Background**: `bg-background` (`#E0DFDC`) - warm paper
- **Background Image Pages**: Some pages use `bg-cover bg-center bg-fixed` with `url('/background.jpg')`:
  - Auth page (`/auth`)
  - Terms page (`/terms`)
  - Privacy page (`/privacy`)
  - Onboarding page (`/onboarding`)
  - Event join page (`/event/join`)
  - Admin pages (`/admin/create-event`, `/admin/event/[eventId]`)

### Glass/Blur Effects
- **Header Glass**: `bg-card/50 backdrop-blur-sm` (50% opacity card with blur)
  - Used on: Terms, Privacy, Admin pages, Event join page
- **Card Glass**: Removed (no longer using glassmorphism on cards)

### Container Backgrounds
- **Card**: `bg-card` (`#F2F2F2`)
- **Muted**: `bg-muted` (`#F7F7F6`)
- **Muted/50**: `bg-muted/50` (50% opacity)
- **Input**: `bg-input` (`#F2F2F2`)
- **Popover**: `bg-popover` (`#F2F2F2`)

## Borders

### Border Colors
- **Primary Border**: `#E0E0DD` (border variable)
- **Input Border**: `#E0E0DD` (border variable)
- **Ring (Focus)**: `rgba(156, 76, 5, 0.25)` (ember-tinted, 25% opacity)

### Border Widths
- Standard: `1px` (via `border` class)
- Focus ring: `ring-1`, `ring-2`, or `ring-[3px]`
- Subtle ring: `ring-1 ring-black/5`

### Border Radius Usage
- Most components: `rounded-2xl` (16px)
- Small elements: `rounded-md` (6px) or `rounded-lg` (8px)
- Checkboxes: `rounded-[4px]` (4px)
- Pills/badges: `rounded-full`

## Spacing & Layout

### Padding
- Cards: `px-6 py-4` (24px horizontal, 16px vertical)
- Card sections: `px-6` (24px)
- Buttons: `px-4 py-2` (default), `px-6 py-3` (gradient default)
- Inputs: `px-4 py-2` (16px horizontal, 8px vertical)

### Gaps
- Card header: `gap-1.5` (6px)
- Flex containers: `gap-2` (8px), `gap-4` (16px)
- Button icons: `gap-2` (8px)

### Touch Targets
- Minimum: `44px × 44px` (via `touch-target` class)
- Button heights: 32px (sm), 40px (default), 48px (lg), 56px (gradient lg)

## Animations

### Transitions
- Buttons: `transition-all` or `transition-colors`
- Inputs: `transition-[color,box-shadow]`
- Cards: `transition-shadow`

### Keyframe Animations
- **Gradient Shift**: 8s ease infinite (for gradient backgrounds)
- **Fade Up**: 0.3s ease-out (opacity + translateY)
- **Fade Out**: 0.3s ease-out (opacity + translateY)
- **Spin**: For loading indicators

### Dialog Animations
- Fade in/out: `fade-in-0` / `fade-out-0`
- Zoom: `zoom-in-95` / `zoom-out-95`
- Slide: Direction-based slide animations

## Special Components

### Avatar
- Uses `PresenceAvatar` component
- Sizes: `sm`, `md`, `lg`
- Presence indicator: Green ring when `isPresent={true}`

### QR Code Card
- Card background: `bg-card` (`#F2F2F2`)
- QR code container: White background with padding and shadow
- QR code size: `w-40 h-40` (160px × 160px)
- Loading state: `bg-muted rounded-xl` with spinner

### Match Card
- Extends Card component
- Hover effect: `hover:shadow-lg`
- Cursor: `cursor-pointer`
- Chevron icon: `text-muted-foreground`

### Message Bubbles
- Border radius: `rounded-3xl` (24px)
- Padding: `px-4 py-2`
- Shadow: `shadow-sm`
- Hover: `hover:scale-[0.99]`
- Active: `active:scale-95`
- Background: `bg-card` with border

## Responsive Design

### Breakpoints
- Mobile-first approach
- `sm`: 640px
- `md`: 768px
- `lg`: 1024px
- `xl`: 1280px

### Responsive Typography
- Logo text: `text-[64px] sm:text-[80px] md:text-[96px] lg:text-[120px] xl:text-[144px]`
- Input text: `text-base md:text-sm`

### Responsive Spacing
- Padding: `px-4` (mobile), larger on desktop
- Margins: Responsive via Tailwind classes

## Accessibility

### Focus States
- All interactive elements have visible focus rings
- Focus ring color: `ring-primary/20` or `ring-ring`
- Focus ring width: `ring-1`, `ring-2`, or `ring-[3px]`

### ARIA States
- Invalid inputs: `aria-invalid:ring-destructive/20 aria-invalid:border-destructive`
- Disabled states: `disabled:opacity-50 disabled:pointer-events-none`
- Screen reader text: `sr-only` class

### Color Contrast
- Primary text on background: High contrast (`#111111` on `#E0DFDC`)
- Muted text: `#777777` on `#E0DFDC` (meets WCAG AA)
- Buttons: High contrast text on colored backgrounds
- Cards: Dark text (`#111111`) on light cards (`#F2F2F2`)

## Design System Summary

### Theme
**Warm Paper Light Theme** with:
- Warm beige background (`#E0DFDC`)
- Light gray cards (`#F2F2F2`)
- Warm ember accents (`#9C4C05`)
- Dark text (`#111111`)
- Subtle borders (`#E0E0DD`)

### Design Principles
1. **Clean minimalism**: Solid backgrounds with subtle shadows
2. **Rounded corners**: Consistent `rounded-2xl` (16px) for most components
3. **Solid buttons**: Primary actions use solid dark (`#111111`)
4. **Subtle shadows**: Light, elevated shadows for depth
5. **High contrast**: Text maintains excellent readability
6. **Touch-friendly**: Minimum 44px touch targets
7. **Smooth animations**: Subtle transitions and hover effects
8. **Background images**: Some pages use background.jpg with glassmorphism headers

### Component Hierarchy
1. **Primary Actions**: Dark buttons (`#111111`) with light text
2. **Secondary Actions**: Outline/secondary buttons with light backgrounds
3. **Tertiary Actions**: Ghost buttons
4. **Destructive Actions**: Red buttons (`#BF341E`)
5. **Accent Elements**: Orange-brown (`#9C4C05`) for highlights and logo

### Background Image Usage
**Pages with background images:**
- `/auth` - Auth page
- `/terms` - Terms of Service
- `/privacy` - Privacy Policy
- `/onboarding` - Onboarding flow
- `/event/join` - Event join page
- `/admin/create-event` - Admin create event
- `/admin/event/[eventId]` - Admin event details

**Pages with solid backgrounds:**
- `/` - Landing page
- `/home` - Home dashboard
- `/messages` - Messages page
- `/profile/[userId]` - User profile
- `/settings` - Settings page

### Header Styles
**With backdrop blur:**
- Terms, Privacy, Admin pages, Event join: `bg-card/50 backdrop-blur-sm`

**Solid headers:**
- Home page, Messages, Profile, Settings: `bg-card` (solid)

## Current State Notes

- Theme is light mode with warm paper aesthetic
- Background images are selectively used on certain pages
- Glassmorphism is limited to headers on specific pages
- Cards use solid light gray backgrounds
- Buttons use solid dark backgrounds for primary actions
- All components use CSS variables for easy theme updates
- Typography scale is consistent across the application
- Border radius is consistently `rounded-2xl` for main components
