"use client"

interface NetworkingCardProps {
  eventId: string
  userId: string
}

export function NetworkingCard({ eventId, userId }: NetworkingCardProps) {
  // This will be populated by the parent component with metrics data
  return null
}

interface NetworkingCardDisplayProps {
  metrics: {
    eventName: string
    connectionsCount: number
    topCompanies: string[]
    topIndustries: string[]
    commonTitles: string[]
    eventLogoUrl?: string | null
    sponsor?: string
  }
}

export function NetworkingCardDisplay({ metrics }: NetworkingCardDisplayProps) {
  return (
    <div className="w-full">
      <div className="bg-[#EDEBE6] p-6 rounded-lg">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Event Card */}
          <div className="bg-[rgba(237,235,230,0.5)] border-2 border-[#BEBCB8] rounded-2xl p-6 min-h-[180px] flex flex-col justify-center">
            <p className="text-lg font-bold text-[#3A3835] uppercase mb-2 tracking-wide text-sm">Event Attended:</p>
            {metrics.eventLogoUrl ? (
              <img 
                src={metrics.eventLogoUrl} 
                alt={metrics.eventName} 
                className="max-w-[250px] max-h-[100px] object-contain mb-2"
              />
            ) : (
              <h2 className="text-3xl md:text-4xl font-bold text-[#3A3835] uppercase leading-tight tracking-wide">
                {metrics.eventName}
              </h2>
            )}
          </div>

          {/* Top Companies */}
          <div className="bg-[rgba(237,235,230,0.5)] border-2 border-[#BEBCB8] rounded-2xl p-6">
            <h3 className="text-lg font-bold text-[#3A3835] uppercase mb-3 tracking-wide text-sm">Top Companies:</h3>
            <ul className="space-y-1.5">
              {metrics.topCompanies && metrics.topCompanies.length > 0 ? (
                metrics.topCompanies.map((company: string, idx: number) => (
                  <li key={idx} className="flex items-start gap-2 text-sm text-[#3A3835]">
                    <span className="font-bold mt-0.5">•</span>
                    <span>{company}</span>
                  </li>
                ))
              ) : (
                <li className="text-[#7D7A73] italic text-sm">No companies listed</li>
              )}
            </ul>
          </div>

          {/* Connections Count */}
          <div className="bg-[rgba(237,235,230,0.5)] border-2 border-[#BEBCB8] rounded-2xl p-6 min-h-[220px] flex flex-col justify-center">
            <p className="text-lg font-bold text-[#3A3835] uppercase mb-3 tracking-wide text-sm">Number of People Connected With:</p>
            <div className="text-8xl md:text-9xl font-bold text-[#3A3835] leading-none tracking-wide">
              {metrics.connectionsCount || 0}
            </div>
          </div>

          {/* Top Industries */}
          <div className="bg-[rgba(237,235,230,0.5)] border-2 border-[#BEBCB8] rounded-2xl p-6">
            <h3 className="text-lg font-bold text-[#3A3835] uppercase mb-3 tracking-wide text-sm">Top Industries:</h3>
            <ul className="space-y-1.5">
              {metrics.topIndustries && metrics.topIndustries.length > 0 ? (
                metrics.topIndustries.map((industry: string, idx: number) => (
                  <li key={idx} className="flex items-start gap-2 text-sm text-[#3A3835]">
                    <span className="font-bold mt-0.5">•</span>
                    <span>{industry}</span>
                  </li>
                ))
              ) : (
                <li className="text-[#7D7A73] italic text-sm">No industries listed</li>
              )}
            </ul>
          </div>

          {/* Common Titles */}
          <div className="bg-[rgba(237,235,230,0.5)] border-2 border-[#BEBCB8] rounded-2xl p-6 md:col-span-2">
            <h3 className="text-lg font-bold text-[#3A3835] uppercase mb-3 tracking-wide text-sm">Most Common Titles:</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {metrics.commonTitles && metrics.commonTitles.length > 0 ? (
                metrics.commonTitles.map((title: string, idx: number) => (
                  <div key={idx} className="flex items-start gap-2 text-sm text-[#3A3835]">
                    <span className="font-bold mt-0.5">•</span>
                    <span>{title}</span>
                  </div>
                ))
              ) : (
                <div className="text-[#7D7A73] italic text-sm">No titles listed</div>
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="mt-6 text-center text-xs text-[#7D7A73]">
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
