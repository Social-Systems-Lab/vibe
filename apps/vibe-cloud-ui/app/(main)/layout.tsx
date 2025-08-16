import { VibeProvider, ProfileMenu, Header, Layout, Content, LeftPanel } from "vibe-react";
import { appManifest } from "../lib/manifest";
import "vibe-react/dist/vibe-react.css";
import Link from "next/link";

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
                <Content topOffset={56}>{children}</Content>
            </Layout>
        </VibeProvider>
    );
}
