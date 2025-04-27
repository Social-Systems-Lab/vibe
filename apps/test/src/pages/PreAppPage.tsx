// apps/test/src/pages/PreAppPage.tsx
import { Link } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { VibeLogo } from "@/components/ui/VibeLogo";

function PreAppPage() {
    // This page simulates the state before the VibeProvider is initialized.
    // The AgentProvider is active (in RootLayout), so the IdentityPanel works,
    // but window.vibe.init() hasn't been called for this "site" yet.

    return (
        <Card className="bg-card/50 backdrop-blur-sm border-muted mt-10 max-w-lg mx-auto">
            <CardHeader className="items-center">
                <VibeLogo className="h-12 w-12 mb-4 text-primary" />
                <CardTitle className="text-2xl">Vibe Agent Active</CardTitle>
            </CardHeader>
            <CardContent className="text-center">
                <p className="mb-6 text-muted-foreground">
                    The Vibe Agent is running (you can manage identities above). Click below to enter the mock Vibe-enabled website.
                </p>
                <Button asChild size="lg">
                    <Link to="/app">Enter Mock Website</Link>
                </Button>
            </CardContent>
        </Card>
    );
}

export default PreAppPage;
