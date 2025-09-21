import * as React from "react"
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion"
import { cn } from "@/lib/utils"

interface AccordionSectionProps {
  title: string
  children: React.ReactNode
  defaultOpen?: boolean
  className?: string
}

export function AccordionSection({ 
  title, 
  children, 
  defaultOpen = true,
  className 
}: AccordionSectionProps) {
  return (
    <Accordion 
      type="single" 
      collapsible 
      defaultValue={defaultOpen ? "item-1" : undefined}
      className={cn("w-full", className)}
    >
      <AccordionItem value="item-1" className="border-none">
        <AccordionTrigger className="text-left text-foreground hover:no-underline py-4">
          <span className="text-lg font-medium">{title}</span>
        </AccordionTrigger>
        <AccordionContent className="pb-4 text-muted-foreground">
          {children}
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  )
}
