import { VibeProvider, ProfileMenu, Header, Layout, Content, LeftPanel } from "vibe-react";
import { appManifest } from "../lib/manifest";
import "vibe-react/dist/vibe-react.css";
import Link from "next/link";
import ConsoleNav from "./components/ConsoleNav";

export default function MainLayout({
    children,
}: Readonly<{
    children: React.ReactNode;
}>) {
    return (
        <VibeProvider config={appManifest}>
            <Layout className="bg-[#fbfbfb]">
                <Header height={56} variant="console" backgroundClass="bg-[#fbfbfb]" />
                <Content topOffset={56} container="fluid" left={<ConsoleNav />}>
                    <div className="w-full min-h-[calc(100vh-56px)] bg-background rounded-tl-2xl shadow-sm">
                        <div className="px-6 md:px-8 py-4 max-w-7xl">{children}</div>
                    </div>
                </Content>
            </Layout>
        </VibeProvider>
    );
}
