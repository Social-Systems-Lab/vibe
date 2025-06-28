import { edenTreaty } from "@elysiajs/eden";
import type { App } from "vibe-cloud-api/src/index";

let accessToken: string | null = null;

export const createSdk = (apiUrl: string) => {
    const authorizedFetch: typeof fetch = Object.assign(
        async (input: RequestInfo | URL, init?: RequestInit) => {
            const options = init || {};
            const headers = new Headers(options.headers);
            if (accessToken && !headers.has("Authorization")) {
                headers.set("Authorization", `Bearer ${accessToken}`);
            }

            const fetchOptions: RequestInit = {
                ...options,
                headers,
            };

            try {
                const response = await fetch(input, fetchOptions);

                if (response.status === 401 && typeof window !== "undefined") {
                    // Refresh token logic is client-side only
                    try {
                        const refreshResponse = await fetch(`${apiUrl}/auth/refresh`, {
                            method: "POST",
                            headers: {
                                "Content-Type": "application/json",
                                Authorization: `Bearer ${accessToken}`,
                            },
                            body: JSON.stringify({}),
                            credentials: "include",
                        });

                        if (!refreshResponse.ok) {
                            // Logout user
                            accessToken = null;
                            localStorage.removeItem("accessToken");
                            localStorage.removeItem("user");
                            window.location.href = "/login";
                            throw new Error("Failed to refresh token");
                        }

                        const refreshData: any = await refreshResponse.json();
                        const newToken = refreshData.token;
                        if (typeof newToken === "string") {
                            accessToken = newToken;
                            localStorage.setItem("accessToken", accessToken);
                        }

                        // Retry original request
                        const newHeaders = new Headers(fetchOptions.headers);
                        newHeaders.set("Authorization", `Bearer ${accessToken}`);
                        const retryOptions = { ...fetchOptions, headers: newHeaders };
                        return await fetch(input, retryOptions);
                    } catch (error: any) {
                        console.error("Error refreshing token:", error);
                        throw error;
                    }
                }

                return response;
            } catch (error: any) {
                console.error("Error during fetch:", error);
                throw error;
            }
        },
        {
            preconnect: (
                url: string | URL,
                options?: {
                    dns?: boolean;
                    tcp?: boolean;
                    http?: boolean;
                    https?: boolean;
                }
            ) => {
                // No-op
            },
        }
    );

    const client = edenTreaty<App>(apiUrl, {
        fetcher: authorizedFetch,
    });

    return {
        client,
        setAccessToken: (token: string | null) => {
            accessToken = token;
            if (token && typeof window !== "undefined") {
                localStorage.setItem("accessToken", token);
            } else if (typeof window !== "undefined") {
                localStorage.removeItem("accessToken");
            }
        },
        isAuthenticated: () => {
            if (typeof window !== "undefined") {
                return localStorage.getItem("accessToken") !== null;
            }
            return !!accessToken;
        },
        getUser: () => {
            if (typeof window !== "undefined") {
                const user = localStorage.getItem("user");
                return user ? JSON.parse(user) : null;
            }
            return null; // Can't get user on server this way
        },
    };
};
