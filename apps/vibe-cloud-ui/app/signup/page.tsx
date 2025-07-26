"use client";
import { useSearchParams } from "next/navigation";
import { FormEvent } from "react";

export default function SignupPage() {
    const searchParams = useSearchParams();
    const queryString = searchParams.toString();
    const clientId = searchParams.get("client_id");

    const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        const formData = new FormData(event.currentTarget);
        const email = formData.get("email");
        const password = formData.get("password");

        console.log("Submitting form to /auth/signup");
        const response = await fetch(`/auth/signup?${queryString}`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({ email, password }),
        });

        console.log("Received response:", response);
        if (response.redirected) {
            console.log("Redirecting to:", response.url);
            window.location.href = response.url;
        } else {
            console.log("No redirect detected.");
        }
    };

    return (
        <div className="flex items-center justify-center h-screen bg-gray-100">
            <div className="w-full max-w-md p-8 space-y-6 bg-white rounded-lg shadow-md">
                <h1 className="text-2xl font-bold text-center">Sign Up</h1>
                <p className="text-center text-gray-600">
                    To authorize <strong>{clientId}</strong>
                </p>
                <form onSubmit={handleSubmit} className="space-y-6">
                    <input type="email" name="email" placeholder="Email" required className="w-full px-4 py-2 border rounded-lg" />
                    <input type="password" name="password" placeholder="Password" required className="w-full px-4 py-2 border rounded-lg" />
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
                    <a href={`/auth/login?${queryString}`} className="text-blue-600 hover:underline">
                        Log in
                    </a>
                </p>
            </div>
        </div>
    );
}
