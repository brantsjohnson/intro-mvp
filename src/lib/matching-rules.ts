export type FunctionArea =
  | "marketing"
  | "sales"
  | "product"
  | "engineering"
  | "design"
  | "finance"
  | "operations"
  | "data"
  | "people"
  | "other"

export interface MatchingRuleWeights {
  career: {
    complementarySkills: number
    adjacentFunctions: number
    goalToExpertise: number
    sharedCareerStage: number
    parallelJourneys: number
    potentialCollaborations: number
    usefulContrasts: number
  }
  interests: {
    sharedHobbies: number
    alignedCategories: number
    personalityAdjacent: number
  }
  personality: {
    compatibleTypes: number
  }
  thresholds: {
    careerMin: number
    interestsMin: number
    pairTotalMin: number
  }
}

export const DEFAULT_RULE_WEIGHTS: MatchingRuleWeights = {
  career: {
    complementarySkills: 0.25,
    adjacentFunctions: 0.15,
    goalToExpertise: 0.25,
    sharedCareerStage: 0.1,
    parallelJourneys: 0.1,
    potentialCollaborations: 0.1,
    usefulContrasts: 0.05
  },
  interests: {
    sharedHobbies: 0.6,
    alignedCategories: 0.3,
    personalityAdjacent: 0.1
  },
  personality: {
    compatibleTypes: 1.0
  },
  thresholds: {
    careerMin: 0.25,
    interestsMin: 0.2,
    pairTotalMin: 0.4
  }
}

export const ADJACENT_FUNCTIONS: Array<[FunctionArea, FunctionArea]> = [
  ["marketing", "sales"],
  ["product", "engineering"],
  ["finance", "operations"],
  ["design", "product"],
  ["data", "product"],
  ["people", "operations"]
]

export const HOBBY_ALIASES: Record<string, string> = {
  "food": "Food & Drink",
  "cooking": "Food & Drink",
  "restaurants": "Food & Drink",
  "dining": "Food & Drink",
  "travel": "Travel",
  "hiking": "Outdoors & Travel",
  "camping": "Outdoors & Travel",
  "outdoors": "Outdoors & Travel",
  "running": "Wellness & Health",
  "yoga": "Wellness & Health",
  "fitness": "Wellness & Health",
  "comedy": "Comedy",
  "standup": "Comedy",
  "film": "Films",
  "movies": "Films",
  "pets": "Pets",
  "dogs": "Pets",
  "cats": "Pets",
  "concerts": "Live Music",
  "music": "Live Music",
  "gaming": "Gaming"
}

export const ALIGNED_HOBBY_CATEGORIES: Array<[string, string]> = [
  ["Food & Drink", "Travel"],
  ["Outdoors & Travel", "Wellness & Health"],
  ["Comedy", "Films"]
]

export const PERSONALITY_ADJACENT_HOBBIES: Record<string, string> = {
  "vinyl": "detail-oriented",
  "improv": "quick-thinking",
  "marathon": "perseverance"
}

