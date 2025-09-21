import { GradientButton } from "@/components/ui/gradient-button";
import { Card, CardContent } from "@/components/ui/card";
import { Users, QrCode, MessageSquare, Sparkles } from "lucide-react";

export default function Home() {
  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <div className="w-8 h-8 gradient-primary rounded-lg flex items-center justify-center">
                <Sparkles className="h-5 w-5 text-white" />
              </div>
              <h1 className="text-xl font-bold text-foreground">Intro</h1>
            </div>
            <GradientButton size="sm">
              Get Started
            </GradientButton>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <main className="container mx-auto px-4 py-12">
        <div className="text-center max-w-3xl mx-auto mb-12">
          <h2 className="text-4xl font-bold text-foreground mb-4">
            Connect with the right people at your next conference
          </h2>
          <p className="text-lg text-muted-foreground mb-8">
            AI-powered networking that helps you find meaningful connections based on career, personality, and shared interests.
          </p>
          <GradientButton size="lg" className="text-lg px-8">
            Start Networking
          </GradientButton>
        </div>

        {/* Features */}
        <div className="grid md:grid-cols-3 gap-6 max-w-4xl mx-auto">
          <Card className="bg-card border-border shadow-elevation">
            <CardContent className="p-6 text-center">
              <div className="w-12 h-12 gradient-primary rounded-xl flex items-center justify-center mx-auto mb-4">
                <Users className="h-6 w-6 text-white" />
              </div>
              <h3 className="text-lg font-semibold text-foreground mb-2">
                Smart Matching
              </h3>
              <p className="text-muted-foreground">
                Get personalized recommendations based on your career, personality, and interests.
              </p>
            </CardContent>
          </Card>

          <Card className="bg-card border-border shadow-elevation">
            <CardContent className="p-6 text-center">
              <div className="w-12 h-12 gradient-primary rounded-xl flex items-center justify-center mx-auto mb-4">
                <QrCode className="h-6 w-6 text-white" />
              </div>
              <h3 className="text-lg font-semibold text-foreground mb-2">
                QR Connections
              </h3>
              <p className="text-muted-foreground">
                Instantly connect with people by scanning QR codes or sharing your own.
              </p>
            </CardContent>
          </Card>

          <Card className="bg-card border-border shadow-elevation">
            <CardContent className="p-6 text-center">
              <div className="w-12 h-12 gradient-primary rounded-xl flex items-center justify-center mx-auto mb-4">
                <MessageSquare className="h-6 w-6 text-white" />
              </div>
              <h3 className="text-lg font-semibold text-foreground mb-2">
                Direct Messaging
              </h3>
              <p className="text-muted-foreground">
                Start conversations with your matches and build lasting professional relationships.
              </p>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}
