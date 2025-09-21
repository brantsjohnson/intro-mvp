import * as React from "react"
import { Input } from "@/components/ui/input"
import { Card, CardContent } from "@/components/ui/card"
import { PresenceAvatar } from "@/components/ui/presence-avatar"
import { Search, Users } from "lucide-react"
import { cn } from "@/lib/utils"

interface Attendee {
  id: string
  name: string
  jobTitle: string
  company?: string
  avatarUrl?: string
  isPresent?: boolean
}

interface DirectorySearchProps {
  attendees: Attendee[]
  onSelectAttendee: (attendee: Attendee) => void
  className?: string
}

export function DirectorySearch({ attendees, onSelectAttendee, className }: DirectorySearchProps) {
  const [searchQuery, setSearchQuery] = React.useState("")
  const [isOpen, setIsOpen] = React.useState(false)

  const filteredAttendees = React.useMemo(() => {
    if (!searchQuery.trim()) return []
    
    const query = searchQuery.toLowerCase()
    return attendees.filter(attendee => 
      attendee.name.toLowerCase().includes(query) ||
      attendee.jobTitle.toLowerCase().includes(query) ||
      attendee.company?.toLowerCase().includes(query)
    ).slice(0, 5) // Limit to 5 results
  }, [attendees, searchQuery])

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchQuery(e.target.value)
    setIsOpen(e.target.value.length > 0)
  }

  const handleSelectAttendee = (attendee: Attendee) => {
    onSelectAttendee(attendee)
    setSearchQuery("")
    setIsOpen(false)
  }

  return (
    <div className={cn("relative", className)}>
      <div className="relative">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          type="text"
          placeholder="Search attendees..."
          value={searchQuery}
          onChange={handleInputChange}
          onFocus={() => setIsOpen(searchQuery.length > 0)}
          className="pl-10 rounded-xl"
        />
      </div>

      {isOpen && (
        <Card className="absolute top-full left-0 right-0 mt-2 z-50 bg-card border-border shadow-elevation">
          <CardContent className="p-0">
            {filteredAttendees.length > 0 ? (
              <div className="max-h-60 overflow-y-auto">
                {filteredAttendees.map((attendee) => (
                  <div
                    key={attendee.id}
                    onClick={() => handleSelectAttendee(attendee)}
                    className="flex items-center space-x-3 p-3 hover:bg-muted/50 cursor-pointer border-b border-border last:border-b-0"
                  >
                    <PresenceAvatar
                      src={attendee.avatarUrl}
                      fallback={attendee.name.split(' ').map(n => n[0]).join('')}
                      isPresent={attendee.isPresent}
                      size="sm"
                    />
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-foreground truncate">
                        {attendee.name}
                      </p>
                      <p className="text-sm text-muted-foreground truncate">
                        {attendee.jobTitle}
                        {attendee.company && ` at ${attendee.company}`}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            ) : searchQuery.length > 0 ? (
              <div className="p-4 text-center text-muted-foreground">
                <Users className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p>No attendees found</p>
              </div>
            ) : null}
          </CardContent>
        </Card>
      )}
    </div>
  )
}
