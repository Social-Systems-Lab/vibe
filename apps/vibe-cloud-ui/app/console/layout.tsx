"use client";

import React from "react";
import { usePathname } from "next/navigation";
import { VibeProvider, Layout, Content, NavPanel, TopBar } from "vibe-react";
import { appManifest } from "../lib/manifest";
import ConsoleNav, { consoleNavItems } from "./components/ConsoleNav";
import { PageTopBarProvider, usePageTopBar } from "./components/PageTopBarContext";

function TopBarPortal() {
    const { content } = usePageTopBar();
    const pathname = usePathname() || "/";

    let left = content;
    if (!left) {
        const match = consoleNavItems.find((it) => it.match(pathname));
        if (match) {
            const Icon = match.icon;
            left = (
                <div className="flex items-center gap-2">
                    <Icon size={16} className="text-foreground/70" />
                    <span className="text-sm md:text-base font-medium">{match.label}</span>
                </div>
            );
        } else {
            left = <div className="text-sm md:text-base font-medium">Vibe Cloud</div>;
        }
    }

    return (
        <div className="w-full h-[40px] flex items-center justify-between pr-24">
            <div className="flex items-center gap-2">{left}</div>
        </div>
    );
}

export default function ConsoleLayout({
    children,
}: Readonly<{
    children: React.ReactNode;
}>) {
    return (
        <VibeProvider config={appManifest} requireAuth>
            <PageTopBarProvider>
                <Layout variant="dashboard">
                    <TopBar border={false}>
                        <TopBarPortal />
                    </TopBar>
                    <NavPanel>
                        <ConsoleNav />
                    </NavPanel>
                    <Content>
                        <div className="w-full min-h-[calc(100vh-56px)]">
                            <div className="px-4 md:px-6 py-2 max-w-7xl">{children}</div>
                        </div>
                    </Content>
                </Layout>
            </PageTopBarProvider>
        </VibeProvider>
    );
}


