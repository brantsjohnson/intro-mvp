# 🔧 EDGE FUNCTION CHANGES NEEDED

## Overview
To change `what_do_you_do` to `career_goals`, you need to update **4 locations** in the Edge Function.

## 📍 **CHANGES REQUIRED**

### **Change 1: Line 356 - Data Selection**
**BEFORE:**
```javascript
what_do_you_do,
```

**AFTER:**
```javascript
career_goals,
```

### **Change 2: Line 382 - User Data Processing**
**BEFORE:**
```javascript
job_description: userData.what_do_you_do || userData.job_title || 'Professional',
```

**AFTER:**
```javascript
job_description: userData.career_goals || userData.job_title || 'Professional',
```

### **Change 3: Line 185 - AI Prompt (User A)**
**BEFORE:**
```javascript
what_do_you_do: ${me.what_do_you_do || 'Professional work'}
```

**AFTER:**
```javascript
career_goals: ${me.career_goals || 'Professional growth'}
```

### **Change 4: Line 197 - AI Prompt (User B)**
**BEFORE:**
```javascript
what_do_you_do: ${them.what_do_you_do || 'Professional work'}
```

**AFTER:**
```javascript
career_goals: ${them.career_goals || 'Professional growth'}
```

## 🎯 **COMPLETE CHANGES SUMMARY**

1. **Line 356**: `what_do_you_do,` → `career_goals,`
2. **Line 382**: `userData.what_do_you_do` → `userData.career_goals`
3. **Line 185**: `me.what_do_you_do` → `me.career_goals`
4. **Line 197**: `them.what_do_you_do` → `them.career_goals`

## ✅ **BENEFITS OF THIS CHANGE**

1. **Semantic Clarity** - Field name matches its actual meaning
2. **AI Accuracy** - AI will understand it's about career goals, not current job
3. **Future Maintenance** - Less confusing for developers
4. **Minimal Impact** - Only 4 lines changed

## 🚀 **IMPLEMENTATION STEPS**

1. **Update Edge Function** - Make the 4 changes above
2. **Update Database Schema** - Use the updated rebuild guide
3. **Test Edge Function** - Verify it works with new field name
4. **Update UI Components** - Change any references in your React components

## 📝 **NOTES**

- The `job_description` field in the Edge Function will now use `career_goals` as the primary source
- The AI prompt will now ask about career goals instead of current work
- All database queries will use the new field name
- The change is backward compatible if you handle the migration properly

---

**These are the only changes needed to update from `what_do_you_do` to `career_goals`! 🚀**



