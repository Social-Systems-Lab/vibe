import { edenTreaty } from "@elysiajs/eden";
import type { App } from "vibe-cloud-api/src/index";

let accessToken: string | null = null;

const authorizedFetch = async (url: string, options: RequestInit = {}): Promise<Response> => {
    const headers = new Headers(options.headers);
    if (accessToken && !headers.has("Authorization")) {
        headers.set("Authorization", `Bearer ${accessToken}`);
    }

    const fetchOptions: RequestInit = {
        ...options,
        headers,
    };

    try {
        const response = await fetch(url, fetchOptions);

        if (response.status === 401) {
            // Refresh token
            try {
                const refreshResponse = await fetch(`/auth/refresh`, {
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
                fetchOptions.headers = newHeaders;
                return await fetch(url, fetchOptions);
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
};

export const createSdk = (apiUrl: string) => {
    return {
        setAccessToken: (token: string | null) => {
            accessToken = token;
            if (token) {
                localStorage.setItem("accessToken", token);
            } else {
                localStorage.removeItem("accessToken");
            }
        },
        healthCheck: async () => {
            try {
                const response: any = await authorizedFetch(`${apiUrl}/health`);
                const data = await response.json();
                return data;
            } catch (error: any) {
                console.error("Error during health check:", error);
                throw error;
            }
        },
        auth: {
            signup: async (body: any) => {
                try {
                    const response: any = await authorizedFetch(`${apiUrl}/auth/signup`, {
                        method: "POST",
                        headers: {
                            "Content-Type": "application/json",
                        },
                        body: JSON.stringify(body),
                    });
                    const data = await response.json();
                    const newToken = data.token;
                    if (typeof newToken === "string") {
                        accessToken = newToken;
                        localStorage.setItem("accessToken", accessToken);
                    }
                    return data;
                } catch (error: any) {
                    console.error("Error during signup:", error);
                    throw error;
                }
            },
            login: async (body: any) => {
                try {
                    const response: any = await authorizedFetch(`${apiUrl}/auth/login`, {
                        method: "POST",
                        headers: {
                            "Content-Type": "application/json",
                        },
                        body: JSON.stringify(body),
                    });
                    const data = await response.json();
                    const newToken = data.token;
                    if (typeof newToken === "string") {
                        accessToken = newToken;
                        localStorage.setItem("accessToken", accessToken);
                    }
                    return data;
                } catch (error: any) {
                    console.error("Error during login:", error);
                    throw error;
                }
            },
        },
        isAuthenticated: () => {
            return localStorage.getItem("accessToken") !== null;
        },
        getUser: () => {
            const user = localStorage.getItem("user");
            return user ? JSON.parse(user) : null;
        },
    };
};
