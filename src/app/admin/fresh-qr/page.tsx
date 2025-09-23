import { FreshQRDisplay } from "@/components/ui/fresh-qr-display"

export default function FreshQRPage() {
  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-8">
        <div className="max-w-md mx-auto">
          <div className="text-center mb-8">
            <h1 className="text-3xl font-bold text-foreground mb-2">
              FRESH Event QR Code
            </h1>
            <p className="text-muted-foreground">
              Permanent QR code for the FRESH networking event
            </p>
          </div>
          
          <FreshQRDisplay />
          
          <div className="mt-8 p-4 bg-muted/50 rounded-lg">
            <h3 className="font-semibold text-foreground mb-2">Instructions:</h3>
            <ol className="text-sm text-muted-foreground space-y-1 list-decimal list-inside">
              <li>Download the QR code image</li>
              <li>Print it or display it on a screen</li>
              <li>Users can scan it to join the FRESH event</li>
              <li>New users will be prompted to create an account</li>
            </ol>
          </div>
        </div>
      </div>
    </div>
  )
}
