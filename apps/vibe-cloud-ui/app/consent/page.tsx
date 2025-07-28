"use client";
import { useSearchParams } from "next/navigation";
import { FormEvent, Suspense } from "react";

function ConsentForm() {
    const searchParams = useSearchParams();
    const queryString = searchParams.toString();
    const clientId = searchParams.get("client_id");
    const scope = searchParams.get("scope");
    const appImageUrl = searchParams.get("app_image_url");

    const params = new URLSearchParams(queryString);
    params.delete("form_type");
    const actionUrl = `/auth/authorize/decision?${params.toString()}`;

    return (
        <div className="grid md:grid-cols-2 h-screen">
            <div className="hidden md:flex flex-col items-center justify-center bg-gray-100 p-12 text-center">
                {appImageUrl ? (
                    <img src={appImageUrl} alt="App Logo" className="w-24 h-24 rounded-lg mb-6" />
                ) : (
                    <div className="w-24 h-24 rounded-lg mb-6 bg-gray-300 flex items-center justify-center">
                        <svg xmlns="http://www.w3.org/2000/svg" className="w-12 h-12 text-gray-500" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm-1-13h2v6h-2zm0 8h2v2h-2z" />
                        </svg>
                    </div>
                )}
                <h2 className="text-2xl font-bold text-gray-800">{clientId || "An application"}</h2>
                <p className="mt-2 text-gray-600">wants to access your Vibe account.</p>
            </div>
            <div className="flex flex-col items-center justify-center bg-white p-8">
                <div className="w-full max-w-md space-y-8">
                    <div className="text-center">
                        <h1 className="text-3xl font-bold">Authorize Access</h1>
                        <p className="mt-2 text-gray-600">Review the requested permissions below.</p>
                    </div>
                    <div className="bg-gray-50 p-6 rounded-lg">
                        <h3 className="font-semibold text-lg mb-4">This app will be able to:</h3>
                        <ul className="space-y-2 text-gray-700">
                            {(scope?.split(" ") || []).map((s) => (
                                <li key={s} className="flex items-center">
                                    <svg
                                        className="w-5 h-5 text-green-500 mr-2"
                                        fill="none"
                                        stroke="currentColor"
                                        viewBox="0 0 24 24"
                                        xmlns="http://www.w3.org/2000/svg"
                                    >
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"></path>
                                    </svg>
                                    <span>
                                        {s === "openid" && "Verify your identity"}
                                        {s === "profile" && "Access your basic profile information"}
                                        {s === "email" && "Access your email address"}
                                    </span>
                                </li>
                            ))}
                        </ul>
                    </div>
                    <form method="POST" action={actionUrl} className="space-y-4">
                        <button
                            type="submit"
                            name="decision"
                            value="allow"
                            className="w-full px-4 py-3 text-white bg-blue-600 rounded-lg font-semibold hover:bg-blue-700"
                        >
                            Allow
                        </button>
                        <button
                            type="submit"
                            name="decision"
                            value="deny"
                            className="w-full px-4 py-3 text-gray-700 bg-gray-200 rounded-lg font-semibold hover:bg-gray-300"
                        >
                            Deny
                        </button>
                    </form>
                </div>
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
