export function clamp(value: number, min: number = 0, max: number = 1): number {
  return Math.max(min, Math.min(max, value))
}

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

export function jaccard(a?: string[] | null, b?: string[] | null): number {
  if (!a || !b || a.length === 0 || b.length === 0) return 0
  const setA = new Set(a.map((item) => item?.toLowerCase().trim()).filter(Boolean) as string[])
  const setB = new Set(b.map((item) => item?.toLowerCase().trim()).filter(Boolean) as string[])

  if (setA.size === 0 || setB.size === 0) return 0

  let intersection = 0
  for (const value of setA) {
    if (setB.has(value)) intersection++
  }
  const union = setA.size + setB.size - intersection
  return union === 0 ? 0 : intersection / union
}

export function tokenize(text: string | null | undefined): string[] {
  if (!text) return []
  return text
    .toLowerCase()
    .split(/\s+/g)
    .map((token) => token.replace(/[^\w]/g, ''))
    .filter((token) => token.length > 1)
}

