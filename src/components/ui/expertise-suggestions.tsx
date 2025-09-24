"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { expertiseAIService } from "@/lib/expertise-ai-service"
import { Plus, RefreshCw, Sparkles } from "lucide-react"
import { cn } from "@/lib/utils"

interface ExpertiseSuggestionsProps {
  jobTitle: string
  company: string
  careerGoals: string
  selectedExpertise: string[]
  customExpertise: string[]
  onExpertiseChange: (expertise: string[]) => void
  onCustomExpertiseChange: (expertise: string[]) => void
  className?: string
}

export function ExpertiseSuggestions({
  jobTitle,
  company,
  careerGoals,
  selectedExpertise,
  customExpertise,
  onExpertiseChange,
  onCustomExpertiseChange,
  className
}: ExpertiseSuggestionsProps) {
  const [suggestions, setSuggestions] = useState<string[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [hasGenerated, setHasGenerated] = useState(false)
  const [newCustomTag, setNewCustomTag] = useState("")
  const [error, setError] = useState<string | null>(null)

  // Generate suggestions when job title or company changes
  useEffect(() => {
    if (jobTitle.trim() && !hasGenerated) {
      generateSuggestions()
    }
  }, [jobTitle, company, careerGoals])

  const generateSuggestions = async () => {
    if (!jobTitle.trim()) return

    setIsLoading(true)
    setError(null)

    try {
      const response = await expertiseAIService.getExpertiseSuggestions({
        jobTitle: jobTitle.trim(),
        company: company.trim() || undefined,
        careerGoals: careerGoals.trim() || undefined
      })

      if (response.success) {
        setSuggestions(response.suggestions)
        setHasGenerated(true)
      } else {
        setError(response.error || "Failed to generate suggestions")
      }
    } catch (err) {
      setError("Failed to generate suggestions")
    } finally {
      setIsLoading(false)
    }
  }

  const refreshSuggestions = async () => {
    setIsLoading(true)
    setError(null)

    try {
      const response = await expertiseAIService.refreshSuggestions({
        jobTitle: jobTitle.trim(),
        company: company.trim() || undefined,
        careerGoals: careerGoals.trim() || undefined
      })

      if (response.success) {
        setSuggestions(response.suggestions)
      } else {
        setError(response.error || "Failed to refresh suggestions")
      }
    } catch (err) {
      setError("Failed to refresh suggestions")
    } finally {
      setIsLoading(false)
    }
  }

  const handleSuggestionToggle = (suggestion: string) => {
    const isSelected = selectedExpertise.includes(suggestion)
    if (isSelected) {
      onExpertiseChange(selectedExpertise.filter(item => item !== suggestion))
    } else {
      onExpertiseChange([...selectedExpertise, suggestion])
    }
  }

  const addCustomTag = () => {
    if (newCustomTag.trim() && !customExpertise.includes(newCustomTag.trim()) && !selectedExpertise.includes(newCustomTag.trim())) {
      onCustomExpertiseChange([...customExpertise, newCustomTag.trim()])
      setNewCustomTag("")
    }
  }

  const removeCustomTag = (tag: string) => {
    onCustomExpertiseChange(customExpertise.filter(item => item !== tag))
  }

  const allSelectedExpertise = [...selectedExpertise, ...customExpertise]

  return (
    <div className={cn("space-y-4", className)}>
      {/* AI Suggestions */}
      {jobTitle.trim() && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <h4 className="text-sm font-medium text-foreground">Areas of Expertise</h4>
              {isLoading && (
                <div className="flex items-center space-x-1 text-xs text-muted-foreground">
                  <Sparkles className="h-3 w-3 animate-pulse" />
                  <span>Powered by AI</span>
                </div>
              )}
            </div>
            {hasGenerated && !isLoading && (
              <Button
                variant="ghost"
                size="sm"
                onClick={refreshSuggestions}
                className="h-6 px-2 text-xs"
              >
                <RefreshCw className="h-3 w-3 mr-1" />
                Refresh
              </Button>
            )}
          </div>

          {/* Loading State */}
          {isLoading && (
            <div className="flex items-center space-x-2 text-sm text-muted-foreground">
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary"></div>
              <span>Generating suggestions...</span>
            </div>
          )}

          {/* Error State */}
          {error && (
            <div className="text-sm text-destructive bg-destructive/10 p-2 rounded-lg">
              {error}
            </div>
          )}

          {/* Suggestions */}
          {suggestions.length > 0 && !isLoading && (
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">
                Suggested based on your role:
              </p>
              <div className="flex flex-wrap gap-2">
                {suggestions.map((suggestion) => {
                  const isSelected = selectedExpertise.includes(suggestion)
                  return (
                    <button
                      key={suggestion}
                      onClick={() => handleSuggestionToggle(suggestion)}
                      className={cn(
                        "inline-flex items-center px-3 py-1 rounded-full text-sm border transition-colors",
                        isSelected
                          ? "bg-primary/10 text-primary border-primary/20"
                          : "bg-muted/50 text-foreground border-border hover:bg-primary/10 hover:border-primary/20"
                      )}
                    >
                      {isSelected ? "✓" : "+"} {suggestion}
                    </button>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Custom Expertise Input */}
      <div className="space-y-2">
        <div className="flex space-x-2">
          <Input
            value={newCustomTag}
            onChange={(e) => setNewCustomTag(e.target.value)}
            placeholder="Add your own expertise area"
            className="rounded-xl"
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                addCustomTag()
              }
            }}
          />
          <Button onClick={addCustomTag} size="sm" disabled={!newCustomTag.trim()}>
            <Plus className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Selected Custom Tags */}
      {customExpertise.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">Your custom expertise:</p>
          <div className="flex flex-wrap gap-2">
            {customExpertise.map((tag) => (
              <span
                key={tag}
                className="inline-flex items-center px-3 py-1 rounded-full text-sm bg-primary/10 text-primary border border-primary/20"
              >
                {tag}
                <button
                  onClick={() => removeCustomTag(tag)}
                  className="ml-2 hover:text-destructive"
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Show message if no job title entered */}
      {!jobTitle.trim() && (
        <div className="text-sm text-muted-foreground bg-muted/30 p-3 rounded-lg">
          Enter your job title above to see AI-powered expertise suggestions
        </div>
      )}
    </div>
  )
}
