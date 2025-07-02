"use client";

import { useState } from "react";
import { checkApiHealth } from "../pages/auth/auth-actions";
import { Button } from "./ui/button";

export const HealthChecker = () => {
    const [result, setResult] = useState<string | null>(null);

    const handleCheck = async () => {
        console.log("Checking API health...");
        const res = await checkApiHealth();
        setResult(res);
    };

    return (
        <div className="mt-8">
            <Button onClick={handleCheck}>Check API Status</Button>
            {result && (
                <pre className="mt-4 rounded bg-gray-100 p-4">
                    <code>{result}</code>
                </pre>
            )}
        </div>
    );
};
