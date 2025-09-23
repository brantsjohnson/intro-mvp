import * as React from "react"
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion"
import { cn } from "@/lib/utils"

interface AccordionSectionProps {
  title: string
  children: React.ReactNode
  defaultOpen?: boolean
  className?: string
  variant?: "default" | "gradient"
}

export function AccordionSection({ 
  title, 
  children, 
  defaultOpen = true,
  className,
  variant = "default"
}: AccordionSectionProps) {
  if (variant === "gradient") {
    return (
      <Accordion 
        type="single" 
        collapsible 
        defaultValue={defaultOpen ? "item-1" : undefined}
        className={cn("w-full", className)}
      >
        <AccordionItem value="item-1" className="border-none">
          <div className="bg-card border border-border rounded-2xl overflow-hidden shadow-elevation">
            <AccordionTrigger className="text-left hover:no-underline py-4 px-6 bg-card">
              <span className="text-lg font-medium bg-gradient-to-r from-[#EC874E] to-[#BF341E] bg-clip-text text-transparent">{title}</span>
            </AccordionTrigger>
            <AccordionContent className="pt-4 pb-4 px-6 text-white bg-card">
              {children}
            </AccordionContent>
          </div>
        </AccordionItem>
      </Accordion>
    )
  }

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
        <AccordionContent className="pt-4 pb-4 text-muted-foreground">
          {children}
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  )
}
