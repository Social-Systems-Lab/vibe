import { VibeProvider, ProfileMenu, Header, Layout, Content, LeftPanel } from "vibe-react";
import { appManifest } from "../lib/manifest";
import "vibe-react/dist/vibe-react.css";

export default function MainLayout({
    children,
}: Readonly<{
    children: React.ReactNode;
}>) {
    return (
        <VibeProvider config={appManifest}>
            <Layout>
                <Header height={56} />
                <Content topOffset={56}>{children}</Content>
            </Layout>
        </VibeProvider>
    );
}
