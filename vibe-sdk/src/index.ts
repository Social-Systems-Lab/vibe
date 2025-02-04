// index.ts - Vibe SSI app framework SDK
declare global {
    interface Window {
        _VIBE_ENABLED?: boolean;
        ReactNativeWebView?: {
            postMessage: (message: string) => void;
        };
        vibe?: typeof vibe;
    }
}

type Account = {
    did: string;
    publicKey: string;
    name: string;
};

type VibeState = {
    account: Account | null;
    permissions: Record<string, "always" | "ask" | "never">;
};

type AppManifest = {
    id: string;
    name: string;
    description: string;
    permissions: string[];
    pictureUrl?: string;
    onetapEnabled?: boolean;
};

type Callback = (state: VibeState) => void;
type Unsubscribe = () => void;

enum MessageType {
    INIT_REQUEST = "InitRequest",
    WRITE_REQUEST = "WriteRequest",
    NATIVE_RESPONSE = "NativeResponse",
    LOG_REQUEST = "LogRequest",
}

const vibe = (() => {
    let _state: VibeState = { account: null, permissions: {} }; // Initial state
    let _listeners: Callback[] = []; // State listeners
    const pendingRequests: Record<string, (value: any) => void> = {}; // Tracks requests

    const generateRequestId = () => Date.now().toString();
    const isBrowser = typeof window !== "undefined";
    const inVibeApp = isBrowser && !!window._VIBE_ENABLED;
    const isMobile = isBrowser && /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

    const init = (manifest: AppManifest, callback: Callback): Unsubscribe => {
        if (!isBrowser) {
            console.warn("Vibe SDK init should only run in a browser environment.");
            return () => {};
        }

        const oneTapEnabled = manifest.onetapEnabled || false;
        if (inVibeApp) {
            sendToNativeApp({
                type: MessageType.INIT_REQUEST,
                manifest,
            });
            callback(_state);
        } else {
            if (oneTapEnabled) {
                showOneTapPrompt(manifest);
            }
            console.log(`Running Vibe SDK init in ${isMobile ? "mobile" : "desktop"} browser.`);
        }

        //console.log("Initializing vibe with manifest", manifest);

        _listeners.push(callback);

        return () => {
            _listeners = _listeners.filter((listener) => listener !== callback);
        };
    };

    const writeData = (data: any): Promise<any> => {
        if (!inVibeApp) {
            return Promise.reject(
                new Error("writeData called when vibe is not enabled. Make sure to check vibe.enabled and call vibe.init to initialize the app")
            );
        }

        return sendAsyncToNativeApp({
            type: MessageType.WRITE_REQUEST,
            data,
        });
    };

    const sendToNativeApp = (message: any) => {
        if (!inVibeApp) {
            //console.error("ReactNativeWebView not available 2");
            return;
        }

        window?.ReactNativeWebView?.postMessage(JSON.stringify(message));
    };

    const sendAsyncToNativeApp = (message: any): Promise<any> => {
        return new Promise((resolve, reject) => {
            const requestId = generateRequestId();
            pendingRequests[requestId] = resolve;
            sendToNativeApp({ ...message, requestId });

            // timeout to reject the promise if no response
            setTimeout(() => {
                if (pendingRequests[requestId]) {
                    delete pendingRequests[requestId];
                    reject(new Error("Request timed out"));
                }
            }, 60000); // 60 seconds
        });
    };

    const handleNativeResponse = (response: any) => {
        sendToNativeApp({
            type: MessageType.LOG_REQUEST,
            message: "Got response from native app" + JSON.stringify(response),
        });
        const { requestId, result, error, stateUpdate } = response;
        if (stateUpdate) {
            _state = { ..._state, ...stateUpdate };
            _listeners.forEach((listener) => listener(_state));
        }
        if (requestId && pendingRequests[requestId]) {
            if (error) {
                pendingRequests[requestId](Promise.reject(new Error(error)));
            } else {
                pendingRequests[requestId](result);
            }
            delete pendingRequests[requestId];
        }
    };

    const showQRCodeForSignIn = (manifest: AppManifest) => {
        const container = document.createElement("div");
        container.style.position = "fixed";
        container.style.top = "0";
        container.style.left = "0";
        container.style.width = "100vw";
        container.style.height = "100vh";
        container.style.display = "flex";
        container.style.justifyContent = "center";
        container.style.alignItems = "center";
        container.style.backgroundColor = "rgba(0, 0, 0, 0.5)";
        container.style.zIndex = "1000";

        const qrCodeContainer = document.createElement("div");
        qrCodeContainer.style.backgroundColor = "#fff";
        qrCodeContainer.style.padding = "16px";
        qrCodeContainer.style.borderRadius = "8px";

        // Replace with actual QR code generation logic
        const qrCode = `vibe://auth?appId=${manifest.id}`;
        qrCodeContainer.innerText = `Scan this QR Code: ${qrCode}`;

        container.onclick = () => {
            container.remove();
        };

        container.appendChild(qrCodeContainer);
        document.body.appendChild(container);
    };

    const showOneTapPrompt = (manifest: AppManifest) => {
        // Create container for the prompt
        const container = document.createElement("div");
        container.style.position = "fixed";
        container.style.top = "20px";
        container.style.right = "20px";
        container.style.backgroundColor = "#fff";
        container.style.boxShadow = "0px 4px 6px rgba(0, 0, 0, 0.1)";
        container.style.borderRadius = "8px";
        container.style.padding = "16px";
        container.style.zIndex = "1000";
        container.style.cursor = "pointer";
        container.style.transform = "scale(0.9)";
        container.style.transition = "transform 0.3s ease-out, opacity 0.3s ease-out";
        container.style.opacity = "0";

        // Flex layout for horizontal alignment
        container.style.display = "flex";
        container.style.alignItems = "center";
        container.style.justifyContent = "space-between";
        container.style.gap = "12px";

        // Animate in (fade-in and expand)
        requestAnimationFrame(() => {
            container.style.transform = "scale(1)";
            container.style.opacity = "1";
        });

        // Create app image (if available)
        if (manifest.pictureUrl) {
            const img = document.createElement("img");
            img.src = manifest.pictureUrl;
            img.style.width = "32px";
            img.style.height = "32px";
            img.style.borderRadius = "50%";
            container.appendChild(img);
        }

        // Add text
        const text = document.createElement("div");
        text.innerHTML = `
            <p>Sign in to ${manifest.name} with Vibe</p>
        `;
        text.style.flex = "1"; // Ensure text takes up remaining space
        text.style.fontSize = "14px";
        text.style.lineHeight = "1.5";
        container.appendChild(text);

        // Add close button
        const closeButton = document.createElement("span");
        closeButton.innerHTML = "&times;";
        closeButton.style.fontSize = "22px";
        closeButton.style.cursor = "pointer";
        closeButton.style.color = "#888";

        // Align close button to the right
        closeButton.onclick = () => {
            // Animate out (fade-out and shrink)
            container.style.transform = "scale(0.9)";
            container.style.opacity = "0";

            setTimeout(() => {
                container.remove();
            }, 300);
        };

        container.appendChild(closeButton);

        container.onclick = (e) => {
            if (e.target === closeButton) return;

            // Trigger deep link or QR code logic for sign-in
            if (isMobile) {
                window.location.href = `vibe://auth?appId=${manifest.id}`;
            } else {
                showQRCodeForSignIn(manifest);
            }

            // Close the prompt after interaction
            if (closeButton.onclick) {
                closeButton.onclick(e);
            }
        };

        // Add to body
        document.body.appendChild(container);
    };

    return {
        inVibeApp,
        init,
        writeData,
        _state,
        _listeners,
        handleNativeResponse,
    };
})();

if (typeof window !== "undefined") {
    (window as any).vibe = vibe;
}

export { vibe, MessageType, Account, VibeState, AppManifest, Callback, Unsubscribe };
