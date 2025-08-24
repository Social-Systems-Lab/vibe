import { VibeProvider, Layout, Content, NavPanel } from "vibe-react";
import { appManifest } from "../lib/manifest";
import ConsoleNav from "./components/ConsoleNav";

export default function MainLayout({
    children,
}: Readonly<{
    children: React.ReactNode;
}>) {
    return (
        <VibeProvider config={appManifest}>
            <Layout variant="dashboard">
                <NavPanel>
                    <ConsoleNav />
                </NavPanel>
                <Content>
                    <div className="w-full min-h-[calc(100vh-56px)]">
                        <div className="px-6 md:px-8 py-4 max-w-7xl">{children}</div>
                    </div>
                </Content>
            </Layout>
        </VibeProvider>
    );
}
