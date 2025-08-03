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
    const error = searchParams.get("error");

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
            {error && <p className="text-red-500 text-center">{error}</p>}
            <form method="POST" action={`/auth/signup?${queryString}`} className="space-y-6" onSubmit={handleSubmit}>
                <div>
                    <input
                        type="email"
                        name="email"
                        placeholder="Email"
                        autoComplete="username"
                        required
                        className="w-full px-4 py-2 border rounded-lg bg-white mt-1"
                    />
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
    const appName = searchParams.get("appName");
    const [isLoading, setIsLoading] = useState(false);

    const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
        setIsLoading(true);
    };

    return (
        <div className="w-full max-w-md space-y-6 z-30">
            <div className="text-center">
                <h1 className="text-3xl font-bold font-heading">Welcome Back!</h1>
                <p className="mt-2 text-gray-600">
                    Log in to access <strong>{appName || clientId || "your app"}</strong>
                </p>
            </div>
            <form method="POST" action={`/auth/login?${queryString}`} className="space-y-6" onSubmit={handleSubmit}>
                <div>
                    <input
                        type="email"
                        name="email"
                        placeholder="Email"
                        autoComplete="username"
                        required
                        className="w-full px-4 py-2 mt-1 border rounded-lg bg-white"
                    />
                </div>
                <div>
                    <input
                        type="password"
                        name="password"
                        placeholder="Password"
                        required
                        className="w-full px-4 py-2 border rounded-lg bg-white"
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

import { useEffect } from "react";
const ProfileForm = ({ setStep }: { setStep: (step: string) => void }) => {
    const searchParams = useSearchParams();
    const queryString = searchParams.toString();
    const [isLoading, setIsLoading] = useState(false);
    const isSettingsFlow = searchParams.get("flow") === "settings";
    const [preview, setPreview] = useState<string | null>(null);
    const [displayName, setDisplayName] = useState("");

    useEffect(() => {
        const fetchUserData = async () => {
            const response = await fetch(`/auth/me?${queryString}`);
            if (response.ok) {
                const data = await response.json();
                setDisplayName(data.displayName);
                setPreview(data.pictureUrl);
            }
        };
        fetchUserData();
    }, [queryString]);

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            const reader = new FileReader();
            reader.onloadend = () => {
                setPreview(reader.result as string);
            };
            reader.readAsDataURL(file);
        } else {
            setPreview(null);
        }
    };

    const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        setIsLoading(true);

        const formData = new FormData(e.currentTarget);
        const response = await fetch(`/auth/profile?${queryString}`, {
            method: "POST",
            body: formData,
        });

        if (response.ok) {
            if (response.redirected) {
                window.location.href = response.url;
                return;
            }
            try {
                const result = await response.json();
                if (result.redirectTo) {
                    window.location.href = result.redirectTo;
                } else {
                    setStep("consent");
                }
            } catch (e) {
                // If the response is not JSON, it might be a redirect from the server
                // that the browser didn't follow automatically.
                // In that case, we can assume the next step is consent.
                setStep("consent");
            }
        } else {
            // Handle error
            console.error("Profile update failed");
            setIsLoading(false);
        }
    };

    return (
        <div className="w-full max-w-md space-y-6 z-30">
            <div className="text-center">
                <h1 className="text-3xl font-bold font-heading">{isSettingsFlow ? "Profile Settings" : "Complete Your Profile"}</h1>
                <p className="mt-2 text-gray-600">{isSettingsFlow ? "Update your profile information." : "Just a few more details to get you set up."}</p>
            </div>
            <form className="space-y-6" onSubmit={handleSubmit} encType="multipart/form-data">
                <div className="flex flex-col items-center space-y-4">
                    <label htmlFor="picture" className="cursor-pointer">
                        <div className="w-32 h-32 rounded-full bg-gray-200 flex items-center justify-center overflow-hidden">
                            {preview ? (
                                <img src={preview} alt="Profile preview" className="w-full h-full object-cover" />
                            ) : (
                                <span className="text-gray-500">Upload Photo</span>
                            )}
                        </div>
                    </label>
                    <input id="picture" name="picture" type="file" className="hidden" accept="image/*" onChange={handleFileChange} />
                </div>
                <div>
                    <label className="block text-sm font-medium text-gray-700">Display Name</label>
                    <input
                        type="text"
                        name="displayName"
                        placeholder="Your Name"
                        autoComplete="nickname"
                        required
                        value={displayName}
                        onChange={(e) => setDisplayName(e.target.value)}
                        className="w-full px-4 py-2 mt-1 border rounded-lg bg-white"
                    />
                </div>
                <button type="submit" className="w-full px-4 py-2 text-white bg-green-500 rounded-lg hover:bg-green-600" disabled={isLoading}>
                    {isLoading ? "Saving..." : isSettingsFlow ? "Save Changes" : "Save and Continue"}
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
    const isSettingsFlow = searchParams.get("flow") === "settings";

    // Tri-state consent from URL: true | false | undefined (undecided)
    const urlHasConsented = searchParams.get("hasConsented");
    const initialConsent: boolean | undefined = urlHasConsented === "true" ? true : urlHasConsented === "false" ? false : undefined;

    // Track current consent selection; undefined means undecided -> show both options equally
    const [hasConsented, setHasConsented] = useState<boolean | undefined>(initialConsent);
    const [showDeniedMessage, setShowDeniedMessage] = useState(false);

    // Track which action is currently being submitted to show accurate loading labels
    const [submittingAction, setSubmittingAction] = useState<"approve" | "deny" | null>(null);

    const handleSubmit = async (action: "approve" | "deny") => {
        setSubmittingAction(action);
        setIsLoading(true);

        const response = await fetch(`/auth/consent?${queryString}`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({ action }),
        });

        // If server used HTTP redirect (legacy), follow it
        if (response.redirected) {
            window.location.href = response.url;
            return;
        }

        if (response.ok) {
            // Prefer JSON contract: redirectTo for navigations, ok: true for handled in-place
            // In signup/login flow the API returns { redirectTo: "/auth/authorize?..."}.
            // That authorize should then redirect to the app's redirect_uri with ?code=...
            const data = await response.json();

            // Defensive: strip any accidental hasConsented=undefined in redirectTo
            if (data?.redirectTo && typeof data.redirectTo === "string") {
                try {
                    const url = new URL(data.redirectTo, window.location.origin);
                    if (url.searchParams.get("hasConsented") === "undefined") {
                        url.searchParams.delete("hasConsented");
                    }
                    // Also remove UI-only params that shouldn't leak into OAuth endpoint
                    url.searchParams.delete("appName");
                    url.searchParams.delete("appTagline");
                    url.searchParams.delete("appDescription");
                    url.searchParams.delete("appLogoUrl");
                    url.searchParams.delete("appLogotypeUrl");
                    url.searchParams.delete("appShowcaseUrl");
                    url.searchParams.delete("backgroundImageUrl");
                    url.searchParams.delete("backgroundColor");
                    url.searchParams.delete("fontColor");
                    url.searchParams.delete("buttonColor");
                    // Navigate
                    window.location.href = url.toString();
                    return;
                } catch {
                    // Fallback to raw redirect
                    window.location.href = data.redirectTo;
                    return;
                }
            } else {
                if (isSettingsFlow) {
                    // Update local UI to reflect result in settings flow
                    const approved = action === "approve";
                    setHasConsented(approved);
                    if (!approved) {
                        setShowDeniedMessage(true);
                    }
                }
                setIsLoading(false);
                setSubmittingAction(null);
            }
        } else {
            // Handle error
            setIsLoading(false);
            setSubmittingAction(null);
        }
    };

    // Decide button styles based on tri-state consent
    const allowClass = hasConsented === true ? "bg-blue-600 text-white shadow-md scale-105" : "bg-gray-200 text-gray-800 hover:bg-gray-300";
    const denyClass =
        hasConsented === false && !showDeniedMessage ? "bg-red-500 text-white shadow-md scale-105" : "bg-gray-200 text-gray-800 hover:bg-gray-300";

    return (
        <div className="w-full max-w-md space-y-6 z-30">
            <div className="text-center">
                <div className="inline-flex items-center justify-center mb-2">
                    {/* Keep header clean to avoid repeating app icon */}
                    <h1 className="text-2xl font-extrabold font-heading tracking-tight">{isSettingsFlow ? "App permissions" : "Almost there!"}</h1>
                </div>
                <p className="mt-1 text-gray-600 text-sm">
                    {isSettingsFlow ? `Manage what ${appName} can access.` : `${appName} is requesting permission to access your Vibe account.`}
                </p>
                {!isSettingsFlow && <p className="mt-1 text-gray-500 text-xs">You’re in control. You can change this later in Settings.</p>}
            </div>

            <form className="space-y-5" onSubmit={(e) => e.preventDefault()}>
                {/* App ↔ Vibe identity row (single app icon usage). Right shows user avatar if available, otherwise Vibe icon */}
                <div className="flex items-center justify-between gap-3 p-3 rounded-2xl bg-white border border-gray-200">
                    <div className="flex items-center gap-3">
                        {/* Only show the app icon here to avoid repetition */}
                        {searchParams.get("appLogoUrl") ? (
                            <img src={searchParams.get("appLogoUrl") as string} className="w-8 h-8 rounded" alt={`${appName} logo`} />
                        ) : (
                            <div className="w-8 h-8 rounded bg-gray-200" />
                        )}
                        <div className="text-sm">
                            <div className="font-semibold text-gray-900">{appName}</div>
                            <div className="text-gray-500">wants access to your Vibe</div>
                        </div>
                    </div>
                    {/* Prefer user profile picture (from previous /auth/me usage in session), fallback to Vibe icon */}
                    <Image
                        src={(searchParams.get("userPictureUrl") as string) || "/images/vibe.png"}
                        alt="Vibe user"
                        width={32}
                        height={32}
                        className="w-8 h-8 rounded-full object-cover"
                    />
                </div>

                {/* Permissions list */}
                <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
                    <div className="px-4 py-3 bg-gray-50 border-b border-gray-200">
                        <h3 className="font-semibold text-gray-900 text-sm">Permissions requested</h3>
                    </div>
                    <ul className="p-4 text-gray-700 text-sm space-y-2">
                        <li className="flex items-start gap-2">
                            <span className="mt-1 h-1.5 w-1.5 rounded-full bg-blue-500"></span>
                            Read your profile information
                        </li>
                        <li className="flex items-start gap-2">
                            <span className="mt-1 h-1.5 w-1.5 rounded-full bg-blue-500"></span>
                            Read your contacts
                        </li>
                    </ul>
                    <div className="px-4 pb-3 text-xs text-gray-500">Only with your consent. You can revoke access anytime in Settings.</div>
                </div>

                {/* Denied state */}
                {showDeniedMessage ? (
                    <div className="text-center p-4 bg-yellow-50 border border-yellow-200 rounded-lg text-sm text-yellow-900">
                        <p>Access for {appName} has been denied. You can safely close this page.</p>
                    </div>
                ) : (
                    <>
                        {/* CTA buttons */}
                        <div className="flex gap-3">
                            <button
                                onClick={() => handleSubmit("approve")}
                                className={`flex-1 px-4 py-3 text-center font-semibold rounded-lg transition-all duration-200 border ${
                                    hasConsented === true
                                        ? "bg-blue-600 text-white border-blue-600 shadow-sm"
                                        : "bg-white text-gray-900 border-gray-300 hover:bg-gray-50"
                                }`}
                                disabled={isLoading}
                            >
                                {isLoading && submittingAction === "approve" ? "Allowing..." : "Allow"}
                            </button>
                            <button
                                onClick={() => handleSubmit("deny")}
                                className={`flex-1 px-4 py-3 text-center font-semibold rounded-lg transition-all duration-200 border ${
                                    hasConsented === false
                                        ? "bg-red-600 text-white border-red-600 shadow-sm"
                                        : "bg-white text-gray-900 border-gray-300 hover:bg-gray-50"
                                }`}
                                disabled={isLoading}
                            >
                                {isLoading && submittingAction === "deny" ? "Denying..." : "Deny"}
                            </button>
                        </div>

                        {/* Security + disclaimer */}
                        <div className="text-[11px] leading-5 text-gray-500 text-center">
                            By selecting Allow, you let {appName} use these permissions with your Vibe account. We will never share your credentials with the
                            app.
                        </div>
                    </>
                )}
            </form>
        </div>
    );
};

export default function WizardPage() {
    return (
        <Suspense fallback={<div className="flex h-screen items-center justify-center"></div>}>
            <Wizard />
        </Suspense>
    );
}
