import type { Metadata } from "next";
import { Libre_Franklin, Wix_Madefor_Display } from "next/font/google";
import "./globals.css";
import "vibe-react/dist/vibe-react.css";

const libre_franklin = Libre_Franklin({
    subsets: ["latin"],
    display: "swap",
    variable: "--font-libre-franklin",
});

const wix_madefor_display = Wix_Madefor_Display({
    subsets: ["latin"],
    display: "swap",
    variable: "--font-wix-madefor-display",
});

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
            <body className={`${libre_franklin.variable} ${wix_madefor_display.variable}`}>{children}</body>
        </html>
    );
}
