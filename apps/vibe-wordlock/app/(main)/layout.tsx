import { ProfileMenu, Header, Layout, Content, VibeProvider, TopBar, NavPanel } from "vibe-react";
import { appManifest } from "../lib/manifest";
import "vibe-react/dist/vibe-react.css";

export default function MainLayout({
    children,
}: Readonly<{
    children: React.ReactNode;
}>) {
    return (
        <VibeProvider config={appManifest}>
            <Layout variant="default">
                <NavPanel>
                    <div>Nav links</div>
                </NavPanel>
                <Content>
                    <div className="w-full min-h-[calc(100vh-56px)]">
                        <div className="px-4 md:px-6 py-2 max-w-7xl">{children}</div>
                    </div>
                </Content>
            </Layout>
        </VibeProvider>
    );
}
