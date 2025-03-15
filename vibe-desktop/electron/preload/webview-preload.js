const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electron", {
    send: (channel, data) => {
        let validChannels = ["toMain"];
        if (validChannels.includes(channel)) {
            ipcRenderer.send(channel, data);
        }
    },
    on: (channel, func) => {
        let validChannels = ["fromMain"];
        if (validChannels.includes(channel)) {
            const newFunc = (event, ...args) => func(...args);
            ipcRenderer.on(channel, newFunc);
            return newFunc;
        }
        return null;
    },
    removeListener: (channel, func) => {
        ipcRenderer.removeListener(channel, func);
    },
});

console.log("webview preload script loaded");
// document.addEventListener("auxclick", (event) => {
//     if (event.button === 1) {
//         console.log("middle mouse click: " + window.electron);
//         if (!window.electron) return;

//         const { href } = event.target.closest("a") || {};
//         if (href) {
//             event.preventDefault();
//             window.electron.send("toMain", { event: "new-tab", href });
//         }
//     }
// });

// document.addEventListener("contextmenu", (event) => {
//     console.log("right click");
//     const { href } = event.target.closest("a") || {};
//     const { src } = event.target.closest("img") || {};
//     if (href) {
//         event.preventDefault();
//         window.electron.send("toMain", { event: "context-menu", href, src });
//     }
// });
