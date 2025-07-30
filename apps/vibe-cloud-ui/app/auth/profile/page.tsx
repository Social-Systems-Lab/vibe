"use client";
import { useSearchParams } from "next/navigation";
import { FormEvent, Suspense, useState } from "react";

function ProfileForm() {
    const searchParams = useSearchParams();
    const queryString = searchParams.toString();
    const [pictureUrl, setPictureUrl] = useState("https://placehold.co/100x100");

    const actionUrl = `/auth/profile?${queryString}`;
    const skipUrl = `/auth/consent?${queryString}`;

    return (
        <div className="grid md:grid-cols-2 h-screen">
            <div className="hidden md:block bg-gray-100 p-12">
                <h2 className="text-3xl font-bold text-gray-800">Vibe</h2>
                <p className="mt-4 text-gray-600">Your digital world, unified.</p>
            </div>
            <div className="flex flex-col items-center justify-center bg-white p-8">
                <div className="w-full max-w-md space-y-6">
                    <div className="text-center">
                        <h1 className="text-3xl font-bold font-heading">Complete Your Profile</h1>
                        <p className="mt-2 text-gray-600">Personalize your Vibe account.</p>
                        <img id="profile-pic" src={pictureUrl} alt="Profile Picture" className="w-24 h-24 mx-auto rounded-full mt-4" />
                    </div>
                    <form method="POST" action={actionUrl} className="space-y-6">
                        <div>
                            <label className="block text-sm font-medium text-gray-700">Display Name</label>
                            <input type="text" name="displayName" placeholder="Your Name" required className="w-full px-4 py-2 mt-1 border rounded-lg" />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700">Profile Picture URL (Optional)</label>
                            <input
                                type="text"
                                name="pictureUrl"
                                placeholder="https://example.com/image.png"
                                value={pictureUrl}
                                onChange={(e) => setPictureUrl(e.target.value)}
                                className="w-full px-4 py-2 mt-1 border rounded-lg"
                            />
                        </div>
                        <button type="submit" className="w-full px-4 py-2 text-white bg-blue-600 rounded-lg hover:bg-blue-700">
                            Save and Continue
                        </button>
                    </form>
                    <a href={skipUrl} className="block w-full text-center px-4 py-2 text-gray-600 bg-gray-200 rounded-lg hover:bg-gray-300">
                        Skip for now
                    </a>
                </div>
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
