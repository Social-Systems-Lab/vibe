import { startRegistration, startAuthentication } from "/node_modules/@simplewebauthn/browser/dist/bundle/index.js"; // Adjust path if needed based on bun's node_modules structure

const usernameRegInput = document.getElementById("usernameReg");
const btnRegister = document.getElementById("btnRegister");
const usernameLoginInput = document.getElementById("usernameLogin");
const btnLogin = document.getElementById("btnLogin");
const btnLogout = document.getElementById("btnLogout");
const messageArea = document.getElementById("messages");
const registrationSection = document.getElementById("registrationSection");
const loginSection = document.getElementById("loginSection");
const userInfoSection = document.getElementById("userInfo");
const loggedInUsernameEl = document.getElementById("loggedInUsername");
const authenticatorInfoEl = document.getElementById("authenticatorInfo");

// Helper to display messages
function logMessage(message) {
    const timestamp = new Date().toLocaleTimeString();
    messageArea.textContent = `[${timestamp}] ${message}\n${messageArea.textContent}`;
    console.log(`[${timestamp}] ${message}`);
}

// Helper for API calls
async function fetchApi(endpoint, body) {
    try {
        const response = await fetch(endpoint, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify(body),
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || `HTTP error! status: ${response.status}`);
        }
        return data;
    } catch (error) {
        logMessage(`API Error (${endpoint}): ${error.message}`);
        console.error(`API Error (${endpoint}):`, error);
        throw error; // Re-throw to be caught by caller
    }
}

// --- Registration ---
btnRegister.addEventListener("click", async () => {
    const username = usernameRegInput.value;
    if (!username) {
        logMessage("Please enter a username for registration.");
        return;
    }
    logMessage(`Initiating registration for ${username}...`);

    try {
        // 1. Get options from server
        const regOptions = await fetchApi("/generate-registration-options", { username });
        logMessage("Registration options received from server.");
        console.log("Registration Options:", regOptions);

        // 2. Start WebAuthn registration
        const attestationResponse = await startRegistration(regOptions);
        logMessage("WebAuthn registration ceremony completed by browser/authenticator.");
        console.log("Attestation Response:", attestationResponse);

        // 3. Send attestation response to server for verification
        const verificationResult = await fetchApi("/verify-registration", { username, attestationResponse });

        if (verificationResult?.verified) {
            logMessage(`Authenticator registered successfully for ${username}!`);
            // Optionally update UI or redirect
        } else {
            logMessage(`Server verification failed: ${verificationResult?.error || "Unknown error"}`);
        }
    } catch (error) {
        logMessage(`Registration failed: ${error.message}`);
        if (error.name === "InvalidStateError") {
            logMessage("Error: Authenticator was probably already registered with this site.");
        }
    }
});

// --- Authentication ---
btnLogin.addEventListener("click", async () => {
    const username = usernameLoginInput.value; // Optional for discoverable credentials
    logMessage(`Initiating login${username ? ` for ${username}` : ""}...`);

    try {
        // 1. Get options from server
        const authOptions = await fetchApi("/generate-authentication-options", { username }); // Send username if provided
        logMessage("Authentication options received from server.");
        console.log("Authentication Options:", authOptions);

        // 2. Start WebAuthn authentication
        const assertionResponse = await startAuthentication(authOptions);
        logMessage("WebAuthn authentication ceremony completed by browser/authenticator.");
        console.log("Assertion Response:", assertionResponse);

        // 3. Send assertion response to server for verification
        const verificationResult = await fetchApi("/verify-authentication", { assertionResponse }); // Server might identify user via assertion

        if (verificationResult?.verified) {
            logMessage(`Login successful! User: ${verificationResult.user.username}`);
            updateUIForLogin(verificationResult.user);
        } else {
            logMessage(`Server verification failed: ${verificationResult?.error || "Unknown error"}`);
        }
    } catch (error) {
        logMessage(`Login failed: ${error.message}`);
    }
});

// --- Logout ---
btnLogout.addEventListener("click", async () => {
    try {
        // Inform the server about logout (optional, depends on session management)
        // await fetchApi('/logout', {}); // Example endpoint
        logMessage("Logged out.");
        updateUIForLogout();
    } catch (error) {
        logMessage(`Logout error: ${error.message}`);
    }
});

// --- UI Updates ---
function updateUIForLogin(user) {
    registrationSection.classList.add("hidden");
    loginSection.classList.add("hidden");
    userInfoSection.classList.remove("hidden");
    loggedInUsernameEl.textContent = user.username;
    authenticatorInfoEl.textContent = JSON.stringify(user.authenticators || [], null, 2);
}

function updateUIForLogout() {
    registrationSection.classList.remove("hidden");
    loginSection.classList.remove("hidden");
    userInfoSection.classList.add("hidden");
    loggedInUsernameEl.textContent = "";
    authenticatorInfoEl.textContent = "";
    usernameLoginInput.value = ""; // Clear login username field
}

// Initial state
logMessage("Client script loaded. Ready for WebAuthn actions.");
updateUIForLogout(); // Start in logged-out state
