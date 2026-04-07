import { decryptEventCode } from "@/lib/event-code-encryption"

/** v2: persisted in localStorage (survives tab close). v1 was sessionStorage-only. */
const STORAGE_KEY = "intro_pending_event_invite_v2"
const LEGACY_SESSION_STORAGE_KEY = "intro_pending_event_invite_v1"

/** Short TTL: localStorage persists until cleared, so cap how long a stale invite can apply */
const MAX_AGE_MS = 48 * 60 * 60 * 1000

export type PendingEventInviteV1 = {
  encryptedPayload?: string
  legacyPlainCode?: string
  updatedAt: number
}

function canUseStorage(): boolean {
  return typeof window !== "undefined" && typeof localStorage !== "undefined"
}

function parseStored(raw: string): PendingEventInviteV1 | null {
  try {
    const parsed = JSON.parse(raw) as PendingEventInviteV1
    if (typeof parsed.updatedAt !== "number") return null
    if (Date.now() - parsed.updatedAt > MAX_AGE_MS) return null
    if (!parsed.encryptedPayload && !parsed.legacyPlainCode) return null
    return parsed
  } catch {
    return null
  }
}

function migrateLegacySessionStorageOnce(): void {
  if (typeof window === "undefined" || typeof sessionStorage === "undefined") return
  try {
    if (localStorage.getItem(STORAGE_KEY)) return
    const raw = sessionStorage.getItem(LEGACY_SESSION_STORAGE_KEY)
    if (!raw) return
    const parsed = parseStored(raw)
    sessionStorage.removeItem(LEGACY_SESSION_STORAGE_KEY)
    if (!parsed) return
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ ...parsed, updatedAt: Date.now() } satisfies PendingEventInviteV1),
    )
  } catch {
    // ignore
  }
}

/** Read pending invite, or null if missing / expired stale entries are removed. */
export function readPendingEventInvite(): PendingEventInviteV1 | null {
  if (!canUseStorage()) return null
  try {
    migrateLegacySessionStorageOnce()
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = parseStored(raw)
    if (!parsed) {
      localStorage.removeItem(STORAGE_KEY)
      return null
    }
    return parsed
  } catch {
    return null
  }
}

export function peekEncryptedInvitePayload(): string | null {
  return readPendingEventInvite()?.encryptedPayload ?? null
}

export function peekLegacyPlainEventCode(): string | null {
  return readPendingEventInvite()?.legacyPlainCode ?? null
}

export function clearPendingEventInvite(): void {
  if (!canUseStorage()) return
  try {
    localStorage.removeItem(STORAGE_KEY)
    sessionStorage.removeItem(LEGACY_SESSION_STORAGE_KEY)
  } catch {
    // ignore
  }
}

/**
 * Merge invite hints from the current URL into localStorage so OAuth redirects,
 * closing the tab, and SPA navigation are less likely to drop the event
 * (Supabase uses ?code= for OAuth).
 */
export function mergeInviteFromUrl(
  codeParam: string | null | undefined,
  eventCodeParam: string | null | undefined,
): void {
  if (!canUseStorage()) return

  const prev = readPendingEventInvite()
  let encryptedPayload = prev?.encryptedPayload
  let legacyPlainCode = prev?.legacyPlainCode

  if (codeParam) {
    const trimmed = codeParam.trim()
    if (trimmed) {
      if (decryptEventCode(trimmed)) {
        encryptedPayload = trimmed
      } else if (/^[A-Z0-9]{6}$/i.test(trimmed)) {
        legacyPlainCode = trimmed.toUpperCase()
      }
    }
  }

  if (eventCodeParam) {
    const t = eventCodeParam.trim().toUpperCase()
    if (/^[A-Z0-9]{6}$/.test(t)) {
      legacyPlainCode = t
    }
  }

  if (!encryptedPayload && !legacyPlainCode) return

  const payload: PendingEventInviteV1 = {
    updatedAt: Date.now(),
  }
  if (encryptedPayload) payload.encryptedPayload = encryptedPayload
  if (legacyPlainCode) payload.legacyPlainCode = legacyPlainCode

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload))
    sessionStorage.removeItem(LEGACY_SESSION_STORAGE_KEY)
  } catch {
    // ignore quota / private mode
  }
}
