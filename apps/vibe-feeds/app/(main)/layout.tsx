import { VibeProvider } from "../components/VibeProvider";

export default function MainLayout({
    children,
}: Readonly<{
    children: React.ReactNode;
}>) {
    return (
        <VibeProvider>
            <main>{children}</main>
        </VibeProvider>
    );
}
