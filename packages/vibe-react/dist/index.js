// src/index.tsx
import { createContext, useContext, useState, useCallback } from "react";

// ../vibe-sdk/dist/index.js
class VibeSDK {
  config;
  isAuthenticated = false;
  user = null;
  constructor(config) {
    this.config = config;
    console.log("Vibe SDK Initialized with API URL:", this.config.apiUrl);
  }
  async init() {
    console.log("Vibe SDK init method called");
  }
  async login() {
    console.log("Login called");
    this.isAuthenticated = true;
    this.user = { name: "Test User" };
  }
  async logout() {
    console.log("Logout called");
    this.isAuthenticated = false;
    this.user = null;
  }
  async signup() {
    console.log("Signup called");
    this.isAuthenticated = true;
    this.user = { name: "New User" };
  }
}
var createSdk = (config) => {
  return new VibeSDK(config);
};

// src/components/LoginButton.tsx
import { jsxDEV } from "react/jsx-dev-runtime";
"use client";
var LoginButton = () => {
  const { login } = useVibe();
  return /* @__PURE__ */ jsxDEV("button", {
    onClick: login,
    children: "Log in with Vibe"
  }, undefined, false, undefined, this);
};
// src/components/SignupButton.tsx
import { jsxDEV as jsxDEV2 } from "react/jsx-dev-runtime";
"use client";
var SignupButton = () => {
  const { signup } = useVibe();
  return /* @__PURE__ */ jsxDEV2("button", {
    onClick: signup,
    children: "Sign up with Vibe"
  }, undefined, false, undefined, this);
};
// src/components/ProfileMenu.tsx
import { jsxDEV as jsxDEV3 } from "react/jsx-dev-runtime";
"use client";
var ProfileMenu = () => {
  const { isAuthenticated, user, logout } = useVibe();
  if (!isAuthenticated) {
    return null;
  }
  return /* @__PURE__ */ jsxDEV3("div", {
    children: [
      /* @__PURE__ */ jsxDEV3("span", {
        children: [
          "Hello, ",
          user?.name
        ]
      }, undefined, true, undefined, this),
      /* @__PURE__ */ jsxDEV3("button", {
        onClick: logout,
        children: "Log out"
      }, undefined, false, undefined, this)
    ]
  }, undefined, true, undefined, this);
};

// src/index.tsx
import { jsxDEV as jsxDEV4 } from "react/jsx-dev-runtime";
"use client";
var VibeContext = createContext(undefined);
function VibeProvider({ children, config }) {
  const [sdk] = useState(() => createSdk(config));
  const [isAuthenticated, setIsAuthenticated] = useState(sdk.isAuthenticated);
  const [user, setUser] = useState(sdk.user);
  const login = useCallback(async () => {
    await sdk.login();
    setIsAuthenticated(sdk.isAuthenticated);
    setUser(sdk.user);
  }, [sdk]);
  const logout = useCallback(async () => {
    await sdk.logout();
    setIsAuthenticated(sdk.isAuthenticated);
    setUser(sdk.user);
  }, [sdk]);
  const signup = useCallback(async () => {
    await sdk.signup();
    setIsAuthenticated(sdk.isAuthenticated);
    setUser(sdk.user);
  }, [sdk]);
  const contextValue = {
    sdk,
    isAuthenticated,
    user,
    login,
    logout,
    signup
  };
  return /* @__PURE__ */ jsxDEV4(VibeContext.Provider, {
    value: contextValue,
    children
  }, undefined, false, undefined, this);
}
function useVibe() {
  const context = useContext(VibeContext);
  if (context === undefined) {
    throw new Error("useVibe must be used within a VibeProvider");
  }
  return context;
}
export {
  useVibe,
  VibeProvider,
  SignupButton,
  ProfileMenu,
  LoginButton
};
