"use client";

import { useSearchParams } from "next/navigation";
import { Suspense } from "react";

function Wizard() {
    const searchParams = useSearchParams();

    // Extract branding and app info from URL
    const appName = searchParams.get("app_name") || "your application";
    const appImageUrl = searchParams.get("app_image_url");
    const themeColor = searchParams.get("theme_color") || "#000000";

    // Extract OAuth params to forward them to the login/signup forms
    const clientId = searchParams.get("client_id");
    const redirectUri = searchParams.get("redirect_uri");
    const state = searchParams.get("state");
    const codeChallenge = searchParams.get("code_challenge");
    const codeChallengeMethod = searchParams.get("code_challenge_method");
    const scope = searchParams.get("scope");

    const formActionBase = `/auth/onetap`; // All form submissions go to the onetap endpoints for now

    return (
        <div className="flex h-screen">
            {/* Left Column (Branding) */}
            <div className="hidden lg:flex lg:w-1/2 flex-col justify-center items-center p-12 text-white" style={{ backgroundColor: themeColor }}>
                {appImageUrl && <img src={appImageUrl} alt={`${appName} logo`} className="w-24 h-24 mb-8 rounded-full" />}
                <h1 className="text-4xl font-bold mb-4">Welcome to {appName}</h1>
                <p className="text-xl text-center">Sign up or log in to continue your journey, powered by Vibe.</p>
            </div>

            {/* Right Column (Form) */}
            <div className="w-full lg:w-1/2 flex flex-col justify-center items-center p-8">
                <div className="w-full max-w-md">
                    <h2 className="text-3xl font-bold mb-8 text-center">Get Started</h2>

                    {/* Simplified Login/Signup Form */}
                    <form action={`${formActionBase}/login`} method="POST" className="mb-8">
                        <h3 className="text-xl font-semibold mb-4">Log In</h3>
                        <input type="hidden" name="client_id" value={clientId || ""} />
                        <input type="hidden" name="redirect_uri" value={redirectUri || ""} />
                        <input type="hidden" name="state" value={state || ""} />
                        <input type="hidden" name="code_challenge" value={codeChallenge || ""} />
                        <input type="hidden" name="code_challenge_method" value={codeChallengeMethod || ""} />
                        <input type="hidden" name="scope" value={scope || ""} />

                        <div className="mb-4">
                            <label className="block text-gray-700 text-sm font-bold mb-2" htmlFor="login-email">
                                Email
                            </label>
                            <input
                                className="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline"
                                id="login-email"
                                type="email"
                                name="email"
                                placeholder="you@example.com"
                                required
                            />
                        </div>
                        <div className="mb-6">
                            <label className="block text-gray-700 text-sm font-bold mb-2" htmlFor="login-password">
                                Password
                            </label>
                            <input
                                className="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 mb-3 leading-tight focus:outline-none focus:shadow-outline"
                                id="login-password"
                                type="password"
                                name="password"
                                required
                            />
                        </div>
                        <button
                            className="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded focus:outline-none focus:shadow-outline w-full"
                            type="submit"
                        >
                            Log In
                        </button>
                    </form>

                    <div className="text-center my-4">OR</div>

                    <form action={`${formActionBase}/signup`} method="POST">
                        <h3 className="text-xl font-semibold mb-4">Sign Up</h3>
                        <input type="hidden" name="client_id" value={clientId || ""} />
                        <input type="hidden" name="redirect_uri" value={redirectUri || ""} />
                        <input type="hidden" name="state" value={state || ""} />
                        <input type="hidden" name="code_challenge" value={codeChallenge || ""} />
                        <input type="hidden" name="code_challenge_method" value={codeChallengeMethod || ""} />
                        <input type="hidden" name="scope" value={scope || ""} />

                        <div className="mb-4">
                            <label className="block text-gray-700 text-sm font-bold mb-2" htmlFor="signup-email">
                                Email
                            </label>
                            <input
                                className="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline"
                                id="signup-email"
                                type="email"
                                name="email"
                                placeholder="you@example.com"
                                required
                            />
                        </div>
                        <div className="mb-6">
                            <label className="block text-gray-700 text-sm font-bold mb-2" htmlFor="signup-password">
                                Password
                            </label>
                            <input
                                className="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 mb-3 leading-tight focus:outline-none focus:shadow-outline"
                                id="signup-password"
                                type="password"
                                name="password"
                                required
                            />
                        </div>
                        <button
                            className="bg-green-500 hover:bg-green-700 text-white font-bold py-2 px-4 rounded focus:outline-none focus:shadow-outline w-full"
                            type="submit"
                        >
                            Sign Up
                        </button>
                    </form>
                </div>
            </div>
        </div>
    );
}

export default function WizardPage() {
    return (
        <Suspense fallback={<div>Loading...</div>}>
            <Wizard />
        </Suspense>
    );
}
