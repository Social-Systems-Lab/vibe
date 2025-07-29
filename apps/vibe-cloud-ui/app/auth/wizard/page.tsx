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
                return <LoginForm setStep={setStep} />;
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
                    <p className="text-sm opacity-70">Powered by Vibe. Your everything.</p>
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
        <div className="w-full max-w-md space-y-6">
            <div className="text-center">
                <h1 className="text-3xl font-bold">Create your account</h1>
                <p className="mt-2 text-gray-600">
                    to get started with <strong>{clientId || "your app"}</strong>
                </p>
            </div>
            <form method="POST" action={`/auth/signup?${queryString}`} className="space-y-6">
                <div>
                    <label className="block text-sm font-medium text-gray-700">Email</label>
                    <input type="email" name="email" placeholder="you@example.com" required className="w-full px-4 py-2 mt-1 border rounded-lg" />
                </div>
                <div>
                    <label className="block text-sm font-medium text-gray-700">Password</label>
                    <input type="password" name="password" placeholder="••••••••" required className="w-full px-4 py-2 mt-1 border rounded-lg" />
                </div>
                <button type="submit" className="w-full px-4 py-2 text-white bg-blue-600 rounded-lg hover:bg-blue-700">
                    Sign Up
                </button>
            </form>
            <div className="relative">
                <div className="absolute inset-0 flex items-center">
                    <div className="w-full border-t border-gray-300"></div>
                </div>
                <div className="relative flex justify-center text-sm">
                    <span className="px-2 bg-white text-gray-500">Or</span>
                </div>
            </div>
            <p className="text-center">
                Already have an account?{" "}
                <button onClick={() => setStep("login")} className="text-blue-600 hover:underline">
                    Log in
                </button>
            </p>
        </div>
    );
};

const LoginForm = ({ setStep }: { setStep: (step: string) => void }) => {
    const searchParams = useSearchParams();
    const queryString = searchParams.toString();
    const clientId = searchParams.get("client_id");

    return (
        <div className="w-full max-w-md space-y-6">
            <div className="text-center">
                <h1 className="text-3xl font-bold">Welcome Back!</h1>
                <p className="mt-2 text-gray-600">
                    Log in to access <strong>{clientId || "your app"}</strong>
                </p>
            </div>
            <form method="POST" action={`/auth/login?${queryString}`} className="space-y-6">
                <div>
                    <label className="block text-sm font-medium text-gray-700">Email</label>
                    <input type="email" name="email" placeholder="you@example.com" required className="w-full px-4 py-2 mt-1 border rounded-lg" />
                </div>
                <div>
                    <label className="block text-sm font-medium text-gray-700">Password</label>
                    <input type="password" name="password" placeholder="••••••••" required className="w-full px-4 py-2 mt-1 border rounded-lg" />
                </div>
                <button type="submit" className="w-full px-4 py-2 text-white bg-blue-600 rounded-lg hover:bg-blue-700">
                    Log In
                </button>
            </form>
            <p className="text-center">
                Don't have an account?{" "}
                <button onClick={() => setStep("signup")} className="text-blue-600 hover:underline">
                    Sign up
                </button>
            </p>
        </div>
    );
};

const ProfileForm = () => {
    const searchParams = useSearchParams();
    const queryString = searchParams.toString();

    return (
        <div className="w-full max-w-md space-y-6">
            <div className="text-center">
                <h1 className="text-3xl font-bold">Complete Your Profile</h1>
                <p className="mt-2 text-gray-600">Just a few more details to get you set up.</p>
            </div>
            <form method="POST" action={`/auth/profile?${queryString}`} className="space-y-6">
                <div>
                    <label className="block text-sm font-medium text-gray-700">Display Name</label>
                    <input type="text" name="displayName" placeholder="Your Name" required className="w-full px-4 py-2 mt-1 border rounded-lg" />
                </div>
                <div>
                    <label className="block text-sm font-medium text-gray-700">Bio (Optional)</label>
                    <textarea name="bio" placeholder="Tell us a little about yourself..." className="w-full px-4 py-2 mt-1 border rounded-lg" />
                </div>
                <button type="submit" className="w-full px-4 py-2 text-white bg-green-500 rounded-lg hover:bg-green-600">
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
