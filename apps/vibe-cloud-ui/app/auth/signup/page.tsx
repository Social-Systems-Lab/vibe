"use client";
import { useSearchParams } from "next/navigation";
import { FormEvent, Suspense } from "react";

function SignupForm() {
    const searchParams = useSearchParams();
    const queryString = searchParams.toString();
    const clientId = searchParams.get("client_id");

    return (
        <div className="grid md:grid-cols-2 h-screen">
            <div className="hidden md:block bg-gray-100 p-12">
                <h2 className="text-3xl font-bold text-gray-800">Vibe</h2>
                <p className="mt-4 text-gray-600">Your digital world, unified.</p>
            </div>
            <div className="flex flex-col items-center justify-center bg-white p-8">
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
                        <a href={`/login?${queryString}`} className="text-blue-600 hover:underline">
                            Log in
                        </a>
                    </p>
                </div>
            </div>
        </div>
    );
}

export default function SignupPage() {
    return (
        <Suspense fallback={<div>Loading...</div>}>
            <SignupForm />
        </Suspense>
    );
}
