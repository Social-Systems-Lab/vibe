import { ProfileMenu, Header, Layout, Content, LeftPanel } from "vibe-react";
import { VibeProvider } from "../components/VibeProvider";
import "vibe-react/dist/vibe-react.css";

export default function MainLayout({
    children,
}: Readonly<{
    children: React.ReactNode;
}>) {
    return (
        <VibeProvider>
            <Layout>
                <Header
                    left={
                        <div className="flex items-center space-x-2 px-3">
                            <img src="/images/logotype.png" alt="Vibe" className="h-8" />
                        </div>
                    }
                    center={null}
                    right={
                        <div className="flex items-center space-x-4 mr-2">
                            <ProfileMenu />
                        </div>
                    }
                    border
                    height={56}
                />
                <Content
                    left={
                        <LeftPanel padded topOffset={56}>
                            <div className="space-y-4 fixed min-w-[200px] pt-3 pl-6">
                                <div className="flex items-center space-x-2 px-3">
                                    <img src="/images/logotype.png" alt="Vibe" className="h-8" />
                                </div>
                            </div>
                        </LeftPanel>
                    }
                    topOffset={56}
                >
                    {children}
                </Content>
            </Layout>
        </VibeProvider>
    );
}
