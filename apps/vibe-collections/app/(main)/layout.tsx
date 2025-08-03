import { ProfileMenu } from "vibe-react";
import { VibeProvider } from "../components/VibeProvider";
import "vibe-react/dist/vibe-react.css";

export default function MainLayout({
    children,
}: Readonly<{
    children: React.ReactNode;
}>) {
    return (
        <VibeProvider>
            <main>{children}</main>
        </VibeProvider>
    );
}
