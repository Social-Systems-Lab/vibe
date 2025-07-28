"use client";

import { useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";

function Wizard() {
    const searchParams = useSearchParams();
    const [step, setStep] = useState(searchParams.get("step") || "signup");

    // Extract branding and app info from URL
    const appName = searchParams.get("app_name") || "your application";
    const appImageUrl = searchParams.get("app_image_url");
    const appTagline = searchParams.get("app_tagline");
    const appDescription = searchParams.get("app_description");
    const themeColor = searchParams.get("theme_color") || "#000000";
    const customLandingPage = searchParams.get("custom_landing_page");

    // Extract OAuth params to forward them
    const queryString = searchParams.toString();

    const renderStep = () => {
        switch (step) {
            case "login":
                return <LoginForm />;
            case "profile":
                return <ProfileForm />;
            case "signup":
            default:
                return <SignupForm setStep={setStep} />;
        }
    };

    const renderBranding = () => {
        if (customLandingPage) {
            return <iframe src={customLandingPage} className="w-full h-full border-none" />;
        }
        return (
            <div className="flex flex-col justify-between p-12 text-white h-full" style={{ backgroundColor: themeColor }}>
                <div className="text-left">
                    <h2 className="text-2xl font-bold">Vibe</h2>
                </div>
                <div className="text-center">
                    {appImageUrl && <img src={appImageUrl} alt={`${appName} logo`} className="w-24 h-24 mb-8 rounded-lg shadow-xl mx-auto" />}
                    <h1 className="text-4xl font-bold mb-4 text-center">Welcome to {appName}</h1>
                    {appTagline && <p className="text-xl text-center max-w-md mb-4">{appTagline}</p>}
                    {appDescription && <p className="text-md text-center max-w-md opacity-80">{appDescription}</p>}
                </div>
                <div className="text-center">
                    <p className="text-sm opacity-70">Powered by Vibe. One account for a universe of apps.</p>
                </div>
            </div>
        );
    };

    return (
        <div className="flex h-screen bg-white">
            {/* Left Column (Branding) */}
            <div className="hidden lg:block lg:w-1/2">{renderBranding()}</div>

            {/* Right Column (Form) */}
            <div className="w-full lg:w-1/2 flex flex-col justify-center items-center p-8 overflow-y-auto">
                <div className="w-full max-w-md">{renderStep()}</div>
            </div>
        </div>
    );
}

const SignupForm = ({ setStep }: { setStep: (step: string) => void }) => {
    const searchParams = useSearchParams();
    const queryString = searchParams.toString();
    const clientId = searchParams.get("client_id");

    return (
        <div>
            <h2 className="text-3xl font-bold mb-2 text-center">Create your account</h2>
            <p className="text-gray-600 mb-8 text-center">
                to get started with <strong>{clientId || "your app"}</strong>
            </p>
            <form action={`/auth/signup?${queryString}`} method="POST">
                <div className="mb-4">
                    <label className="block text-gray-700 text-sm font-bold mb-2" htmlFor="signup-email">
                        Email
                    </label>
                    <input
                        className="shadow-sm appearance-none border rounded w-full py-3 px-4 text-gray-700 leading-tight focus:outline-none focus:ring-2 focus:ring-blue-500"
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
                        className="shadow-sm appearance-none border rounded w-full py-3 px-4 text-gray-700 mb-3 leading-tight focus:outline-none focus:ring-2 focus:ring-blue-500"
                        id="signup-password"
                        type="password"
                        name="password"
                        required
                    />
                </div>
                <button
                    className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-4 rounded focus:outline-none focus:shadow-outline w-full"
                    type="submit"
                >
                    Sign Up
                </button>
            </form>
            <div className="text-center mt-6">
                <p>
                    Already have an account?{" "}
                    <button onClick={() => setStep("login")} className="font-bold text-blue-600 hover:underline">
                        Log In
                    </button>
                </p>
            </div>
        </div>
    );
};

const LoginForm = () => {
    const searchParams = useSearchParams();
    const queryString = searchParams.toString();
    const clientId = searchParams.get("client_id");

    return (
        <div>
            <h2 className="text-3xl font-bold mb-2 text-center">Welcome Back!</h2>
            <p className="text-gray-600 mb-8 text-center">
                Log in to access <strong>{clientId || "your app"}</strong>
            </p>
            <form action={`/auth/login?${queryString}`} method="POST">
                <div className="mb-4">
                    <label className="block text-gray-700 text-sm font-bold mb-2" htmlFor="login-email">
                        Email
                    </label>
                    <input
                        className="shadow-sm appearance-none border rounded w-full py-3 px-4 text-gray-700 leading-tight focus:outline-none focus:ring-2 focus:ring-blue-500"
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
                        className="shadow-sm appearance-none border rounded w-full py-3 px-4 text-gray-700 mb-3 leading-tight focus:outline-none focus:ring-2 focus:ring-blue-500"
                        id="login-password"
                        type="password"
                        name="password"
                        required
                    />
                </div>
                <button
                    className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-4 rounded focus:outline-none focus:shadow-outline w-full"
                    type="submit"
                >
                    Log In
                </button>
            </form>
        </div>
    );
};

const ProfileForm = () => {
    const searchParams = useSearchParams();
    const queryString = searchParams.toString();

    return (
        <div>
            <h2 className="text-3xl font-bold mb-2 text-center">Complete Your Profile</h2>
            <p className="text-gray-600 mb-8 text-center">Just a few more details to get you set up.</p>
            <form action={`/auth/profile?${queryString}`} method="POST">
                <div className="mb-4">
                    <label className="block text-gray-700 text-sm font-bold mb-2" htmlFor="display-name">
                        Display Name
                    </label>
                    <input
                        className="shadow-sm appearance-none border rounded w-full py-3 px-4 text-gray-700 leading-tight focus:outline-none focus:ring-2 focus:ring-blue-500"
                        id="display-name"
                        type="text"
                        name="displayName"
                        placeholder="Your Name"
                        required
                    />
                </div>
                <div className="mb-6">
                    <label className="block text-gray-700 text-sm font-bold mb-2" htmlFor="bio">
                        Bio (Optional)
                    </label>
                    <textarea
                        className="shadow-sm appearance-none border rounded w-full py-3 px-4 text-gray-700 leading-tight focus:outline-none focus:ring-2 focus:ring-blue-500"
                        id="bio"
                        name="bio"
                        placeholder="Tell us a little about yourself..."
                    />
                </div>
                <button
                    className="bg-green-500 hover:bg-green-600 text-white font-bold py-3 px-4 rounded focus:outline-none focus:shadow-outline w-full"
                    type="submit"
                >
                    Save and Continue
                </button>
            </form>
        </div>
    );
};

export default function WizardPage() {
    return (
        <Suspense fallback={<div className="flex h-screen items-center justify-center">Loading...</div>}>
            <Wizard />
        </Suspense>
    );
}
