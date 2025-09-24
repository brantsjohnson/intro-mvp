"use client"

interface ExpertiseSuggestionRequest {
  jobTitle: string
  company?: string
  careerGoals?: string
}

interface ExpertiseSuggestionResponse {
  suggestions: string[]
  success: boolean
  error?: string
}

// Cache for expertise suggestions to avoid repeated API calls
const expertiseCache = new Map<string, string[]>()

export class ExpertiseAIService {
  private static instance: ExpertiseAIService
  private debounceTimeout: NodeJS.Timeout | null = null

  static getInstance(): ExpertiseAIService {
    if (!ExpertiseAIService.instance) {
      ExpertiseAIService.instance = new ExpertiseAIService()
    }
    return ExpertiseAIService.instance
  }

  private normalizeJobTitle(jobTitle: string): string {
    return jobTitle.toLowerCase().trim()
  }

  private createCacheKey(jobTitle: string, company?: string): string {
    const normalizedTitle = this.normalizeJobTitle(jobTitle)
    const normalizedCompany = company ? company.toLowerCase().trim() : ''
    return `${normalizedTitle}:${normalizedCompany}`
  }

  private async callAIAPI(request: ExpertiseSuggestionRequest): Promise<string[]> {
    // AI removed: use local suggestion generator
    return this.generateMockSuggestions(request)
  }

  private async generateMockSuggestions(request: ExpertiseSuggestionRequest): Promise<string[]> {
    // Simulate API delay
    await new Promise(resolve => setTimeout(resolve, 800))

    const { jobTitle, company, careerGoals } = request
    const title = jobTitle.toLowerCase().trim()
    
    // Generate contextual suggestions based on job title
    let suggestions: string[] = []
    
    // Debug logging
    console.log('Generating suggestions for job title:', title)
    
    if (title.includes('engineer') || title.includes('developer') || title.includes('programmer')) {
      console.log('Matched: Engineering/Development')
      suggestions = [
        'Software Development',
        'System Architecture', 
        'Code Review',
        'Technical Leadership',
        'API Design',
        'Database Management'
      ]
    } else if (title.includes('designer') || title.includes('ux') || title.includes('ui')) {
      suggestions = [
        'User Experience Design',
        'Visual Design',
        'Prototyping',
        'Design Systems',
        'User Research',
        'Interface Design'
      ]
    } else if (title.includes('manager') || title.includes('director') || title.includes('lead')) {
      suggestions = [
        'Team Leadership',
        'Project Management',
        'Strategic Planning',
        'Process Improvement',
        'Stakeholder Management',
        'Budget Planning'
      ]
    } else if (title.includes('marketing') || title.includes('growth') || title.includes('brand')) {
      suggestions = [
        'Digital Marketing',
        'Content Strategy',
        'Brand Management',
        'Campaign Planning',
        'Analytics',
        'Social Media'
      ]
    } else if (title.includes('sales') || title.includes('business development')) {
      suggestions = [
        'Client Relations',
        'Sales Strategy',
        'Lead Generation',
        'Negotiation',
        'Market Analysis',
        'Revenue Growth'
      ]
    } else if (title.includes('product') || title.includes('pm')) {
      suggestions = [
        'Product Strategy',
        'Feature Planning',
        'User Stories',
        'Market Research',
        'Roadmap Development',
        'Cross-functional Collaboration'
      ]
    } else if (title.includes('data') || title.includes('analyst') || title.includes('scientist')) {
      suggestions = [
        'Data Analysis',
        'Statistical Modeling',
        'Machine Learning',
        'Data Visualization',
        'Predictive Analytics',
        'Database Querying'
      ]
    } else if (title.includes('finance') || title.includes('accounting') || title.includes('cfo')) {
      suggestions = [
        'Financial Analysis',
        'Budget Management',
        'Risk Assessment',
        'Investment Strategy',
        'Financial Reporting',
        'Cost Optimization'
      ]
    } else if (title.includes('hr') || title.includes('human resources') || title.includes('people')) {
      suggestions = [
        'Talent Acquisition',
        'Employee Relations',
        'Performance Management',
        'Training & Development',
        'Organizational Culture',
        'Compensation Planning'
      ]
    } else if (title.includes('player') || title.includes('athlete') || title.includes('sport')) {
      console.log('Matched: Sports/Athletics')
      suggestions = [
        'Performance Training',
        'Team Leadership',
        'Strategic Planning',
        'Public Speaking',
        'Brand Management',
        'Community Engagement'
      ]
    } else if (title.includes('teacher') || title.includes('educator') || title.includes('instructor')) {
      suggestions = [
        'Curriculum Development',
        'Student Engagement',
        'Educational Technology',
        'Assessment Design',
        'Classroom Management',
        'Learning Analytics'
      ]
    } else if (title.includes('doctor') || title.includes('physician') || title.includes('medical')) {
      suggestions = [
        'Patient Care',
        'Medical Diagnosis',
        'Treatment Planning',
        'Healthcare Technology',
        'Medical Research',
        'Clinical Leadership'
      ]
    } else if (title.includes('lawyer') || title.includes('attorney') || title.includes('legal')) {
      suggestions = [
        'Legal Research',
        'Case Management',
        'Client Advocacy',
        'Contract Negotiation',
        'Legal Writing',
        'Courtroom Presentation'
      ]
    } else if (title.includes('artist') || title.includes('creative') || title.includes('design')) {
      suggestions = [
        'Creative Direction',
        'Visual Communication',
        'Brand Identity',
        'Digital Art',
        'Concept Development',
        'Portfolio Management'
      ]
    } else if (title.includes('writer') || title.includes('author') || title.includes('content')) {
      suggestions = [
        'Content Strategy',
        'Storytelling',
        'Copywriting',
        'SEO Writing',
        'Content Marketing',
        'Editorial Management'
      ]
    } else if (title.includes('consultant') || title.includes('advisor') || title.includes('freelance')) {
      suggestions = [
        'Client Relations',
        'Project Management',
        'Business Strategy',
        'Problem Solving',
        'Industry Expertise',
        'Process Optimization'
      ]
    } else {
      // Generic suggestions for unknown roles
      console.log('Matched: Generic (no specific category found)')
      suggestions = [
        'Problem Solving',
        'Communication',
        'Project Coordination',
        'Process Optimization',
        'Client Service',
        'Strategic Thinking'
      ]
    }

    // Modify suggestions based on company context
    if (company) {
      const companyLower = company.toLowerCase()
      if (companyLower.includes('startup') || companyLower.includes('tech')) {
        // Add startup-specific skills
        suggestions = suggestions.map(s => 
          s === 'Strategic Planning' ? 'Startup Strategy' :
          s === 'Process Improvement' ? 'Rapid Iteration' :
          s
        )
      }
    }

    // Modify suggestions based on career goals
    if (careerGoals) {
      const goalsLower = careerGoals.toLowerCase()
      if (goalsLower.includes('leadership') || goalsLower.includes('manage')) {
        suggestions = suggestions.filter(s => 
          !s.includes('Development') && !s.includes('Design')
        ).concat(['Team Leadership', 'Strategic Planning'])
      }
    }

    return suggestions.slice(0, 6) // Ensure exactly 6 suggestions
  }

  async getExpertiseSuggestions(
    request: ExpertiseSuggestionRequest,
    debounceMs: number = 1000
  ): Promise<ExpertiseSuggestionResponse> {
    return new Promise((resolve) => {
      // Clear existing timeout
      if (this.debounceTimeout) {
        clearTimeout(this.debounceTimeout)
      }

      // Check cache first
      const cacheKey = this.createCacheKey(request.jobTitle, request.company)
      const cached = expertiseCache.get(cacheKey)
      if (cached) {
        resolve({
          suggestions: cached,
          success: true
        })
        return
      }

      // Set new timeout for debounced API call
      this.debounceTimeout = setTimeout(async () => {
        try {
          const suggestions = await this.callAIAPI(request)
          
          // Cache the results
          expertiseCache.set(cacheKey, suggestions)
          
          resolve({
            suggestions,
            success: true
          })
        } catch (error) {
          resolve({
            suggestions: [],
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error'
          })
        }
      }, debounceMs)
    })
  }

  // Method to refresh suggestions (bypass cache)
  async refreshSuggestions(request: ExpertiseSuggestionRequest): Promise<ExpertiseSuggestionResponse> {
    const cacheKey = this.createCacheKey(request.jobTitle, request.company)
    expertiseCache.delete(cacheKey) // Remove from cache
    
    try {
      const suggestions = await this.callAIAPI(request)
      expertiseCache.set(cacheKey, suggestions)
      
      return {
        suggestions,
        success: true
      }
    } catch (error) {
      return {
        suggestions: [],
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      }
    }
  }

  // Clear cache (useful for testing or when user changes significantly)
  clearCache(): void {
    expertiseCache.clear()
  }
}

export const expertiseAIService = ExpertiseAIService.getInstance()
