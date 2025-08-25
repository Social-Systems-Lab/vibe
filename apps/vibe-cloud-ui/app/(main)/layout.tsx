"use client";
import React from "react";
import { VibeProvider, Layout, Content, NavPanel, TopBar, AppGridMenu, ProfileMenu } from "vibe-react";
import { appManifest } from "../lib/manifest";
import ConsoleNav from "./components/ConsoleNav";
import { PageTopBarProvider, usePageTopBar } from "./components/PageTopBarContext";

function TopBarPortal() {
    const { content } = usePageTopBar();
    return (
        <div className="w-full flex items-center justify-between">
            <div className="flex items-center gap-2">{content}</div>
            <div className="flex items-center gap-4">
                <AppGridMenu />
                <ProfileMenu />
            </div>
        </div>
    );
}

export default function MainLayout({
    children,
}: Readonly<{
    children: React.ReactNode;
}>) {
    return (
        <VibeProvider config={appManifest}>
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
