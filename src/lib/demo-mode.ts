"use client"

import { usePathname, useSearchParams } from "next/navigation"

export const DEMO_QUERY = "demo"
export const DEMO_VALUE = "1"
export const DEMO_HEADER = "x-intro-demo"

/**
 * Returns true when the app is being viewed in demo mode:
 *  - any URL with `?demo=1`
 *  - any path under `/organizer-demo` (organizer demo is path-based)
 */
export function useDemoMode(): boolean {
  const searchParams = useSearchParams()
  const pathname = usePathname()
  if (searchParams?.get(DEMO_QUERY) === DEMO_VALUE) return true
  if (pathname?.startsWith("/organizer-demo")) return true
  return false
}

/**
 * Append/preserve `?demo=1` on an internal link when we're in demo mode.
 * Leaves absolute URLs, hashes, and already-tagged links untouched.
 */
export function demoHref(path: string, demo: boolean): string {
  if (!demo) return path
  if (!path || path.startsWith("http") || path.startsWith("//")) return path

  const [pathPart, hashPart] = path.split("#")
  const [basePath, existingQuery] = pathPart.split("?")
  const params = new URLSearchParams(existingQuery || "")
  if (params.get(DEMO_QUERY) === DEMO_VALUE) return path
  params.set(DEMO_QUERY, DEMO_VALUE)
  const qs = params.toString()
  const rebuilt = qs ? `${basePath}?${qs}` : basePath
  return hashPart ? `${rebuilt}#${hashPart}` : rebuilt
}

/**
 * Strip `?demo=1` from a path (used by "Exit demo").
 */
export function stripDemo(path: string): string {
  const [pathPart, hashPart] = path.split("#")
  const [basePath, existingQuery] = pathPart.split("?")
  if (!existingQuery) return path
  const params = new URLSearchParams(existingQuery)
  params.delete(DEMO_QUERY)
  const qs = params.toString()
  const rebuilt = qs ? `${basePath}?${qs}` : basePath
  return hashPart ? `${rebuilt}#${hashPart}` : rebuilt
}
