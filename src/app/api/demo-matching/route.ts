import { NextResponse } from 'next/server'
import { scoreAllPairs } from "@/lib/matching-engine"

export async function GET() {
  const nina = {
    id: "nina",
    first_name: "Nina",
    last_name: "Example",
    job_title: "Founder, Consultant",
    company: "Independent",
    what_do_you_do: "Helps small brands with positioning and social; wants to learn client acquisition",
    location: "",
    mbti: null,
    enneagram: "3",
    networking_goals: ["client acquisition", "mentorship"],
    hobbies: ["food", "restaurants", "travel"],
    expertise: ["brand", "content", "community"]
  }

  const marcus = {
    id: "marcus",
    first_name: "Marcus",
    last_name: "Example",
    job_title: "VP, Growth",
    company: "Acme Agency",
    what_do_you_do: "Scaled an agency from 0 to 200 clients; loves building simple acquisition systems",
    location: "",
    mbti: null,
    enneagram: "9",
    networking_goals: ["share playbooks", "meet builders"],
    hobbies: ["food", "cooking"],
    expertise: ["client acquisition", "sales", "ops"]
  }

  const results = scoreAllPairs([nina, marcus])
  return NextResponse.json({ profiles: [nina, marcus], matches: results })
}

