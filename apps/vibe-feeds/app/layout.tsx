import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import "vibe-react/dist/vibe-react.css";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
    title: "Vibe Feeds",
    description: "A decentralized social media feed built with Vibe",
};

export default function RootLayout({
    children,
}: Readonly<{
    children: React.ReactNode;
}>) {
    return (
        <html lang="en">
            <body className={inter.className}>{children}</body>
        </html>
    );
}
