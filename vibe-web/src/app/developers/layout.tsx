"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ReactNode } from "react";

interface DevelopersLayoutProps {
    children: ReactNode;
}

export default function DevelopersLayout({ children }: DevelopersLayoutProps) {
    const pathname = usePathname();

    // Check if the current path starts with the given path
    const isActivePage = (path: string) => {
        const exactMatch = pathname === path;
        const subpathMatch = !exactMatch && pathname.startsWith(path) && path !== "/developers";
        return exactMatch || subpathMatch;
    };

    // Check which page is active
    const isGettingStartedActive = isActivePage("/developers") && !pathname.includes("/developers/");
    const isReferenceActive = isActivePage("/developers/reference");
    const isContributeActive = isActivePage("/developers/contribute");

    return (
        <div className="min-h-screen bg-white">
            <div className="max-w-7xl mx-auto px-4 py-8">
                <div className="flex flex-col md:flex-row pb-6">
                    {/* Sidebar */}
                    <div className="md:w-64 flex-shrink-0 mb-8 md:mb-0 md:mr-10">
                        <div className="sticky top-8">
                            <nav className="space-y-1">
                                <div className="mb-6">
                                    <div className="space-y-1">
                                        {/* Getting Started with subsections */}
                                        <Link 
                                            href="/developers" 
                                            className={`block px-3 py-2 rounded-md text-base font-medium ${
                                                isGettingStartedActive
                                                ? "bg-purple-50 text-purple-700 border-l-4 border-purple-600" 
                                                : "text-gray-700 hover:bg-gray-50 hover:text-purple-600"
                                            }`}
                                        >
                                            Getting Started
                                        </Link>

                                        {/* Always show Getting Started subsections */}
                                        <div className="pl-6 mt-1 space-y-1">
                                            <a 
                                                href="/developers#installation" 
                                                className="block px-3 py-1.5 text-sm text-gray-600 hover:text-purple-600"
                                            >
                                                Installation
                                            </a>
                                            <a 
                                                href="/developers#initialization" 
                                                className="block px-3 py-1.5 text-sm text-gray-600 hover:text-purple-600"
                                            >
                                                Initializing the SDK
                                            </a>
                                            <a 
                                                href="/developers#reading-data" 
                                                className="block px-3 py-1.5 text-sm text-gray-600 hover:text-purple-600"
                                            >
                                                Reading Data
                                            </a>
                                            <a 
                                                href="/developers#writing-data" 
                                                className="block px-3 py-1.5 text-sm text-gray-600 hover:text-purple-600"
                                            >
                                                Writing Data
                                            </a>
                                            <a 
                                                href="/developers#next-steps" 
                                                className="block px-3 py-1.5 text-sm text-gray-600 hover:text-purple-600"
                                            >
                                                Next Steps
                                            </a>
                                        </div>

                                        {/* API Reference with subsections */}
                                        <Link 
                                            href="/developers/reference" 
                                            className={`block px-3 py-2 rounded-md text-base font-medium ${
                                                isReferenceActive
                                                ? "bg-purple-50 text-purple-700 border-l-4 border-purple-600" 
                                                : "text-gray-700 hover:bg-gray-50 hover:text-purple-600"
                                            }`}
                                        >
                                            API Reference
                                        </Link>

                                        {/* Always show API Reference subsections */}
                                        <div className="pl-6 mt-1 space-y-1">
                                            <a 
                                                href="/developers/reference#app-manifest" 
                                                className="block px-3 py-1.5 text-sm text-gray-600 hover:text-purple-600"
                                            >
                                                App Manifest
                                            </a>
                                            <a 
                                                href="/developers/reference#initialization" 
                                                className="block px-3 py-1.5 text-sm text-gray-600 hover:text-purple-600"
                                            >
                                                Initialization
                                            </a>
                                            <a 
                                                href="/developers/reference#read-operations" 
                                                className="block px-3 py-1.5 text-sm text-gray-600 hover:text-purple-600"
                                            >
                                                Read Operations
                                            </a>
                                            <a 
                                                href="/developers/reference#write-operations" 
                                                className="block px-3 py-1.5 text-sm text-gray-600 hover:text-purple-600"
                                            >
                                                Write Operations
                                            </a>
                                            <a 
                                                href="/developers/reference#delete-operations" 
                                                className="block px-3 py-1.5 text-sm text-gray-600 hover:text-purple-600"
                                            >
                                                Delete Operations
                                            </a>
                                            <a 
                                                href="/developers/reference#filtering" 
                                                className="block px-3 py-1.5 text-sm text-gray-600 hover:text-purple-600"
                                            >
                                                Filtering Data
                                            </a>
                                            <a 
                                                href="/developers/reference#environment" 
                                                className="block px-3 py-1.5 text-sm text-gray-600 hover:text-purple-600"
                                            >
                                                Environment Detection
                                            </a>
                                        </div>

                                        <Link 
                                            href="/developers/contribute" 
                                            className={`block px-3 py-2 rounded-md text-base font-medium ${
                                                isContributeActive
                                                ? "bg-purple-50 text-purple-700 border-l-4 border-purple-600" 
                                                : "text-gray-700 hover:bg-gray-50 hover:text-purple-600"
                                            }`}
                                        >
                                            Get Involved
                                        </Link>
                                    </div>
                                </div>
                            </nav>
                        </div>
                    </div>

                    {/* Main content */}
                    <main className="flex-1 min-w-0">
                        {children}
                    </main>
                </div>
            </div>
        </div>
    );
}