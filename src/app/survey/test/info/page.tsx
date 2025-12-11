"use client"

import { useEffect, useState } from "react"
import { createClientComponentClient } from "@/lib/supabase"
import { getNetworkingMetrics } from "@/lib/networking-metrics"

export default function SurveyTestInfoPage() {
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
          .select('event_id')
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
          console.error('Failed to load metrics:', data)
          setError(data.error || 'Failed to load metrics')
          setLoading(false)
          return
        }

        console.log('Loaded metrics:', data)
        setMetrics(data)
        setLoading(false)
      } catch (err) {
        console.error('Error loading metrics:', err)
        setError('Failed to load networking metrics')
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
          <p className="text-muted-foreground">Loading networking summary...</p>
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

  // Render the same HTML structure as the email
  return (
    <div className="min-h-screen bg-[#EDEBE6] p-8">
      <div className="max-w-6xl mx-auto">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-bold text-[#3A3835] uppercase mb-2">Your Networking Summary</h1>
          <p className="text-sm text-[#7D7A73]">This is the same infographic sent in your email</p>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Event Card */}
          <div className="bg-[rgba(237,235,230,0.5)] border-2 border-[#BEBCB8] rounded-2xl p-8 min-h-[220px] flex flex-col justify-center">
            <p className="text-xl font-bold text-[#3A3835] uppercase mb-3 tracking-wide">Event Attended:</p>
            {metrics.eventLogoUrl ? (
              <img 
                src={metrics.eventLogoUrl} 
                alt={metrics.eventName} 
                className="max-w-[300px] max-h-[120px] object-contain mb-4"
              />
            ) : (
              <h2 className="text-5xl font-bold text-[#3A3835] uppercase leading-tight tracking-wide">
                {metrics.eventName}
              </h2>
            )}
          </div>

          {/* Top Companies */}
          <div className="bg-[rgba(237,235,230,0.5)] border-2 border-[#BEBCB8] rounded-2xl p-8">
            <h3 className="text-xl font-bold text-[#3A3835] uppercase mb-4 tracking-wide">Top Companies:</h3>
            <ul className="space-y-2">
              {metrics.topCompanies && metrics.topCompanies.length > 0 ? (
                metrics.topCompanies.map((company: string, idx: number) => (
                  <li key={idx} className="flex items-start gap-2 text-base text-[#3A3835]">
                    <span className="font-bold mt-0.5">•</span>
                    <span>{company}</span>
                  </li>
                ))
              ) : (
                <li className="text-[#7D7A73] italic">No companies listed</li>
              )}
            </ul>
          </div>

          {/* Connections Count */}
          <div className="bg-[rgba(237,235,230,0.5)] border-2 border-[#BEBCB8] rounded-2xl p-8 min-h-[280px] flex flex-col justify-center">
            <p className="text-xl font-bold text-[#3A3835] uppercase mb-4 tracking-wide">Number of People Connected With:</p>
            <div className="text-[144px] font-bold text-[#3A3835] leading-none tracking-wide">
              {metrics.connectionsCount || 0}
            </div>
          </div>

          {/* Top Industries */}
          <div className="bg-[rgba(237,235,230,0.5)] border-2 border-[#BEBCB8] rounded-2xl p-8">
            <h3 className="text-xl font-bold text-[#3A3835] uppercase mb-4 tracking-wide">Top Industries:</h3>
            <ul className="space-y-2">
              {metrics.topIndustries && metrics.topIndustries.length > 0 ? (
                metrics.topIndustries.map((industry: string, idx: number) => (
                  <li key={idx} className="flex items-start gap-2 text-base text-[#3A3835]">
                    <span className="font-bold mt-0.5">•</span>
                    <span>{industry}</span>
                  </li>
                ))
              ) : (
                <li className="text-[#7D7A73] italic">No industries listed</li>
              )}
            </ul>
          </div>

          {/* Common Titles */}
          <div className="bg-[rgba(237,235,230,0.5)] border-2 border-[#BEBCB8] rounded-2xl p-8 md:col-span-2">
            <h3 className="text-xl font-bold text-[#3A3835] uppercase mb-4 tracking-wide">Most Common Titles:</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {metrics.commonTitles && metrics.commonTitles.length > 0 ? (
                metrics.commonTitles.map((title: string, idx: number) => (
                  <div key={idx} className="flex items-start gap-2 text-base text-[#3A3835]">
                    <span className="font-bold mt-0.5">•</span>
                    <span>{title}</span>
                  </div>
                ))
              ) : (
                <div className="text-[#7D7A73] italic">No titles listed</div>
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="mt-8 text-center text-xs text-[#7D7A73]">
          <p>Powered by <strong className="font-bold">INTRO</strong></p>
          <p className="mt-1">introevent.site</p>
          {metrics.sponsor && (
            <p className="mt-2">Sponsored by <strong>{metrics.sponsor}</strong></p>
          )}
        </div>
      </div>
    </div>
  )
}
