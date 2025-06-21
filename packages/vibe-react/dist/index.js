// src/index.tsx
import { createContext, useContext, useState as useState2 } from "react";

// src/components/AuthWidget.tsx
import { useState, useEffect } from "react";

// ../vibe-sdk/src/index.ts
var accessToken = null;
var authorizedFetch = async (url, options = {}) => {
  const headers = new Headers(options.headers);
  if (accessToken && !headers.has("Authorization")) {
    headers.set("Authorization", `Bearer ${accessToken}`);
  }
  const fetchOptions = {
    ...options,
    headers
  };
  try {
    const response = await fetch(url, fetchOptions);
    if (response.status === 401) {
      try {
        const refreshResponse = await fetch(`/auth/refresh`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${accessToken}`
          },
          body: JSON.stringify({}),
          credentials: "include"
        });
        if (!refreshResponse.ok) {
          accessToken = null;
          localStorage.removeItem("accessToken");
          localStorage.removeItem("user");
          window.location.href = "/login";
          throw new Error("Failed to refresh token");
        }
        const refreshData = await refreshResponse.json();
        const newToken = refreshData.token;
        if (typeof newToken === "string") {
          accessToken = newToken;
          localStorage.setItem("accessToken", accessToken);
        }
        const newHeaders = new Headers(fetchOptions.headers);
        newHeaders.set("Authorization", `Bearer ${accessToken}`);
        fetchOptions.headers = newHeaders;
        return await fetch(url, fetchOptions);
      } catch (error) {
        console.error("Error refreshing token:", error);
        throw error;
      }
    }
    return response;
  } catch (error) {
    console.error("Error during fetch:", error);
    throw error;
  }
};
var createSdk = (apiUrl) => {
  return {
    setAccessToken: (token) => {
      accessToken = token;
      if (token) {
        localStorage.setItem("accessToken", token);
      } else {
        localStorage.removeItem("accessToken");
      }
    },
    healthCheck: async () => {
      try {
        const response = await authorizedFetch(`${apiUrl}/health`);
        const data = await response.json();
        return data;
      } catch (error) {
        console.error("Error during health check:", error);
        throw error;
      }
    },
    auth: {
      signup: async (body) => {
        try {
          const response = await authorizedFetch(`${apiUrl}/auth/signup`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json"
            },
            body: JSON.stringify(body)
          });
          const data = await response.json();
          const newToken = data.token;
          if (typeof newToken === "string") {
            accessToken = newToken;
            localStorage.setItem("accessToken", accessToken);
          }
          return data;
        } catch (error) {
          console.error("Error during signup:", error);
          throw error;
        }
      },
      login: async (body) => {
        try {
          const response = await authorizedFetch(`${apiUrl}/auth/login`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json"
            },
            body: JSON.stringify(body)
          });
          const data = await response.json();
          const newToken = data.token;
          if (typeof newToken === "string") {
            accessToken = newToken;
            localStorage.setItem("accessToken", accessToken);
          }
          return data;
        } catch (error) {
          console.error("Error during login:", error);
          throw error;
        }
      }
    },
    isAuthenticated: () => {
      return localStorage.getItem("accessToken") !== null;
    },
    getUser: () => {
      const user = localStorage.getItem("user");
      return user ? JSON.parse(user) : null;
    }
  };
};

// src/components/AuthWidget.tsx
import { jsxDEV } from "react/jsx-dev-runtime";
"use client";
var AuthWidget = () => {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [user, setUser] = useState(null);
  const apiUrl = "http://localhost:5000";
  const sdk = createSdk(apiUrl);
  useEffect(() => {
    const checkAuth = async () => {
      const authenticated = sdk.isAuthenticated();
      setIsLoggedIn(authenticated);
      if (authenticated) {
        const userData = sdk.getUser();
        setUser(userData);
      }
    };
    checkAuth();
  }, []);
  const handleLogout = () => {
    localStorage.removeItem("accessToken");
    localStorage.removeItem("user");
    setIsLoggedIn(false);
    setUser(null);
  };
  if (isLoggedIn) {
    return /* @__PURE__ */ jsxDEV("div", {
      children: [
        /* @__PURE__ */ jsxDEV("span", {
          children: [
            "Welcome, ",
            user ? user.email : "User",
            "!"
          ]
        }, undefined, true, undefined, this),
        /* @__PURE__ */ jsxDEV("button", {
          onClick: handleLogout,
          children: "Logout"
        }, undefined, false, undefined, this)
      ]
    }, undefined, true, undefined, this);
  }
  return /* @__PURE__ */ jsxDEV("div", {
    children: [
      /* @__PURE__ */ jsxDEV("button", {
        onClick: () => {
          window.location.href = "/login";
        },
        children: "Login"
      }, undefined, false, undefined, this),
      /* @__PURE__ */ jsxDEV("button", {
        onClick: () => {
          window.location.href = "/signup";
        },
        children: "Sign Up"
      }, undefined, false, undefined, this)
    ]
  }, undefined, true, undefined, this);
};

// src/index.tsx
import { jsxDEV as jsxDEV2 } from "react/jsx-dev-runtime";
"use client";
var VibeContext = createContext(null);
var VibeProvider = ({ children }) => {
  const [user, setUser] = useState2(null);
  return /* @__PURE__ */ jsxDEV2(VibeContext.Provider, {
    value: { user, setUser },
    children
  }, undefined, false, undefined, this);
};
var useVibe = () => {
  const context = useContext(VibeContext);
  if (!context) {
    throw new Error("useVibe must be used within a VibeProvider");
  }
  return context;
};
export {
  useVibe,
  VibeProvider,
  AuthWidget
};
