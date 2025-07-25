import { VibeProvider } from "../components/VibeProvider";
import { Header } from "../components/Header";
import { LeftSidebar } from "../components/LeftSidebar";
import { RightSidebar } from "../components/RightSidebar";

export default function MainLayout({
    children,
}: Readonly<{
    children: React.ReactNode;
}>) {
    return (
        <VibeProvider>
            <Header />
            <main>{children}</main>
        </VibeProvider>
    );
}
