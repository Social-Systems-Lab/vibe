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
                <Header
                    height={56}
                    variant="console"
                    center={
                        <nav className="hidden md:flex items-center gap-6 text-sm">
                            <Link href="/" className="hover:text-primary">
                                Home
                            </Link>
                            <Link href="/app-grid" className="hover:text-primary">
                                Apps
                            </Link>
                            <Link href="/developers" className="hover:text-primary">
                                Developers
                            </Link>
                        </nav>
                    }
                />
                <Content topOffset={56} container="fluid" left={<ConsoleNav />}>
                    <div className="w-full px-6 md:px-8 py-2 max-w-7xl mx-auto">{children}</div>
                </Content>
            </Layout>
        </VibeProvider>
    );
}
