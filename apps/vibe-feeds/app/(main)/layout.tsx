import { ProfileMenu, Header, Layout, Content, VibeProvider } from "vibe-react";
import { appManifest } from "../lib/manifest";
import { SelectedUserProvider } from "../context/SelectedUserContext";
import { LeftSidebar } from "../components/LeftSidebar";
import "vibe-react/dist/vibe-react.css";

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
                        // left/right have sensible defaults now (logo + ProfileMenu)
                        // keep only center override when needed
                        center={
                            <div className="w-full max-w-[700px] px-2">
                                <input type="text" placeholder="What's on your mind?" className="w-full h-10 rounded-full bg-neutral-100 px-4 focus:outline-none focus:ring-2 focus:ring-blue-500" />
                            </div>
                        }
                        border
                    />
                    <Content left={<LeftSidebar />} topOffset={56}>
                        {children}
                    </Content>
                </Layout>
            </SelectedUserProvider>
        </VibeProvider>
    );
}
