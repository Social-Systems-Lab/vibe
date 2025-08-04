import { ProfileMenu } from "vibe-react";
import { VibeProvider } from "vibe-react";
import { appManifest } from "../lib/manifest";
import "vibe-react/dist/vibe-react.css";
import { SelectedUserProvider } from "../context/SelectedUserContext";

export default function MainLayout({
    children,
}: Readonly<{
    children: React.ReactNode;
}>) {
    return (
        <VibeProvider config={appManifest}>
            <SelectedUserProvider>
                <header className="fixed top-0 left-0 right-0 z-10 flex items-center justify-between p-2 pointer-events-none">
                    <div></div>
                    <div className="flex items-center space-x-4 mr-6 pointer-events-auto">
                        <ProfileMenu />
                    </div>
                </header>
                <main>{children}</main>
            </SelectedUserProvider>
        </VibeProvider>
    );
}
