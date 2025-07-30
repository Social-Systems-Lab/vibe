"use client";

import Image from "next/image";
import { useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";

function Wizard() {
    const searchParams = useSearchParams();
    const [step, setStep] = useState(searchParams.get("step") || "signup");

    // Extract branding and app info from URL
    const appName = searchParams.get("appName") || "your application";
    const backgroundImageUrl = searchParams.get("backgroundImageUrl");
    const appTagline = searchParams.get("appTagline");
    const appDescription = searchParams.get("appDescription");
    const themeColor = searchParams.get("theme_color") || "#000000";
    const customLandingPage = searchParams.get("custom_landing_page");
    const appLogoUrl = searchParams.get("appLogoUrl");
    const appLogotypeUrl = searchParams.get("appLogotypeUrl");
    const appShowcaseUrl = searchParams.get("appShowcaseUrl");
    const backgroundColor = searchParams.get("backgroundColor") || "#FFFFFF";
    const fontColor = searchParams.get("fontColor") || "#000000";

    // Extract OAuth params to forward them
    const queryString = searchParams.toString();

    const renderStep = () => {
        switch (step) {
            case "login":
                return <LoginForm setStep={setStep} />;
            case "profile":
                return <ProfileForm setStep={setStep} />;
            case "consent":
                return <ConsentForm setStep={setStep} />;
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
            <div
                className="flex flex-col justify-center items-center p-12 h-full"
                style={{
                    backgroundColor: "white", //backgroundColor,
                    color: fontColor,
                }}
            >
                <div className="max-w-md z-30">
                    <div className="flex flex-row items-center mb-4">
                        {appLogotypeUrl ? (
                            <img src={appLogotypeUrl} alt={`${appName} logotype`} className="h-12" />
                        ) : (
                            <div className="flex items-center">
                                {appLogoUrl && <img src={appLogoUrl} alt={`${appName} logo`} className="w-12 h-12 mr-4" />}

                                <h1 className="text-3xl font-bold font-heading">{appName}</h1>
                            </div>
                        )}
                    </div>
                    {appTagline && <p className="text-5xl font-bold mb-6">{appTagline}</p>}
                    {appDescription && <p className="text-lg opacity-80 mb-8">{appDescription}</p>}
                    {appShowcaseUrl && <img src={appShowcaseUrl} alt={`${appName} showcase`} className="w-full " />}
                </div>
                <div className="text-center absolute bottom-4">
                    <p className="text-sm opacity-70">Powered by Vibe. Your everything.</p>
                </div>
            </div>
        );
    };

    return (
        <div className="flex h-screen bg-white relative">
            {/* <div className="absolute inset-0 z-20 flex items-center justify-center">
                <Image src="/images/vibe.png" alt="Vibe Logo" width="800" height="800" className="opacity-5" />
            </div> */}
            {/* Left Column (Branding) */}
            <div className="hidden lg:block lg:w-1/2 z-10">{renderBranding()}</div>

            {/* Right Column (Form) */}
            <div className="w-full lg:w-1/2 flex flex-col justify-center items-center p-8 overflow-y-auto bg-[#f5f5f5]">
                <div className="w-full max-w-md z-30">{renderStep()}</div>
            </div>
        </div>
    );
}

const SignupForm = ({ setStep }: { setStep: (step: string) => void }) => {
    const searchParams = useSearchParams();
    const queryString = searchParams.toString();
    const clientId = searchParams.get("client_id");
    const appName = searchParams.get("appName");
    const buttonColor = searchParams.get("buttonColor") || "#2563EB";
    const [isLoading, setIsLoading] = useState(false);

    const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
        setIsLoading(true);
    };

    return (
        <div className="w-full max-w-md space-y-6 z-30">
            {/* bg-white rounded-lg p-8 shadow-lg */}
            <div className="text-center">
                <h1 className="text-3xl font-bold font-heading">Create your account</h1>
                <p className="mt-2 text-gray-600">
                    to get started with <strong>{appName || clientId || "your app"}</strong>
                </p>
            </div>
            <form method="POST" action={`/auth/signup?${queryString}`} className="space-y-6" onSubmit={handleSubmit}>
                <div>
                    <input type="email" name="email" placeholder="Email" required className="w-full px-4 py-2 border rounded-lg bg-white mt-1" />
                </div>
                <div>
                    <input
                        type="password"
                        name="password"
                        placeholder="Password"
                        required
                        className="w-full px-4 py-2 border rounded-lg bg-white"
                        autoComplete="new-password"
                    />
                </div>
                <button type="submit" className="w-full px-4 py-2 text-white rounded-lg" style={{ backgroundColor: buttonColor }} disabled={isLoading}>
                    {isLoading ? "Signing up..." : "Sign Up"}
                </button>
            </form>
            <div className="relative">
                <div className="absolute inset-0 flex items-center">
                    <div className="w-full border-t border-gray-300"></div>
                </div>
                <div className="relative flex justify-center text-sm">
                    <span className="px-2 bg-[#f5f5f5] text-gray-500">Or</span>
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
    const [isLoading, setIsLoading] = useState(false);

    const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
        setIsLoading(true);
    };

    return (
        <div className="w-full max-w-md space-y-6 z-30">
            <div className="text-center">
                <h1 className="text-3xl font-bold font-heading">Welcome Back!</h1>
                <p className="mt-2 text-gray-600">
                    Log in to access <strong>{clientId || "your app"}</strong>
                </p>
            </div>
            <form method="POST" action={`/auth/login?${queryString}`} className="space-y-6" onSubmit={handleSubmit}>
                <div>
                    <input type="email" name="email" placeholder="Email" required className="w-full px-4 py-2 mt-1 border rounded-lg" />
                </div>
                <div>
                    <input
                        type="password"
                        name="password"
                        placeholder="Password"
                        required
                        className="w-full px-4 py-2 border rounded-lg"
                        autoComplete="current-password"
                    />
                </div>
                <button type="submit" className="w-full px-4 py-2 text-white bg-blue-600 rounded-lg hover:bg-blue-700" disabled={isLoading}>
                    {isLoading ? "Logging in..." : "Log In"}
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

const ProfileForm = ({ setStep }: { setStep: (step: string) => void }) => {
    const searchParams = useSearchParams();
    const queryString = searchParams.toString();
    const [isLoading, setIsLoading] = useState(false);

    const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        setIsLoading(true);

        const formData = new FormData(e.currentTarget);
        const response = await fetch(`/auth/profile?${queryString}`, {
            method: "POST",
            body: formData,
        });

        if (response.ok) {
            setStep("consent");
        } else {
            // Handle error
            setIsLoading(false);
        }
    };

    return (
        <div className="w-full max-w-md space-y-6 z-30">
            <div className="text-center">
                <h1 className="text-3xl font-bold font-heading">Complete Your Profile</h1>
                <p className="mt-2 text-gray-600">Just a few more details to get you set up.</p>
            </div>
            <form className="space-y-6" onSubmit={handleSubmit}>
                <div>
                    <label className="block text-sm font-medium text-gray-700">Display Name</label>
                    <input type="text" name="displayName" placeholder="Your Name" required className="w-full px-4 py-2 mt-1 border rounded-lg bg-white" />
                </div>
                <div>
                    <label className="block text-sm font-medium text-gray-700">Bio (Optional)</label>
                    <textarea name="bio" placeholder="Tell us a little about yourself..." className="w-full px-4 py-2 mt-1 border rounded-lg bg-white" />
                </div>
                <button type="submit" className="w-full px-4 py-2 text-white bg-green-500 rounded-lg hover:bg-green-600" disabled={isLoading}>
                    {isLoading ? "Saving..." : "Save and Continue"}
                </button>
            </form>
        </div>
    );
};

const ConsentForm = ({ setStep }: { setStep: (step: string) => void }) => {
    const searchParams = useSearchParams();
    const queryString = searchParams.toString();
    const appName = searchParams.get("appName") || "your application";
    const [isLoading, setIsLoading] = useState(false);

    const handleSubmit = async (action: "approve" | "deny") => {
        setIsLoading(true);

        const response = await fetch(`/auth/consent?${queryString}`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({ action }),
        });

        if (response.ok && response.redirected) {
            window.location.href = response.url;
        } else {
            // Handle error
            setIsLoading(false);
        }
    };

    return (
        <div className="w-full max-w-md space-y-6 z-30">
            <div className="text-center">
                <h1 className="text-3xl font-bold font-heading">Almost there!</h1>
                <p className="mt-2 text-gray-600">{appName} is requesting permission to access your Vibe account.</p>
            </div>
            <form className="space-y-6" onSubmit={(e) => e.preventDefault()}>
                <div className="p-4 bg-gray-100 rounded-lg">
                    <h3 className="font-bold">Permissions requested:</h3>
                    <ul className="list-disc list-inside mt-2 text-gray-700">
                        <li>Read your profile information</li>
                        <li>Read your contacts</li>
                    </ul>
                </div>
                <button
                    onClick={() => handleSubmit("approve")}
                    className="w-full px-4 py-2 text-white bg-blue-600 rounded-lg hover:bg-blue-700"
                    disabled={isLoading}
                >
                    {isLoading ? "Approving..." : "Approve"}
                </button>
                <button
                    onClick={() => handleSubmit("deny")}
                    className="w-full px-4 py-2 text-gray-700 bg-gray-200 rounded-lg hover:bg-gray-300"
                    disabled={isLoading}
                >
                    Deny
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
