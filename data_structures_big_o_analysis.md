# Data Structures and Big O Analysis

## Executive Summary

This codebase implements a sophisticated matchmaking system with multiple data structures optimized for different operations. The system processes user profiles, embeddings, and performs real-time matching with various algorithms.

## 1. Arrays and Linear Data Structures

### **Arrays - O(n) Operations**
Arrays are extensively used throughout the codebase for storing various types of data:

#### **Profile Data Arrays:**
- `offerTags: string[]` - User's offering tags
- `needTags: string[]` - User's requirements  
- `industryTags: string[]` - Industry classifications
- `hobbyTags: string[]` - Interest/hobby tags
- `linkedinSkills: string[]` - LinkedIn extracted skills
- `connectionTypes: string[]` - Connection preferences

**Big O Complexity:**
- Access: O(1) by index
- Search: O(n) - linear search through tags
- Insertion: O(1) at end, O(n) at arbitrary position
- Deletion: O(n) - requires shifting elements

#### **Vector Embeddings:**
```typescript
offerEmbedding: number[] | null
needEmbedding: number[] | null  
profileEmbedding: number[] | null
personalityEmbedding: number[] | null
```

**Big O Complexity:**
- Cosine Similarity Calculation: O(n) where n = embedding dimension
- Vector Operations: O(n) for dot product and norm calculations

### **String Processing Arrays:**
Multiple tokenization operations create arrays:

```typescript
function tokenize(text: string | null | undefined): string[] {
  if (!text) return []
  return text
    .toLowerCase()
    .split(/\s+/g)
    .map((token) => token.replace(/[^\w]/g, ''))
    .filter((token) => token.length > 1)
}
```

**Big O Complexity:**
- Tokenization: O(m) where m = input string length
- Filtering: O(k) where k = number of tokens

## 2. Hash-Based Data Structures

### **Sets - O(1) Average Case Operations**

#### **Stopword Sets:**
```typescript
const BASE_STOPWORDS = new Set([
  "the", "and", "for", "with", "from", "that", "this"...
])
```
- Size: ~128 elements
- Lookup: O(1) average case
- Used for filtering common words during text processing

#### **Dynamic Sets for Deduplication:**
```typescript
function mergeUnique(...lists: (string[] | null | undefined)[]): string[] {
  const seen = new Set<string>()
  const merged: string[] = []
  for (const list of lists) {
    if (!list) continue
    for (const item of list) {
      if (!item) continue
      const lower = item.toLowerCase()
      if (!seen.has(lower)) {
        seen.add(lower)
        merged.push(item)
      }
    }
  }
  return merged
}
```

**Big O Complexity:**
- Insertion: O(1) average case
- Lookup: O(1) average case  
- Overall deduplication: O(n) where n = total elements across all lists

#### **Jaccard Similarity with Sets:**
```typescript
export function jaccard(a?: string[] | null, b?: string[] | null): number {
  if (!a || !b || a.length === 0 || b.length === 0) return 0
  const setA = new Set(a.map((item) => item?.toLowerCase().trim()).filter(Boolean) as string[])
  const setB = new Set(b.map((item) => item?.toLowerCase().trim()).filter(Boolean) as string[])
  
  let intersection = 0
  for (const value of setA) {
    if (setB.has(value)) intersection++
  }
  const union = setA.size + setB.size - intersection
  return union === 0 ? 0 : intersection / union
}
```

**Big O Complexity:**
- Set creation: O(n + m) where n, m are array sizes
- Intersection calculation: O(min(n, m))
- Overall: O(n + m)

### **Maps - O(1) Average Case Operations**

#### **Candidate Score Mapping:**
```typescript
const candidateScoreMap = new Map<string, { offerSimilarity?: number; needSimilarity?: number }>()
```

**Big O Complexity:**
- Insertion: O(1) average case
- Lookup: O(1) average case
- Used for efficient candidate score tracking during ANN search

#### **Reranking Order Map:**
```typescript
const order = new Map<string, { index: number; reason?: string }>()
ranked.forEach((entry, idx) => {
  if (entry?.match_user_id) {
    order.set(entry.match_user_id, { index: idx, reason: entry.reason })
  }
})
```

**Big O Complexity:**
- Population: O(n) where n = number of ranked entries
- Lookup during reordering: O(1) per candidate

## 3. Sorting Algorithms

### **Deterministic Candidate Sorting:**
```typescript
function deterministicCompare(a: ScoredCandidate, b: ScoredCandidate): number {
  // Primary: TotalScore descending
  if (b.breakdown.totalScore !== a.breakdown.totalScore) {
    return b.breakdown.totalScore - a.breakdown.totalScore
  }
  // Secondary: WantFit descending  
  if (b.breakdown.wantFit !== a.breakdown.wantFit) {
    return b.breakdown.wantFit - a.breakdown.wantFit
  }
  // ... more tie-breakers
  // Finally: Stable ID ascending
  return a.candidate.id.localeCompare(b.candidate.id)
}
```

**Big O Complexity:**
- Single comparison: O(1) - constant number of numeric comparisons
- Full sort: O(n log n) using JavaScript's native sort (Timsort)
- Used for final candidate ranking

### **Score-Based Sorting:**
```typescript
.sort((a, b) => b.breakdown.totalScore - a.breakdown.totalScore)
```

**Big O Complexity:**
- O(n log n) where n = number of candidates
- Frequent operation in match selection

## 4. Search and Filtering Operations

### **Linear Search Operations:**
```typescript
const includesAny = (text: string, keywords: string[]): boolean => {
  const lower = text.toLowerCase()
  return keywords.some((keyword) => lower.includes(keyword))
}
```

**Big O Complexity:**
- O(k × m) where k = number of keywords, m = average text length
- Used for intent detection and matching

### **Array Filtering:**
```typescript
.filter((row: any) => row.users) // Must have user data
.filter((token) => token.length > 1)
.filter(Boolean)
```

**Big O Complexity:**
- O(n) where n = array size
- Common operation for data cleaning

### **Pre-filtering for AI:**
```typescript
function preFilterCandidates(
  scored: ScoredCandidate[],
  limit: number
): ScoredCandidate[] {
  const sorted = [...scored].sort((a, b) => b.breakdown.totalScore - a.breakdown.totalScore)
  return sorted.slice(0, limit)
}
```

**Big O Complexity:**
- Sorting: O(n log n)  
- Slicing: O(k) where k = limit
- Overall: O(n log n)
- Used to reduce candidate pool before expensive AI processing

## 5. Vector and Mathematical Operations

### **Cosine Similarity:**
```typescript
export function cosineSimilarity(a: number[] | null | undefined, b: number[] | null | undefined): number {
  if (!a || !b || a.length === 0 || b.length === 0 || a.length !== b.length) return 0

  let dot = 0
  let normA = 0
  let normB = 0

  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]
    normA += a[i] * a[i]
    normB += b[i] * b[i]
  }

  if (normA === 0 || normB === 0) return 0
  return clamp(dot / (Math.sqrt(normA) * Math.sqrt(normB)))
}
```

**Big O Complexity:**
- O(d) where d = embedding dimension (typically 384 or 1536)
- Critical for semantic matching between user profiles

### **ANN (Approximate Nearest Neighbor) Search:**
```typescript
async function callAnnFunction(
  client: SupabaseClient,
  fn: "match_offer_candidates" | "match_need_candidates",
  params: Record<string, unknown>
): Promise<AnnMatch[]> {
  const { data, error } = (await client.rpc(fn, params)) as RpcResponse
  return data ?? []
}
```

**Big O Complexity:**
- Theoretical: O(log n) for well-optimized ANN indices
- Practical: Depends on Supabase's pgvector implementation
- Used for efficient candidate pool generation

## 6. Complex Algorithmic Operations

### **Candidate Pool Generation:**
```typescript
export async function fetchCandidatePool(
  client: SupabaseClient,
  eventId: string,
  viewer: ViewerProfile,
  existingIds: Set<string>,
  options: { annLimit?: number; fallbackLimit?: number } = {}
): Promise<CandidatePool>
```

**Big O Complexity Analysis:**
1. **ANN Search**: O(log n) per query × 2 queries = O(log n)
2. **Fallback Query**: O(m) where m = fallback limit
3. **Profile Loading**: O(k) where k = candidate count
4. **Filtering**: O(k) for duplicate removal
5. **Overall**: O(log n + m + k)

### **Comprehensive Candidate Scoring:**
```typescript
export function scoreCandidates(
  viewer: ViewerProfile,
  candidates: CandidateProfile[],
  weights = DEFAULT_MATCH_WEIGHTS,
  viewerIntent?: ViewerIntentContext
): ScoredCandidate[]
```

**Big O Complexity Analysis:**
- **Per Candidate**: O(d + t) where d = embedding dimension, t = average tags per user
- **All Candidates**: O(n × (d + t)) where n = number of candidates
- **Major Components**:
  - Embedding similarity: O(d)
  - Tag overlap calculations: O(t₁ + t₂) per tag type
  - Intent matching: O(t) for token matching
  - Persona analysis: O(1) for business logic

## 7. Memory Complexity Analysis

### **Space Complexity by Component:**

1. **User Profiles**: O(n × (d + t)) where n = users, d = embedding dimension, t = average tags
2. **Candidate Pool**: O(k × (d + t)) where k = candidates considered  
3. **Score Maps**: O(k) for candidate scoring
4. **Stopword Sets**: O(s) where s = stopword count (~128, effectively O(1))
5. **Temporary Arrays**: O(k) for sorting and filtering operations

### **Peak Memory Usage:**
- **Match Processing**: O(k × d) dominated by embedding storage and calculations
- **AI Reranking**: O(k × c) where c = character count for prompts

## 8. Performance Optimization Strategies

### **Implemented Optimizations:**

1. **Pre-filtering**: Reduces AI processing from O(n) to O(k) where k << n
2. **Set-based deduplication**: O(1) lookups instead of O(n) array searches  
3. **Early termination**: Short-circuit evaluation in boolean operations
4. **Embedding reuse**: Cache embeddings between different matching contexts
5. **Stopword filtering**: O(1) set lookups for common word elimination

### **Algorithmic Efficiency:**
- **Best Case**: O(log n) for ANN-only matching with high-quality candidates
- **Average Case**: O(n log n) for full scoring and sorting
- **Worst Case**: O(n × d) when fallback algorithms engage

## 9. Scalability Analysis

### **Current Bottlenecks:**
1. **Embedding calculations**: O(n × d) scales with user count and embedding size
2. **Full candidate scoring**: O(n²) in worst case if all users match all users
3. **AI reranking**: External API latency, not algorithmic complexity

### **Scaling Limits:**
- **Effective for**: 100-1000 candidates per event
- **Performance degradation**: 1000+ candidates without additional optimization
- **Memory limits**: ~10MB per 1000 users with full embeddings

## Summary Table

| Data Structure | Operation | Time Complexity | Space Complexity | Usage Context |
|---------------|-----------|-----------------|------------------|---------------|
| Array | Access | O(1) | O(n) | Tag storage, embeddings |
| Array | Search | O(n) | O(1) | Tag matching |
| Set | Lookup | O(1) avg | O(n) | Stopwords, deduplication |
| Map | Lookup | O(1) avg | O(n) | Score tracking, reranking |
| Sorting | Native sort | O(n log n) | O(n) | Candidate ranking |
| Cosine Similarity | Calculation | O(d) | O(1) | Semantic matching |
| ANN Search | Query | O(log n) | O(n × d) | Candidate pool |
| Full Scoring | All candidates | O(n × d) | O(n × d) | Match generation |
| Jaccard Index | Calculation | O(n + m) | O(n + m) | Tag overlap |

The system demonstrates sophisticated algorithmic design with appropriate data structure choices for each operation type, balancing computational efficiency with feature richness in the matching algorithm.