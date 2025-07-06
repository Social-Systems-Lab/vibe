"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { signup, type AuthState } from "../pages/auth/auth-actions";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";

function SubmitButton() {
    const { pending } = useFormStatus();
    return (
        <Button type="submit" className="w-full" disabled={pending}>
            {pending ? "Signing Up..." : "Sign Up"}
        </Button>
    );
}

const initialState: AuthState = {};

export function SignupForm({ onSignupSuccess }: { onSignupSuccess: (data: AuthState) => void }) {
    const [state, formAction] = useActionState(signup, initialState);

    if (state?.success) {
        onSignupSuccess(state);
    }

    return (
        <div className="flex flex-col items-center justify-center min-h-screen bg-white">
            <div className="w-full max-w-xs">
                <div className="mb-8 text-center">
                    <h1 className="text-2xl font-semibold">Create an account</h1>
                    <p className="text-gray-500">to continue to Vibe</p>
                </div>
                <form action={formAction} className="space-y-6">
                    <div className="space-y-2">
                        <Label htmlFor="email">Email</Label>
                        <Input id="email" name="email" type="email" required />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="password">Password</Label>
                        <Input id="password" name="password" type="password" required />
                    </div>
                    {state?.error && <p className="text-red-500 text-sm">{state.error}</p>}
                    <SubmitButton />
                </form>
            </div>
        </div>
    );
}
