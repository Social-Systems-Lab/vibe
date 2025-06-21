// src/index.tsx
import { createContext, useContext, useState as useState2 } from "react";

// src/components/AuthWidget.tsx
import { useState, useEffect } from "react";

// ../../node_modules/@elysiajs/eden/dist/chunk-XYW4OUFN.mjs
var s = class extends Error {
  constructor(e, n) {
    super(n + "");
    this.status = e;
    this.value = n;
  }
};
var i = /(\d{4}-[01]\d-[0-3]\dT[0-2]\d:[0-5]\d:[0-5]\d\.\d+([+-][0-2]\d:[0-5]\d|Z))|(\d{4}-[01]\d-[0-3]\dT[0-2]\d:[0-5]\d:[0-5]\d([+-][0-2]\d:[0-5]\d|Z))|(\d{4}-[01]\d-[0-3]\dT[0-2]\d:[0-5]\d([+-][0-2]\d:[0-5]\d|Z))/;
var o = /(?:Sun|Mon|Tue|Wed|Thu|Fri|Sat)\s(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s\d{2}\s\d{4}\s\d{2}:\d{2}:\d{2}\sGMT(?:\+|-)\d{4}\s\([^)]+\)/;
var c = /^(?:(?:(?:(?:0?[1-9]|[12][0-9]|3[01])[/\s-](?:0?[1-9]|1[0-2])[/\s-](?:19|20)\d{2})|(?:(?:19|20)\d{2}[/\s-](?:0?[1-9]|1[0-2])[/\s-](?:0?[1-9]|[12][0-9]|3[01]))))(?:\s(?:1[012]|0?[1-9]):[0-5][0-9](?::[0-5][0-9])?(?:\s[AP]M)?)?$/;
var u = (t) => t.trim().length !== 0 && !Number.isNaN(Number(t));
var d = (t) => {
  if (typeof t != "string")
    return null;
  let r = t.replace(/"/g, "");
  if (i.test(r) || o.test(r) || c.test(r)) {
    let e = new Date(r);
    if (!Number.isNaN(e.getTime()))
      return e;
  }
  return null;
};
var a = (t) => {
  let r = t.charCodeAt(0), e = t.charCodeAt(t.length - 1);
  return r === 123 && e === 125 || r === 91 && e === 93;
};
var p = (t) => JSON.parse(t, (r, e) => {
  let n = d(e);
  return n || e;
});
var g = (t) => {
  if (!t)
    return t;
  if (u(t))
    return +t;
  if (t === "true")
    return true;
  if (t === "false")
    return false;
  let r = d(t);
  if (r)
    return r;
  if (a(t))
    try {
      return p(t);
    } catch {}
  return t;
};
var S = (t) => {
  let r = t.data.toString();
  return r === "null" ? null : g(r);
};

// ../../node_modules/@elysiajs/eden/dist/chunk-F27RTPSD.mjs
var K = (n, e, t) => {
  if (n.endsWith("/") || (n += "/"), e === "index" && (e = ""), !t || !Object.keys(t).length)
    return `${n}${e}`;
  let s2 = "";
  for (let [c2, a2] of Object.entries(t))
    s2 += `${c2}=${a2}&`;
  return `${n}${e}?${s2.slice(0, -1)}`;
};
var $ = typeof FileList > "u";
var M = (n) => $ ? n instanceof Blob : n instanceof FileList || n instanceof File;
var H = (n) => {
  if (!n)
    return false;
  for (let e in n) {
    if (M(n[e]))
      return true;
    if (Array.isArray(n[e]) && n[e].find((t) => M(t)))
      return true;
  }
  return false;
};
var x = (n) => $ ? n : new Promise((e) => {
  let t = new FileReader;
  t.onload = () => {
    let s2 = new File([t.result], n.name, { lastModified: n.lastModified, type: n.type });
    e(s2);
  }, t.readAsArrayBuffer(n);
});
var T = class {
  ws;
  url;
  constructor(e) {
    this.ws = new WebSocket(e), this.url = e;
  }
  send(e) {
    return Array.isArray(e) ? (e.forEach((t) => this.send(t)), this) : (this.ws.send(typeof e == "object" ? JSON.stringify(e) : e.toString()), this);
  }
  on(e, t, s2) {
    return this.addEventListener(e, t, s2);
  }
  off(e, t, s2) {
    return this.ws.removeEventListener(e, t, s2), this;
  }
  subscribe(e, t) {
    return this.addEventListener("message", e, t);
  }
  addEventListener(e, t, s2) {
    return this.ws.addEventListener(e, (c2) => {
      if (e === "message") {
        let a2 = S(c2);
        t({ ...c2, data: a2 });
      } else
        t(c2);
    }, s2), this;
  }
  removeEventListener(e, t, s2) {
    return this.off(e, t, s2), this;
  }
  close() {
    return this.ws.close(), this;
  }
};
var j = (n, e = "", t) => new Proxy(() => {}, { get(s2, c2, a2) {
  return j(n, `${e}/${c2.toString()}`, t);
}, apply(s2, c2, [a2, b = {}] = [{}, {}]) {
  let f = a2 !== undefined && (typeof a2 != "object" || Array.isArray(a2)) ? a2 : undefined, { $query: I, $fetch: F, $headers: P, $transform: m, getRaw: C, ...q } = a2 ?? {};
  f ??= q;
  let w = e.lastIndexOf("/"), E = e.slice(w + 1).toUpperCase(), v = K(n, w === -1 ? "/" : e.slice(0, w), Object.assign(b.query ?? {}, I)), D = t.fetcher ?? fetch, l = t.transform ? Array.isArray(t.transform) ? t.transform : [t.transform] : undefined, S2 = m ? Array.isArray(m) ? m : [m] : undefined;
  return S2 && (l ? l = S2.concat(l) : l = S2), E === "SUBSCRIBE" ? new T(v.replace(/^([^]+):\/\//, v.startsWith("https://") ? "wss://" : "ws://")) : (async (N) => {
    let r, R = { ...t.$fetch?.headers, ...F?.headers, ...b.headers, ...P };
    if (E !== "GET" && E !== "HEAD") {
      r = Object.keys(f).length || Array.isArray(f) ? f : undefined;
      let p2 = r && (typeof r == "object" || Array.isArray(f));
      if (p2 && H(r)) {
        let u2 = new FormData;
        for (let [h, o2] of Object.entries(r))
          if ($)
            u2.append(h, o2);
          else if (o2 instanceof File)
            u2.append(h, await x(o2));
          else if (o2 instanceof FileList)
            for (let d2 = 0;d2 < o2.length; d2++)
              u2.append(h, await x(o2[d2]));
          else if (Array.isArray(o2))
            for (let d2 = 0;d2 < o2.length; d2++) {
              let k = o2[d2];
              u2.append(h, k instanceof File ? await x(k) : k);
            }
          else
            u2.append(h, o2);
        r = u2;
      } else
        r != null && (R["content-type"] = p2 ? "application/json" : "text/plain", r = p2 ? JSON.stringify(r) : f);
    }
    let i2 = await D(v, { method: E, body: r, ...t.$fetch, ...b.fetch, ...F, headers: R }), g2;
    if (N.getRaw)
      return i2;
    switch (i2.headers.get("Content-Type")?.split(";")[0]) {
      case "application/json":
        g2 = await i2.json();
        break;
      default:
        g2 = await i2.text().then(g);
    }
    let B = i2.status >= 300 || i2.status < 200 ? new s(i2.status, g2) : null, A = { data: g2, error: B, response: i2, status: i2.status, headers: i2.headers };
    if (l)
      for (let p2 of l) {
        let y = p2(A);
        y instanceof Promise && (y = await y), y != null && (A = y);
      }
    return A;
  })({ getRaw: C });
} });
var z = (n, e = { fetcher: fetch }) => new Proxy({}, { get(t, s2) {
  return j(n, s2, e);
} });

// ../../node_modules/@elysiajs/eden/dist/chunk-EO5XYDPY.mjs
var C = typeof FileList > "u";

// ../vibe-sdk/src/index.ts
var accessToken = null;
var createSdk = (apiUrl) => {
  const authorizedFetch = Object.assign(async (input, init) => {
    const options = init || {};
    const headers = new Headers(options.headers);
    if (accessToken && !headers.has("Authorization")) {
      headers.set("Authorization", `Bearer ${accessToken}`);
    }
    const fetchOptions = {
      ...options,
      headers
    };
    try {
      const response = await fetch(input, fetchOptions);
      if (response.status === 401 && typeof window !== "undefined") {
        try {
          const refreshResponse = await fetch(`${apiUrl}/auth/refresh`, {
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
          const retryOptions = { ...fetchOptions, headers: newHeaders };
          return await fetch(input, retryOptions);
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
  }, {
    preconnect: (url, options) => {}
  });
  const client = z(apiUrl, {
    fetcher: authorizedFetch
  });
  return {
    ...client,
    setAccessToken: (token) => {
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
      return null;
    }
  };
};

// src/components/AuthWidget.tsx
import { jsxDEV } from "react/jsx-dev-runtime";
"use client";
var AuthWidget = () => {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [user, setUser] = useState(null);
  const apiUrl = "http://127.0.0.1:5000";
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
