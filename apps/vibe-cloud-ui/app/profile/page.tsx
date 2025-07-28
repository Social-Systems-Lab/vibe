"use client";
import { useSearchParams } from "next/navigation";
import { FormEvent, Suspense, useState } from "react";

function ProfileForm() {
    const searchParams = useSearchParams();
    const [displayName, setDisplayName] = useState("");
    const [pictureUrl, setPictureUrl] = useState("https://placehold.co/100x100");

    const getAccessToken = async () => {
        try {
            const response = await fetch("/auth/api-token");
            if (!response.ok) {
                console.error("Failed to get API token");
                return null;
            }
            const data = await response.json();
            return data.token;
        } catch (error) {
            console.error("Error fetching API token:", error);
            return null;
        }
    };

    const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        console.log("Profile form submitted.");
        const token = await getAccessToken();
        if (!token) {
            console.error("Could not obtain access token. Cannot update profile.");
            return;
        }

        console.log("Saving profile with displayName:", displayName);
        const response = await fetch("/users/me", {
            method: "PATCH",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({ displayName, pictureUrl }),
        });

        if (!response.ok) {
            console.error("Failed to save profile. Status:", response.status, "Response:", await response.text());
            return;
        }
        const updatedUser = await response.json();
        console.log("Profile saved successfully. Received updated user:", updatedUser);

        const flow = searchParams.get("flow");
        if (flow === "settings") {
            window.opener.postMessage({ type: "vibe_auth_profile_updated" }, "*");
            window.close();
        } else {
            const params = new URLSearchParams(searchParams.toString());
            const consentUrl = `/auth/consent?${params.toString()}`;
            console.log("Redirecting to consent page:", consentUrl);
            window.location.href = consentUrl;
        }
    };

    const handleSkip = () => {
        const flow = searchParams.get("flow");
        if (flow === "settings") {
            window.close();
        } else {
            const params = new URLSearchParams(searchParams.toString());
            const consentUrl = `/auth/consent?${params.toString()}`;
            window.location.href = consentUrl;
        }
    };

    return (
        <div className="flex items-center justify-center h-screen bg-gray-100">
            <div className="w-full max-w-md p-8 space-y-6 bg-white rounded-lg shadow-md">
                <h1 className="text-2xl font-bold text-center">Complete Your Profile</h1>
                <img id="profile-pic" src={pictureUrl} alt="Profile Picture" className="w-24 h-24 mx-auto rounded-full" />
                <form onSubmit={handleSubmit} className="space-y-6">
                    <input
                        type="text"
                        name="displayName"
                        placeholder="Display Name"
                        required
                        value={displayName}
                        onChange={(e) => setDisplayName(e.target.value)}
                        className="w-full px-4 py-2 border rounded-lg"
                    />
                    <button type="submit" className="w-full px-4 py-2 text-white bg-blue-600 rounded-lg hover:bg-blue-700">
                        Continue
                    </button>
                </form>
                <button onClick={handleSkip} className="w-full px-4 py-2 text-gray-600 bg-gray-200 rounded-lg hover:bg-gray-300">
                    Skip for now
                </button>
            </div>
        </div>
    );
}

export default function ProfilePage() {
    return (
        <Suspense fallback={<div>Loading...</div>}>
            <ProfileForm />
        </Suspense>
    );
}
