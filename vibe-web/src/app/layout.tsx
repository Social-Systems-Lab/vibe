import { Metadata } from "next";
import { Libre_Franklin } from "next/font/google";
import Image from "next/image";
import Link from "next/link";
import type React from "react";
import "./globals.css";

const libreFranklin = Libre_Franklin({ subsets: ["latin"], weight: ["400", "600", "700"] });

export const metadata: Metadata = {
    title: "Vibe - Your Everything",
    description: "Vibe puts your digital life in your hands—move freely across an open ecosystem of apps and services.",
    metadataBase: new URL("https://vibeapp.dev/"),
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
    return (
        <html lang="en">
            <body className={`min-h-screen bg-gradient-to-br from-blue-500 to-purple-400 ${libreFranklin.className}`}>
                <nav className="max-w-7xl mx-auto pt-6 px-4 sm:px-6 lg:px-8">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-6">
                            <Link href="/" className="flex items-center space-x-2">
                                <Image src="/logo.png" alt="Vibe Logo" width={32} height={32} className="w-8 h-8" />
                                <span className="text-white text-xl font-semibold">Vibe</span>
                            </Link>
                            <Link href="/developers" className="text-white hover:text-white/80 transition-colors">
                                Developers
                            </Link>
                            <Link href="/manifesto" className="text-white hover:text-white/80 transition-colors">
                                Manifesto
                            </Link>
                            {/* <Link href="/blog" className="text-white hover:text-white/80 transition-colors">
                                Blog
                            </Link>
                            <Link href="/apps" className="text-white hover:text-white/80 transition-colors">
                                Apps
                            </Link> */}
                        </div>
                        {/* <div className="relative">
                            <input
                                type="text"
                                placeholder="Search..."
                                className="bg-white/10 text-white placeholder-white/50 rounded-full py-2 px-4 focus:outline-none focus:ring-2 focus:ring-white/50"
                            />
                            <svg
                                className="absolute right-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-white/50"
                                fill="none"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth="2"
                                viewBox="0 0 24 24"
                                stroke="currentColor"
                            >
                                <path d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path>
                            </svg>
                        </div> */}
                    </div>
                </nav>
                {children}
            </body>
        </html>
    );
}
