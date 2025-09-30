# 🎯 MATCH TYPES EXPLAINED

## Overview
The `matches` table now tracks different types of matches to distinguish between AI suggestions, QR code connections, and accepted matches.

## 📊 **MATCH TYPES**

### **1. `ai_suggestion` (Default)**
- **Created by**: Edge Function (AI matchmaking)
- **Purpose**: Top 3 suggested profiles for each user
- **Status**: `is_connected = FALSE` (just suggestions)
- **User sees**: AI-generated summary, why_meet, shared_activities, dive_deeper
- **Action needed**: User can accept/reject the suggestion

### **2. `qr_scan`**
- **Created by**: QR code scanning between two users
- **Purpose**: Instant connection when users scan each other's QR codes
- **Status**: `is_connected = TRUE` (both users connected)
- **User sees**: Basic connection info (can reuse AI content if available)
- **Action needed**: None - automatically connected

### **3. `accepted`**
- **Created by**: User accepting an AI suggestion
- **Purpose**: User clicked "Yes" on a suggested match
- **Status**: `is_connected = TRUE` (both users connected)
- **User sees**: Full AI-generated content (summary, why_meet, etc.)
- **Action needed**: None - user has accepted

## 🔄 **MATCH LIFECYCLE**

### **AI Suggestion Flow:**
1. **Edge Function creates** `match_type = 'ai_suggestion'`, `is_connected = FALSE`
2. **User sees suggestion** with AI-generated content
3. **User clicks "Yes"** → Update to `match_type = 'accepted'`, `is_connected = TRUE`
4. **User clicks "No"** → Delete the match record

### **QR Code Flow:**
1. **User A scans User B's QR code**
2. **System creates** `match_type = 'qr_scan'`, `is_connected = TRUE`
3. **Both users see connection** (can reuse AI content if available)

## 🎨 **UI IMPLICATIONS**

### **For AI Suggestions (`ai_suggestion`):**
```typescript
// Show suggestion UI with accept/reject buttons
if (match.match_type === 'ai_suggestion') {
  return (
    <SuggestionCard 
      summary={match.summary}
      whyMeet={match.why_meet}
      sharedActivities={match.shared_activities}
      diveDeeper={match.dive_deeper}
      onAccept={() => acceptMatch(match.id)}
      onReject={() => rejectMatch(match.id)}
    />
  )
}
```

### **For Connected Matches (`accepted` or `qr_scan`):**
```typescript
// Show connection UI with messaging
if (match.is_connected) {
  return (
    <ConnectionCard 
      summary={match.summary}
      whyMeet={match.why_meet}
      sharedActivities={match.shared_activities}
      diveDeeper={match.dive_deeper}
      onMessage={() => startConversation(match.id)}
    />
  )
}
```

## 📋 **DATABASE QUERIES**

### **Get AI Suggestions for User:**
```sql
SELECT * FROM matches 
WHERE (a = $user_id OR b = $user_id) 
AND match_type = 'ai_suggestion' 
AND is_connected = FALSE;
```

### **Get Connected Matches for User:**
```sql
SELECT * FROM matches 
WHERE (a = $user_id OR b = $user_id) 
AND is_connected = TRUE;
```

### **Accept a Suggestion:**
```sql
UPDATE matches 
SET match_type = 'accepted', 
    is_connected = TRUE, 
    connected_at = NOW() 
WHERE id = $match_id;
```

### **Create QR Connection:**
```sql
INSERT INTO matches (
  event_id, a, b, match_type, is_connected, connected_at,
  bases, summary, why_meet, shared_activities, dive_deeper
) VALUES (
  $event_id, $user_a, $user_b, 'qr_scan', TRUE, NOW(),
  ['qr_connection'], 'Connected via QR code', 
  'You both scanned each other\'s QR codes!', 
  '["Exchange contact info", "Share your story"]',
  'What brought you to this event?'
);
```

## 🚀 **BENEFITS**

1. **Clear Distinction** - Know exactly how each match was created
2. **Proper UI Flow** - Show different interfaces for suggestions vs connections
3. **Analytics** - Track which connection methods work best
4. **User Experience** - Users understand the difference between suggestions and connections
5. **Data Integrity** - Proper tracking of match states

## 🔧 **EDGE FUNCTION COMPATIBILITY**

The Edge Function will continue to work exactly as before:
- Creates matches with `match_type = 'ai_suggestion'` (default)
- Sets `is_connected = FALSE` (default)
- All existing fields remain the same

**No changes needed to the Edge Function!** ✅

---

**This structure gives you complete control over match types and user experience! 🎯**

