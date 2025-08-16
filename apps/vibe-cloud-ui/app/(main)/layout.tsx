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
            <Layout>
                <Header height={56} variant="console" border />
                <Content topOffset={56} container="fluid" left={<ConsoleNav />}>
                    <div className="w-full py-2 max-w-7xl">{children}</div>
                </Content>
            </Layout>
        </VibeProvider>
    );
}
