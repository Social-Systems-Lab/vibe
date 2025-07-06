"use client";

import { useEffect, useState, Suspense } from "react";
import { LoginForm } from "../../components/LoginForm";
import { SignupForm } from "../../components/SignupForm";
import { type AuthState } from "../auth/auth-actions";

// A simple loading spinner component
function Spinner() {
    return (
        <div className="flex justify-center items-center h-screen">
            <div className="animate-spin rounded-full h-32 w-32 border-t-2 border-b-2 border-gray-900"></div>
        </div>
    );
}

function InteractionContent({ uid }: { uid: string | null }) {
    const [details, setDetails] = useState<any>(null);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (uid) {
            fetch(`http://localhost:5000/api/interaction/${uid}`, { credentials: "include" })
                .then((res) => {
                    if (!res.ok) {
                        throw new Error("Failed to fetch interaction details");
                    }
                    return res.json();
                })
                .then(setDetails)
                .catch((err) => {
                    console.error(err);
                    setError(err.message);
                });
        } else {
            setError("No interaction UID found in URL.");
        }
    }, [uid]);

    const handleSuccess = (result: AuthState) => {
        if (!uid || !result.did) {
            setError("Login successful, but missing UID or DID to complete the flow.");
            return;
        }

        const form = document.createElement("form");
        form.method = "POST";
        form.action = `http://localhost:5001/interaction/${uid}`;

        const loginInput = document.createElement("input");
        loginInput.type = "hidden";
        loginInput.name = "login";
        loginInput.value = JSON.stringify({ accountId: result.did });
        form.appendChild(loginInput);

        // The OIDC provider also needs the result of the interaction to be sent
        const resultInput = document.createElement("input");
        resultInput.type = "hidden";
        resultInput.name = "result";
        resultInput.value = JSON.stringify({ login: { accountId: result.did } });
        form.appendChild(resultInput);

        document.body.appendChild(form);
        form.submit();
    };

    if (error) {
        return <div className="text-red-500 text-center p-4">{error}</div>;
    }

    if (!details) {
        return <Spinner />;
    }

    const promptName = details.prompt?.name;

    if (promptName === "login") {
        return <LoginForm onLoginSuccess={handleSuccess} />;
    }

    if (promptName === "create") {
        return <SignupForm onSignupSuccess={handleSuccess} />;
    }

    // TODO: Implement consent form
    if (promptName === "consent") {
        return <div>Consent Screen (Not Implemented)</div>;
    }

    return <div>Unknown prompt: {promptName}</div>;
}

export default function InteractionPage({ query }: { query: string }) {
    const searchParams = new URLSearchParams(query);
    const uid = searchParams.get("uid");

    return (
        <Suspense fallback={<Spinner />}>
            <InteractionContent uid={uid} />
        </Suspense>
    );
}
