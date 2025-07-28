"use client";
import { useSearchParams } from "next/navigation";
import { FormEvent, Suspense } from "react";

function ConsentForm() {
    const searchParams = useSearchParams();
    const queryString = searchParams.toString();
    const clientId = searchParams.get("client_id");
    const scope = searchParams.get("scope");

    const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        const decision = (event.nativeEvent as any).submitter.value;

        const params = new URLSearchParams(queryString);
        params.delete("form_type");

        const response = await fetch(`/auth/authorize/decision?${params.toString()}`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({ decision }),
        });

        const data = await response.json();
        if (data.redirect) {
            window.location.href = data.redirect;
        } else {
            // Handle potential errors if the response isn't a redirect
            console.error("Expected a redirect, but did not receive one.");
        }
    };

    return (
        <div className="flex items-center justify-center h-screen bg-gray-100">
            <div className="w-full max-w-md p-8 space-y-6 bg-white rounded-lg shadow-md text-center">
                <h1 className="text-2xl font-bold">Authorize Application</h1>
                <p className="text-gray-600">
                    The application <strong>{clientId}</strong> wants to access your data.
                </p>
                <p className="text-gray-600">
                    Scopes requested: <strong>{scope}</strong>
                </p>
                <form onSubmit={handleSubmit} className="space-y-4">
                    <button type="submit" name="decision" value="allow" className="w-full px-4 py-2 text-white bg-blue-600 rounded-lg hover:bg-blue-700">
                        Allow
                    </button>
                    <button type="submit" name="decision" value="deny" className="w-full px-4 py-2 text-gray-600 bg-gray-200 rounded-lg hover:bg-gray-300">
                        Deny
                    </button>
                </form>
            </div>
        </div>
    );
}

export default function ConsentPage() {
    return (
        <Suspense fallback={<div>Loading...</div>}>
            <ConsentForm />
        </Suspense>
    );
}
