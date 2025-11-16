import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2"
import { AnnMatch, CandidateProfile, ViewerProfile } from "./types.ts"
import { loadCandidateProfiles } from "./profiles.ts"

type RpcResponse = {
  data: AnnMatch[] | null
  error: Error | null
}

async function callAnnFunction(
  client: SupabaseClient,
  fn: "match_offer_candidates" | "match_need_candidates",
  params: Record<string, unknown>
): Promise<AnnMatch[]> {
  const { data, error } = (await client.rpc(fn, params)) as RpcResponse
  if (error) {
    console.warn(`ANN RPC ${fn} failed:`, error)
    return []
  }
  return data ?? []
}

export interface CandidatePool {
  candidates: CandidateProfile[]
  seedCount: number
}

export async function fetchCandidatePool(
  client: SupabaseClient,
  eventId: string,
  viewer: ViewerProfile,
  existingIds: Set<string>,
  options: { annLimit?: number; fallbackLimit?: number } = {}
): Promise<CandidatePool> {
  const annLimit = options.annLimit ?? 80
  const fallbackLimit = options.fallbackLimit ?? 120

  const candidateScoreMap = new Map<string, { offerSimilarity?: number; needSimilarity?: number }>()

  // Use event-level embeddings if available, fallback to user-level
  const needEmbedding = viewer.eventNeedEmbedding ?? viewer.needEmbedding
  const offerEmbedding = viewer.eventOfferEmbedding ?? viewer.offerEmbedding

  if (needEmbedding) {
    const offerMatches = await callAnnFunction(client, "match_offer_candidates", {
      match_event_id: eventId,
      query_embedding: needEmbedding,
      match_count: annLimit,
      exclude_user_id: viewer.id
    })

    for (const match of offerMatches) {
      if (!match.user_id) continue
      const entry = candidateScoreMap.get(match.user_id) || {}
      entry.offerSimilarity = match.similarity ?? entry.offerSimilarity
      candidateScoreMap.set(match.user_id, entry)
    }
  }

  if (offerEmbedding) {
    const needMatches = await callAnnFunction(client, "match_need_candidates", {
      match_event_id: eventId,
      query_embedding: offerEmbedding,
      match_count: annLimit,
      exclude_user_id: viewer.id
    })

    for (const match of needMatches) {
      if (!match.user_id) continue
      const entry = candidateScoreMap.get(match.user_id) || {}
      entry.needSimilarity = match.similarity ?? entry.needSimilarity
      candidateScoreMap.set(match.user_id, entry)
    }
  }

  // Fallback: if we have very few ANN results, pull additional attendees
  if (candidateScoreMap.size < annLimit / 2) {
    console.log("ann_fallback_triggered", {
      eventId,
      viewerId: viewer.id,
      ann_results: candidateScoreMap.size,
      threshold: annLimit / 2
    })
    const { data, error } = await client
      .from("attendance")
      .select("user_id")
      .eq("event_id", eventId)
      .neq("user_id", viewer.id)
      .limit(fallbackLimit)

    if (error) {
      console.warn("Fallback candidate fetch failed:", error)
    } else {
      for (const row of data ?? []) {
        if (!row.user_id) continue
        if (!candidateScoreMap.has(row.user_id)) {
          candidateScoreMap.set(row.user_id, {})
        }
      }
      console.log("fallback_added", {
        eventId,
        viewerId: viewer.id,
        added: (data ?? []).length,
        total_after_fallback: candidateScoreMap.size
      })
    }
  }

  // Remove existing ids (already matched) if provided
  if (existingIds.size > 0) {
    for (const id of existingIds) {
      candidateScoreMap.delete(id)
    }
  }

  const candidateIds = Array.from(candidateScoreMap.keys())
  const profiles = await loadCandidateProfiles(client, eventId, candidateIds)

  const normalizeCompany = (value?: string | null) =>
    value ? value.toLowerCase().replace(/[^a-z0-9]+/g, "") : ""

  const viewerCompany = normalizeCompany(viewer.company)
  const filteredProfiles =
    viewerCompany.length === 0
      ? profiles
      : profiles.filter((profile) => normalizeCompany(profile.company) !== viewerCompany)

  return {
    candidates: filteredProfiles,
    seedCount: candidateIds.length
  }
}

