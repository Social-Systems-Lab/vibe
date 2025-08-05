import { ProfileMenu, Header, Layout, Content, VibeProvider } from "vibe-react";
import { appManifest } from "../lib/manifest";
import "vibe-react/dist/vibe-react.css";
import { SelectedUserProvider } from "../context/SelectedUserContext";
import { LeftSidebar } from "../components/LeftSidebar";

export default function MainLayout({
    children,
}: Readonly<{
    children: React.ReactNode;
}>) {
    return (
        <VibeProvider config={appManifest}>
            <SelectedUserProvider>
                <Layout>
                    <Header
                        left={<div />}
                        center={null}
                        right={
                            <div className="flex items-center space-x-4 mr-2">
                                <ProfileMenu />
                            </div>
                        }
                        border
                        height={56}
                    />
                    <Content left={<LeftSidebar />} topOffset={56}>
                        {children}
                    </Content>
                </Layout>
            </SelectedUserProvider>
        </VibeProvider>
    );
}
