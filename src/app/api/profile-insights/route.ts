import { NextResponse } from "next/server"
import { AIService, ProfileData } from "@/lib/ai-service"

export const runtime = "nodejs"

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const { profileA, profileB } = body as { profileA: ProfileData, profileB: ProfileData }

    if (!profileA || !profileB) {
      return NextResponse.json({ error: "Missing profile data" }, { status: 400 })
    }

    const ai = new AIService()
    const insights = await ai.generateProfileInsights(profileA, profileB)
    return NextResponse.json({ insights })
  } catch (error) {
    console.error("profile-insights error", error)
    return NextResponse.json({ error: "Failed to generate insights" }, { status: 500 })
  }
}


