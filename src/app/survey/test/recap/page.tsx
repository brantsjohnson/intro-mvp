"use client"

import { useEffect, useState } from "react"
import { createClientComponentClient } from "@/lib/supabase"
import { NetworkingCardDisplay } from "@/components/survey/networking-card"

export default function SurveyTestRecapPage() {
  const [metrics, setMetrics] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const loadMetrics = async () => {
      try {
        const supabase = createClientComponentClient()
        const { data: { user } } = await supabase.auth.getUser()
        
        if (!user) {
          setError('You must be logged in')
          setLoading(false)
          return
        }

        // Find event TEST12
        const { data: event } = await supabase
          .from('events')
          .select('event_id, event_name')
          .eq('event_code', 'TEST12')
          .single()

        if (!event) {
          setError('Event TEST12 not found')
          setLoading(false)
          return
        }

        // Get metrics via API
        const response = await fetch(`/api/networking-metrics?eventId=${event.event_id}&userId=${user.id}`)
        const data = await response.json()
        
        if (!response.ok) {
          setError(data.error || 'Failed to load metrics')
          setLoading(false)
          return
        }

        setMetrics(data)
        setLoading(false)
      } catch (err) {
        console.error('Error loading metrics:', err)
        setError('Failed to load networking summary')
        setLoading(false)
      }
    }

    loadMetrics()
  }, [])

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading your networking summary...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center text-destructive">
          <p>{error}</p>
        </div>
      </div>
    )
  }

  if (!metrics) {
    return null
  }

  return (
    <div className="min-h-screen bg-background px-4 py-12">
      <div className="mx-auto max-w-4xl">
        <div className="text-center mb-8">
          <div className="mb-2">
            <span className="inline-block px-2 py-1 text-xs font-semibold text-muted-foreground bg-muted rounded">
              TEST MODE
            </span>
          </div>
          <h1 className="text-xl font-bold text-foreground uppercase mb-3" style={{ letterSpacing: '0.02em' }}>
            Thanks for your feedback!
          </h1>
          <p className="text-muted-foreground">
            This event summary was also sent to your email.
          </p>
        </div>

        <div className="space-y-6">
          <NetworkingCardDisplay metrics={metrics} />
        </div>
      </div>
    </div>
  )
}

