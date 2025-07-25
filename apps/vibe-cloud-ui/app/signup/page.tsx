"use client";

import { useSearchParams } from "next/navigation";

export default function SignupPage() {
    const searchParams = useSearchParams();
    const query = new URLSearchParams(searchParams.toString());

    return (
        <div
            style={{
                fontFamily: "sans-serif",
                display: "flex",
                justifyContent: "center",
                alignItems: "center",
                height: "100vh",
                margin: 0,
                backgroundColor: "#f0f2f5",
            }}
        >
            <div
                style={{
                    backgroundColor: "white",
                    padding: "2rem",
                    borderRadius: "8px",
                    boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
                    textAlign: "center",
                    maxWidth: "400px",
                    width: "100%",
                }}
            >
                <h1>Sign Up</h1>
                <p>
                    To authorize <strong>{query.get("client_id")}</strong>
                </p>
                <form method="POST" action={`/api/auth/signup?${query.toString()}`}>
                    <input
                        type="email"
                        name="email"
                        placeholder="Email"
                        required
                        style={{
                            padding: "0.75rem",
                            border: "1px solid #ccc",
                            borderRadius: "4px",
                            fontSize: "1rem",
                            width: "calc(100% - 1.5rem)",
                            marginBottom: "1rem",
                        }}
                    />
                    <input
                        type="password"
                        name="password"
                        placeholder="Password"
                        required
                        style={{
                            padding: "0.75rem",
                            border: "1px solid #ccc",
                            borderRadius: "4px",
                            fontSize: "1rem",
                            width: "calc(100% - 1.5rem)",
                            marginBottom: "1rem",
                        }}
                    />
                    <button
                        type="submit"
                        style={{
                            padding: "0.75rem",
                            border: "none",
                            borderRadius: "4px",
                            backgroundColor: "#1a73e8",
                            color: "white",
                            fontSize: "1rem",
                            cursor: "pointer",
                            width: "100%",
                        }}
                    >
                        Sign Up
                    </button>
                </form>
                <hr style={{ border: "none", borderTop: "1px solid #eee", margin: "1.5rem 0" }} />
                <p>
                    Already have an account?{" "}
                    <a href={`/auth/login?${query.toString()}`} style={{ color: "#1a73e8", textDecoration: "none" }}>
                        Log in
                    </a>
                </p>
            </div>
        </div>
    );
}
