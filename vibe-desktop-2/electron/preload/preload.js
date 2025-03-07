const { contextBridge, ipcRenderer } = require("electron");

const funcMap = new WeakMap();

contextBridge.exposeInMainWorld("electron", {
    send: (channel, data) => {
        let validChannels = ["toMain"];
        if (validChannels.includes(channel)) {
            ipcRenderer.send(channel, data);
        }
    },
    on: (channel, func) => {
        let validChannels = ["fromMain", "accounts-directory-changed"];
        if (validChannels.includes(channel)) {
            const newFunc = (event, ...args) => func(...args);
            ipcRenderer.on(channel, newFunc);
            funcMap.set(func, newFunc);
            return newFunc;
        }
        return null;
    },
    removeListener: (channel, func) => {
        const newFunc = funcMap.get(func);
        if (newFunc) {
            ipcRenderer.removeListener(channel, func);
        }
    },
    getConfig: async () => {
        return ipcRenderer.invoke("get-config");
    },
    minimizeWindow: () => {
        ipcRenderer.invoke("minimize-window");
    },
    maximizeWindow: () => {
        ipcRenderer.invoke("maximize-window");
    },
    closeWindow: () => {
        ipcRenderer.invoke("close-window");
    },
    isWindowMaximized: async () => {
        return ipcRenderer.invoke("is-window-maximized");
    },
    getAccounts: async () => {
        return ipcRenderer.invoke("get-accounts");
    },
    createAccount: async (name, password, picture) => {
        return ipcRenderer.invoke("create-account", name, password, picture);
    },
    login: async (name, password) => {
        return ipcRenderer.invoke("login", name, password);
    },
    getAccountsDirectoryData: () => {
        return ipcRenderer.invoke("get-accounts-directory-data");
    },
});

// ----------------------------------------------------------------------

function domReady(condition = ["complete", "interactive"]) {
    return new Promise((resolve) => {
        if (condition.includes(document.readyState)) {
            resolve(true);
        } else {
            document.addEventListener("readystatechange", () => {
                if (condition.includes(document.readyState)) {
                    resolve(true);
                }
            });
        }
    });
}

const safeDOM = {
    append(parent, child) {
        if (!Array.from(parent.children).find((e) => e === child)) {
            return parent.appendChild(child);
        }
    },
    remove(parent, child) {
        if (Array.from(parent.children).find((e) => e === child)) {
            return parent.removeChild(child);
        }
    },
};

/**
 * https://tobiasahlin.com/spinkit
 * https://connoratherton.com/loaders
 * https://projects.lukehaas.me/css-loaders
 * https://matejkustec.github.io/SpinThatShit
 */
function useLoading() {
    const className = `loaders-css__square-spin`;
    const styleContent = `
@keyframes square-spin {
  25% { transform: perspective(100px) rotateX(180deg) rotateY(0); }
  50% { transform: perspective(100px) rotateX(180deg) rotateY(180deg); }
  75% { transform: perspective(100px) rotateX(0) rotateY(180deg); }
  100% { transform: perspective(100px) rotateX(0) rotateY(0); }
}
.${className} > div {
  animation-fill-mode: both;
  width: 50px;
  height: 50px;
  background: #fff;
  animation: square-spin 3s 0s cubic-bezier(0.09, 0.57, 0.49, 0.9) infinite;
}
.app-loading-wrap {
  position: fixed;
  top: 0;
  left: 0;
  width: 100vw;
  height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #282c34;
  z-index: 9;
}
    `;
    const oStyle = document.createElement("style");
    const oDiv = document.createElement("div");

    oStyle.id = "app-loading-style";
    oStyle.innerHTML = styleContent;
    oDiv.className = "app-loading-wrap";
    oDiv.innerHTML = `<div class="${className}"><div></div></div>`;

    return {
        appendLoading() {
            safeDOM.append(document.head, oStyle);
            safeDOM.append(document.body, oDiv);
        },
        removeLoading() {
            safeDOM.remove(document.head, oStyle);
            safeDOM.remove(document.body, oDiv);
        },
    };
}

// ----------------------------------------------------------------------

const { appendLoading, removeLoading } = useLoading();
domReady().then(appendLoading);

window.onmessage = (ev) => {
    ev.data.payload === "removeLoading" && removeLoading();
};

setTimeout(removeLoading, 4999);
