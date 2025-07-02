// src/index.tsx
import { createContext, useContext, useState, useCallback } from "react";

// ../vibe-sdk/dist/index.js
var VIBE_WEB_URL = "http://localhost:3000";
function openCenteredPopup(url, width, height) {
  const left = (screen.width - width) / 2;
  const top = (screen.height - height) / 2;
  const features = `width=${width},height=${height},left=${left},top=${top},resizable=yes,scrollbars=yes`;
  return window.open(url, "vibeLogin", features);
}

class StandaloneStrategy {
  token = null;
  async login() {
    const loginUrl = `${VIBE_WEB_URL}/login`;
    const popup = openCenteredPopup(loginUrl, 500, 600);
    return new Promise((resolve, reject) => {
      if (!popup) {
        return reject(new Error("Popup failed to open."));
      }
      const messageListener = (event) => {
        if (event.origin !== VIBE_WEB_URL) {
          return;
        }
        if (event.data && event.data.type === "VIBE_AUTH_SUCCESS") {
          this.token = event.data.token;
          console.log("Received and stored auth token:", this.token);
          window.removeEventListener("message", messageListener);
          popup.close();
          resolve();
        }
        if (event.data && event.data.type === "VIBE_AUTH_FAIL") {
          window.removeEventListener("message", messageListener);
          popup.close();
          reject(new Error("Authentication failed."));
        }
      };
      window.addEventListener("message", messageListener);
      const timer = setInterval(() => {
        if (popup.closed) {
          clearInterval(timer);
          window.removeEventListener("message", messageListener);
          reject(new Error("Login window was closed by the user."));
        }
      }, 500);
    });
  }
  async logout() {
    this.token = null;
    console.log("Standalone logout called, token cleared");
  }
  async signup() {
    console.log("Standalone signup called");
    return this.login();
  }
  async getUser() {
    if (!this.token) {
      return null;
    }
    console.log("Standalone getUser called, returning dummy user");
    return { name: "Authenticated User" };
  }
  async read(collection, filter) {
    console.log("Standalone read called", collection, filter);
    return [];
  }
  async write(collection, data) {
    console.log("Standalone write called", collection, data);
    return { ok: true };
  }
}

class VibeSDK {
  strategy;
  isAuthenticated = false;
  user = null;
  constructor(config) {
    this.strategy = new StandaloneStrategy;
    console.log("Vibe SDK Initialized with Standalone Strategy");
  }
  async login() {
    await this.strategy.login();
    this.user = await this.strategy.getUser();
    this.isAuthenticated = !!this.user;
  }
  async logout() {
    await this.strategy.logout();
    this.isAuthenticated = false;
    this.user = null;
  }
  async signup() {
    await this.strategy.signup();
    this.user = await this.strategy.getUser();
    this.isAuthenticated = !!this.user;
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
