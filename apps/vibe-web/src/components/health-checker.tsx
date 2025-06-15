"use client";

import { useState } from "react";
import { checkApiHealth } from "../actions";

export const HealthChecker = () => {
    const [result, setResult] = useState<string | null>(null);

    const handleCheck = async () => {
        const res = await checkApiHealth();
        setResult(res);
    };

    return (
        <div className="mt-8">
            <button onClick={handleCheck} className="rounded bg-blue-500 px-4 py-2 font-bold text-white hover:bg-blue-700">
                Check API Status
            </button>
            {result && (
                <pre className="mt-4 rounded bg-gray-100 p-4">
                    <code>{result}</code>
                </pre>
            )}
        </div>
    );
};
