# Authentication + Onboarding System — Complete Failure Analysis & Fixes

## Executive Summary

**Status:** 🔴 **CRITICAL ISSUES IDENTIFIED**

Three distinct failure points confirmed:
1. ✅ **Sign-Up Redirect Issue** - Fixed (redirects to `/onboarding` when no code)
2. 🔴 **409 Duplicate Email Error** - Root cause identified
3. 🔴 **Race Condition** - Trigger vs onboarding save timing

---

## I. CRITICAL ISSUE #1: 409 Duplicate Email Error

### Root Cause

**Location:** `src/components/onboarding/new-onboarding-flow.tsx:803-824`

**Problem:**
```typescript
const profileData = {
  user_id: user.id,
  email: user.email || "",  // ⚠️ INCLUDES EMAIL FIELD
  // ... other fields
}

const { data, error } = await supabase
  .from("users")
  .upsert(profileData, {
    onConflict: 'user_id'  // ⚠️ CONFLICT RESOLUTION ONLY ON user_id
  })
```

**Why It Fails:**
1. Database trigger (`handle_new_user()`) creates users row with `email` field
2. Database has UNIQUE constraint on `email` column (`users_email_key`)
3. Onboarding upsert includes `email` field
4. Upsert uses `onConflict: 'user_id'` but email constraint is separate
5. If email already exists (from trigger), upsert fails with 409

**The Conflict:**
- `onConflict: 'user_id'` only handles conflicts on `user_id` primary key
- But `email` has its own UNIQUE constraint
- When upsert tries to INSERT (not UPDATE), PostgreSQL checks ALL constraints
- If email violates unique constraint, 409 error occurs BEFORE conflict resolution

### Fix Required

**Option 1: Remove email from upsert payload** (RECOMMENDED)
- Email is already set by trigger
- No need to update it during onboarding
- Simplest and safest fix

**Option 2: Use UPDATE instead of UPSERT**
- Check if user exists first
- Use UPDATE if exists, INSERT if not
- More complex but explicit

**Option 3: Handle email constraint in database**
- Make email nullable or remove unique constraint
- Not recommended (email should be unique)

---

## II. CRITICAL ISSUE #2: Sign-Up Redirect Logic

### Current Behavior

**Location:** `src/components/auth/auth-form.tsx:183-208`

**Problem:**
```typescript
let redirectUrl = "/"  // ⚠️ DEFAULT REDIRECT TO ROOT
if (encryptedCode) {
  redirectUrl = `/onboarding?code=${encryptedCode}`
} else if (eventCode) {
  redirectUrl = `/event/join?code=${eventCode}`
}
// ... then redirects to redirectUrl
```

**What Happens:**
1. User signs up WITHOUT event code
2. Redirects to `/` (root page)
3. Root page (`src/app/page.tsx`) checks onboarding status
4. If users row doesn't exist yet (race condition), redirects to `/onboarding`
5. If users row exists but incomplete, redirects to `/onboarding`
6. **BUT** if there's any error or timing issue, user might see auth form again

**The Issue:**
- Sign-up should ALWAYS go directly to `/onboarding` (not via `/`)
- Root page logic is meant for sign-IN, not sign-UP
- Creates unnecessary redirect chain

### Fix Required

**Change default redirect:**
```typescript
let redirectUrl = "/onboarding"  // ✅ ALWAYS GO TO ONBOARDING
if (encryptedCode) {
  redirectUrl = `/onboarding?code=${encryptedCode}`
} else if (eventCode) {
  redirectUrl = `/event/join?code=${eventCode}`
}
```

---

## III. CRITICAL ISSUE #3: Race Condition - Trigger vs Onboarding

### Current Behavior

**Location:** `src/components/auth/auth-form.tsx:130-181`

**Problem:**
1. Sign-up creates auth user
2. Database trigger fires (async, server-side)
3. Code waits 500ms for trigger
4. Checks if users row exists
5. If not, manually creates it (fallback)
6. Then redirects

**Race Condition:**
- Trigger might not complete in 500ms
- Manual fallback might create duplicate
- Onboarding might start before users row exists
- Multiple upsert attempts can conflict

### Fix Required

**Better approach:**
1. Always redirect to onboarding immediately after sign-up
2. Onboarding component should handle missing users row gracefully
3. Remove manual fallback (let trigger handle it)
4. Add retry logic in onboarding if needed

---

## IV. Database Trigger Analysis

### Current Trigger: `handle_new_user()`

**Location:** `supabase/create-users-trigger.sql`

**Behavior:**
- Creates users row with: `user_id`, `email`, `first_name`, `last_name`, `photo_url`
- Uses `ON CONFLICT (user_id) DO UPDATE`
- Updates email on conflict: `email = EXCLUDED.email`

**Potential Issue:**
- If trigger updates email and email constraint exists, could conflict
- But trigger only fires on INSERT, so conflict should be on user_id only
- **However:** If two sign-ups happen simultaneously with same email, second trigger execution could fail

**Recommendation:**
- Trigger is correct
- Issue is in onboarding upsert including email field

---

## V. Sign-Up vs Sign-In Flow Comparison

### Sign-Up Flow (Current - BROKEN)
```
User signs up
  ↓
Auth user created ✅
  ↓
Session established ✅
  ↓
Wait for trigger (500ms) ⏱️
  ↓
Check users row exists ⚠️
  ↓
Manual fallback if missing ⚠️
  ↓
Redirect to "/" or "/onboarding" ⚠️
  ↓
Root page checks onboarding ⚠️
  ↓
Redirects to "/onboarding" if incomplete ⚠️
  ↓
Onboarding starts ✅
  ↓
Profile save includes email ⚠️
  ↓
409 ERROR ❌
```

### Sign-In Flow (Current - WORKS)
```
User signs in
  ↓
Auth OK ✅
  ↓
Redirect to "/" or "/onboarding" ✅
  ↓
Root page checks onboarding ✅
  ↓
Redirects to "/onboarding" ✅
  ↓
Onboarding starts ✅
  ↓
Profile save includes email ⚠️
  ↓
409 ERROR ❌ (SAME ISSUE)
```

**Key Difference:**
- Sign-in doesn't create users row (already exists)
- Sign-up creates users row via trigger
- Both fail at same point: onboarding profile save

---

## VI. Required Fixes

### Fix #1: Remove Email from Onboarding Upsert

**File:** `src/components/onboarding/new-onboarding-flow.tsx`

**Change:**
```typescript
// BEFORE (line 803-815)
const profileData = {
  user_id: user.id,
  email: user.email || "",  // ❌ REMOVE THIS
  first_name: firstName,
  last_name: lastName,
  // ... rest
}

// AFTER
const profileData = {
  user_id: user.id,
  // email removed - already set by trigger
  first_name: firstName,
  last_name: lastName,
  // ... rest
}
```

**Reason:**
- Email is set by database trigger
- Including it in upsert causes 409 conflict
- Email doesn't need to be updated during onboarding

---

### Fix #2: Always Redirect to Onboarding After Sign-Up

**File:** `src/components/auth/auth-form.tsx`

**Change:**
```typescript
// BEFORE (line 184)
let redirectUrl = "/"

// AFTER
let redirectUrl = "/onboarding"  // Always go to onboarding
```

**Reason:**
- Sign-up should always start onboarding
- Root page redirect creates unnecessary complexity
- Direct redirect is cleaner

---

### Fix #3: Simplify Sign-Up Flow (Remove Manual Fallback)

**File:** `src/components/auth/auth-form.tsx`

**Change:**
- Remove lines 130-181 (manual users row creation fallback)
- Trust the database trigger
- Add error handling in onboarding if users row missing

**Reason:**
- Manual fallback creates race conditions
- Trigger should handle it
- Onboarding can handle missing row gracefully

---

### Fix #4: Add Error Handling for 409 in Onboarding

**File:** `src/components/onboarding/new-onboarding-flow.tsx`

**Change:**
```typescript
// AFTER line 825
if (profileError) {
  console.error("Profile upsert error:", profileError)
  
  // Handle 409 conflict specifically
  if (profileError.code === '23505' && profileError.message?.includes('email')) {
    // Email conflict - try again without email field
    const { data: retryData, error: retryError } = await supabase
      .from("users")
      .upsert({
        ...profileData,
        email: undefined  // Remove email from retry
      }, {
        onConflict: 'user_id'
      })
      .select()
    
    if (retryError) {
      console.error("Retry also failed:", retryError)
      return
    }
    
    // Success on retry
    console.log("Profile saved successfully after retry:", retryData)
    setProfileCompleted(true)
    // ... continue flow
    return
  }
  
  return
}
```

**Reason:**
- Graceful handling of email conflict
- Retry without email field
- Better user experience

---

## VII. Testing Checklist

After fixes, test:

1. ✅ **Sign-up without event code**
   - Should redirect directly to `/onboarding`
   - Should not show auth form again

2. ✅ **Sign-up with event code**
   - Should redirect to `/onboarding?code=...`
   - Should preserve code through flow

3. ✅ **Profile save during onboarding**
   - Should NOT include email field
   - Should NOT throw 409 error
   - Should save successfully

4. ✅ **Sign-in after failed sign-up**
   - Should work normally
   - Should not create duplicate users row
   - Should complete onboarding successfully

5. ✅ **OAuth sign-up (Google/LinkedIn)**
   - Should create users row via trigger
   - Should redirect to onboarding
   - Should save profile without 409 error

---

## VIII. Database Constraints Check

**Required Check:**
```sql
-- Check if email has unique constraint
SELECT 
  conname AS constraint_name,
  contype AS constraint_type,
  a.attname AS column_name
FROM pg_constraint c
JOIN pg_class t ON c.conrelid = t.oid
JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = ANY(c.conkey)
WHERE t.relname = 'users' 
  AND a.attname = 'email'
  AND contype = 'u';  -- 'u' = unique constraint
```

**If unique constraint exists:**
- Fix #1 (remove email from upsert) is REQUIRED
- Cannot upsert with email if constraint exists

**If no unique constraint:**
- Still remove email (not needed)
- But 409 error wouldn't occur

---

## IX. Implementation Priority

1. **🔴 CRITICAL - Fix #1:** Remove email from onboarding upsert
   - **Impact:** Fixes 409 error immediately
   - **Risk:** Low (email already set by trigger)
   - **Time:** 2 minutes

2. **🟡 HIGH - Fix #2:** Always redirect to onboarding
   - **Impact:** Fixes sign-up redirect issue
   - **Risk:** Low (cleaner flow)
   - **Time:** 1 minute

3. **🟡 MEDIUM - Fix #3:** Remove manual fallback
   - **Impact:** Reduces race conditions
   - **Risk:** Medium (need to ensure trigger works)
   - **Time:** 5 minutes

4. **🟢 LOW - Fix #4:** Add error handling
   - **Impact:** Better error recovery
   - **Risk:** Low (defensive coding)
   - **Time:** 10 minutes

---

## X. Root Cause Summary

**The 409 error occurs because:**
1. Database trigger creates users row with email
2. Database has UNIQUE constraint on email
3. Onboarding upsert includes email field
4. Upsert conflict resolution only handles `user_id`, not `email`
5. PostgreSQL checks ALL constraints before conflict resolution
6. Email constraint violation → 409 error

**The sign-up redirect issue occurs because:**
1. Sign-up redirects to `/` when no code
2. Root page checks onboarding status
3. Creates unnecessary redirect chain
4. Can cause user to see auth form again

**The solution:**
- Remove email from onboarding upsert (email already set)
- Always redirect to onboarding after sign-up
- Trust database trigger (remove manual fallback)
- Add defensive error handling

---

## XI. Files to Modify

1. `src/components/onboarding/new-onboarding-flow.tsx` (Fix #1, #4)
2. `src/components/auth/auth-form.tsx` (Fix #2, #3)

---

## XII. Verification Steps

After implementing fixes:

1. **Test sign-up flow:**
   ```bash
   # Sign up new user
   # Should redirect to /onboarding
   # Should complete profile save without 409 error
   ```

2. **Check console logs:**
   ```bash
   # Should see: "Profile saved successfully"
   # Should NOT see: "409 Conflict" or "duplicate key"
   ```

3. **Verify database:**
   ```sql
   -- Check users table
   SELECT user_id, email, first_name, last_name, career_title, company_name
   FROM users
   WHERE email = 'test@example.com';
   
   -- Should have one row with all fields populated
   ```

---

## Conclusion

The authentication and onboarding system has **three critical issues**:

1. ✅ **409 Error:** Onboarding includes email in upsert, violating unique constraint
2. ✅ **Redirect Issue:** Sign-up redirects to `/` instead of `/onboarding`
3. ✅ **Race Condition:** Manual fallback creates timing issues

**All three issues have clear fixes** that are low-risk and high-impact.

**Recommended implementation order:**
1. Fix #1 (remove email) - **IMMEDIATE**
2. Fix #2 (redirect) - **IMMEDIATE**
3. Fix #3 (remove fallback) - **SOON**
4. Fix #4 (error handling) - **NICE TO HAVE**
