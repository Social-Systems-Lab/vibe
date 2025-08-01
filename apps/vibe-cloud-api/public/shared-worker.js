// Vibe Shared Worker
// This script acts as a centralized resource manager for all Vibe tabs.

console.log("Shared Worker script loaded.");

self.onconnect = (event) => {
    const port = event.ports[0];
    console.log("A new tab has connected to the Shared Worker.");

    port.onmessage = (e) => {
        console.log("Shared Worker received message:", e.data);
        port.postMessage("Message received by Shared Worker!");
    };

    port.start(); // Required for onmessage to fire.
};

console.log("Shared Worker is now listening for connections.");
