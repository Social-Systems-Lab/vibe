// layout.tsx - main layout component
import { Metadata } from "next";
import { Libre_Franklin } from "next/font/google";
import Image from "next/image";
import Link from "next/link";
import type React from "react";
import "./globals.css";
import { Info, Mail } from "lucide-react";
import { VibeProvider } from "@/components/vibe-context";
import { AppManifest } from "vibe-sdk";

const libreFranklin = Libre_Franklin({ subsets: ["latin"], weight: ["400", "600", "700"] });

export const metadata: Metadata = {
    title: "Vibe - Your Everything",
    description: "Vibe puts your digital life in your hands—move freely across an open ecosystem of apps and services.",
};

const manifest: AppManifest = {
    id: "dev.vibeapp.vibe-web",
    name: "Vibe Website",
    description: "Official Vibe Website",
    permissions: ["read.contacts"],
    onetapEnabled: false,
    pictureUrl: "https://vibeapp.dev/favicon-96x96.png",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
    return (
        <VibeProvider manifest={manifest} autoInit>
            <html lang="en">
                <body className={`min-h-screen bg-gradient-to-br from-blue-500 to-purple-400 ${libreFranklin.className}`}>
                    <div className="relative min-h-screen">
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
                        {/* <VibeClientComponent /> */}
                        <footer className="absolute bottom-4 right-4">
                            <details className="group inline-block">
                                <summary className="bg-[#616881] text-white rounded-full px-2 py-2 flex items-center space-x-3 shadow-md cursor-pointer list-none">
                                    <Info className="w-5 h-5" />
                                    {/* Only show extra info when details is open */}
                                    <span className="hidden group-open:inline text-sm">{process.env.version || "v1.0.0"}</span>
                                    <span className="hidden group-open:inline text-sm">|</span>
                                    <span className="hidden group-open:inline">
                                        <Link href="mailto:admin@socialsystems.io">
                                            <div className="flex items-center space-x-1 pr-2">
                                                <Mail className="w-5 h-5" />
                                                <span className="text-sm">admin@socialsystems.io</span>
                                            </div>
                                        </Link>
                                    </span>
                                </summary>
                            </details>
                        </footer>
                    </div>
                </body>
            </html>
        </VibeProvider>
    );
}
