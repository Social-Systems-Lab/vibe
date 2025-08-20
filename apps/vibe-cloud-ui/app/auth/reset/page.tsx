"use client";

import { useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";

function ResetPassword() {
    const searchParams = useSearchParams();
    const [isLoading, setIsLoading] = useState(false);
    const [message, setMessage] = useState("");
    const [error, setError] = useState("");
    const token = searchParams.get("token");

    const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        setIsLoading(true);
        setError("");
        setMessage("");

        const formData = new FormData(e.currentTarget);
        const password = formData.get("password") as string;
        const confirmPassword = formData.get("confirmPassword") as string;

        if (password !== confirmPassword) {
            setError("Passwords do not match");
            setIsLoading(false);
            return;
        }

        const response = await fetch(`/auth/password/reset`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({ token, password }),
        });

        if (response.ok) {
            setMessage("Password has been reset successfully. You can now log in.");
        } else {
            setError("Invalid or expired token.");
        }
        setIsLoading(false);
    };

    return (
        <div className="flex h-screen bg-white relative">
            <div className="w-full lg:w-1/2 flex flex-col justify-center items-center p-8 overflow-y-auto bg-[#f5f5f5]">
                <div className="w-full max-w-md z-30">
                    <div className="text-center">
                        <h1 className="text-3xl font-bold font-heading">Reset Password</h1>
                        <p className="mt-2 text-gray-600">Enter your new password.</p>
                    </div>
                    {message && <p className="text-green-500 text-center">{message}</p>}
                    {error && <p className="text-red-500 text-center">{error}</p>}
                    <form className="space-y-6" onSubmit={handleSubmit}>
                        <div>
                            <input
                                type="password"
                                name="password"
                                placeholder="New Password"
                                required
                                className="w-full px-4 py-2 border rounded-lg bg-white mt-1"
                            />
                        </div>
                        <div>
                            <input
                                type="password"
                                name="confirmPassword"
                                placeholder="Confirm New Password"
                                required
                                className="w-full px-4 py-2 border rounded-lg bg-white"
                            />
                        </div>
                        <button type="submit" className="w-full px-4 py-2 text-white bg-blue-600 rounded-lg hover:bg-blue-700" disabled={isLoading}>
                            {isLoading ? "Resetting..." : "Reset Password"}
                        </button>
                    </form>
                </div>
            </div>
        </div>
    );
}

export default function ResetPasswordPage() {
    return (
        <Suspense fallback={<div className="flex h-screen items-center justify-center"></div>}>
            <ResetPassword />
        </Suspense>
    );
}
