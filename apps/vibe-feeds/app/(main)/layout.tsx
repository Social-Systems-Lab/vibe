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
                        left={
                            <div className="flex items-center space-x-2 px-3">
                                <img src="/images/logotype.png" alt="Feeds" className="h-8" />
                            </div>
                        }
                        center={
                            <div className="w-full max-w-[700px] px-2">
                                <input type="text" placeholder="What's on your mind?" className="w-full h-10 rounded-full bg-neutral-100 px-4 focus:outline-none focus:ring-2 focus:ring-blue-500" />
                            </div>
                        }
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
