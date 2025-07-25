"use client";

import { useSearchParams } from "next/navigation";

export default function ConsentPage() {
    const searchParams = useSearchParams();
    const query = new URLSearchParams(searchParams.toString());
    const appImageUrl = query.get("app_image_url");

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
                <h1>Authorize Application</h1>
                {appImageUrl && (
                    <img src={appImageUrl} alt="App Image" style={{ maxWidth: "100px", maxHeight: "100px", marginBottom: "1rem", borderRadius: "8px" }} />
                )}
                <p>
                    The application <strong>{query.get("client_id")}</strong> wants to access your data.
                </p>
                <p>Scopes: {query.get("scope")}</p>
                <form method="POST" action={`/api/auth/authorize/decision?${query.toString()}`}>
                    <button
                        type="submit"
                        name="decision"
                        value="allow"
                        style={{
                            padding: "0.75rem",
                            border: "none",
                            borderRadius: "4px",
                            backgroundColor: "#1a73e8",
                            color: "white",
                            fontSize: "1rem",
                            cursor: "pointer",
                            width: "100%",
                            marginBottom: "1rem",
                        }}
                    >
                        Allow
                    </button>
                    <button
                        type="submit"
                        name="decision"
                        value="deny"
                        style={{
                            padding: "0.75rem",
                            border: "none",
                            borderRadius: "4px",
                            backgroundColor: "#ccc",
                            color: "white",
                            fontSize: "1rem",
                            cursor: "pointer",
                            width: "100%",
                        }}
                    >
                        Deny
                    </button>
                </form>
            </div>
        </div>
    );
}
