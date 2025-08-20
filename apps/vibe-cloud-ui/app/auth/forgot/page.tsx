"use client";

import { useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";

function ForgotPassword() {
    const searchParams = useSearchParams();
    const [isLoading, setIsLoading] = useState(false);
    const [message, setMessage] = useState("");

    const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        setIsLoading(true);
        const formData = new FormData(e.currentTarget);
        const email = formData.get("email") as string;

        const response = await fetch(`/auth/password/forgot`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({ email }),
        });

        if (response.ok) {
            setMessage("If an account with that email exists, a password reset link has been sent.");
        } else {
            setMessage("An error occurred. Please try again.");
        }
        setIsLoading(false);
    };

    return (
        <div className="flex h-screen bg-white relative">
            <div className="w-full lg:w-1/2 flex flex-col justify-center items-center p-8 overflow-y-auto bg-[#f5f5f5]">
                <div className="w-full max-w-md z-30">
                    <div className="text-center">
                        <h1 className="text-3xl font-bold font-heading">Forgot Password</h1>
                        <p className="mt-2 text-gray-600">Enter your email to receive a password reset link.</p>
                    </div>
                    {message && <p className="text-green-500 text-center">{message}</p>}
                    <form className="space-y-6" onSubmit={handleSubmit}>
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
                        <button type="submit" className="w-full px-4 py-2 text-white bg-blue-600 rounded-lg hover:bg-blue-700" disabled={isLoading}>
                            {isLoading ? "Sending..." : "Send Reset Link"}
                        </button>
                    </form>
                </div>
            </div>
        </div>
    );
}

export default function ForgotPasswordPage() {
    return (
        <Suspense fallback={<div className="flex h-screen items-center justify-center"></div>}>
            <ForgotPassword />
        </Suspense>
    );
}
