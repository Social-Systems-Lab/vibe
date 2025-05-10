// Polyfill global for browser environment if it's not defined
if (typeof global === "undefined") {
    window.global = window;
}

// You can add other browser-specific polyfills here if needed in the future.
console.log("Polyfills applied (global).");
