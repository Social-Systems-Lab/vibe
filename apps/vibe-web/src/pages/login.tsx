"use client";

import { useFormStatus } from "react-dom";
import { login } from "../actions";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "../components/ui/card";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { useActionState, useEffect } from "react";
import { useRouter } from "waku/router/client";
import { useSetAtom } from "jotai";
import { userAtom } from "../store/auth";

function SubmitButton() {
    const { pending } = useFormStatus();
    return (
        <Button type="submit" className="w-full" disabled={pending}>
            {pending ? "Logging in..." : "Login"}
        </Button>
    );
}

export default function LoginPage() {
    const [state, formAction] = useActionState(login, null);
    const router = useRouter();
    const setUser = useSetAtom(userAtom);

    useEffect(() => {
        if (state?.token && "email" in state) {
            setUser({ email: state.email, token: state.token });
            router.push("/");
        }
    }, [state, router, setUser]);

    return (
        <div className="flex justify-center items-center h-screen">
            <Card className="w-[350px]">
                <CardHeader>
                    <CardTitle>Login</CardTitle>
                    <CardDescription>Enter your credentials to login.</CardDescription>
                </CardHeader>
                <form action={formAction}>
                    <CardContent>
                        <div className="grid w-full items-center gap-4">
                            <div className="flex flex-col space-y-1.5">
                                <Label htmlFor="email">Email</Label>
                                <Input id="email" name="email" placeholder="Enter your email" />
                            </div>
                            <div className="flex flex-col space-y-1.5">
                                <Label htmlFor="password">Password</Label>
                                <Input id="password" name="password" type="password" placeholder="Enter your password" />
                            </div>
                            {state?.error && <p className="text-red-500 text-sm">{state.error}</p>}
                        </div>
                    </CardContent>
                    <CardFooter className="pt-4">
                        <SubmitButton />
                    </CardFooter>
                </form>
            </Card>
        </div>
    );
}
