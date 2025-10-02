"use client";

import { useEffect, useState } from "react";
import { useVibe } from "vibe-react";
import { ContentService, Manager } from "@/app/lib/content";
import Link from "next/link";

export default function ContentPage() {
    const [managers, setManagers] = useState<Manager[]>([]);
    const [loading, setLoading] = useState(true);
    const { sdk } = useVibe();

    useEffect(() => {
        if (sdk) {
            const contentService = new ContentService(sdk);
            contentService.getManagers().then((items) => {
                setManagers(items);
                setLoading(false);
            });
        }
    }, [sdk]);

    if (loading) {
        return <div>Loading content...</div>;
    }

    return (
        <div>
            <h1 className="text-2xl font-bold mb-4">Content</h1>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {managers.map((manager) => (
                    <div key={manager.managerId} className="border p-4 rounded">
                        <h2 className="text-lg font-semibold">{manager.label}</h2>
                        <Link href={manager.managerPaths.create} className="text-blue-500 hover:underline">
                            Create New
                        </Link>
                    </div>
                ))}
            </div>
        </div>
    );
}
