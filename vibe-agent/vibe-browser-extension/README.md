# Vibe Agent (Browser Extension)

The Vibe Agent is a Chrome browser extension (Manifest V3) that functions as a secure identity vault, permission mediator, and request proxy for users interacting with Vibe-enabled web applications ("Vibe Apps") and the Vibe Cloud backend. It empowers users with self-sovereign control over their digital identities.

## Core Functionality

Based on the project specifications and current implementation, the Vibe Agent aims to provide:

1.  **Secure Multi-Identity Management:**

    -   Generates and securely stores multiple non-extractable Ed25519 key pairs using WebCrypto APIs within MV3 constraints.
    -   Derives `did:vibe:<multibase-encoded-public-key>` identifiers for each key pair.
    -   Employs an encrypted vault (`chrome.storage.local`) using AES-GCM, with the encryption key derived from a user-defined password via PBKDF2.
    -   Manages an _active identity_, loading its non-extractable `CryptoKey` into `chrome.storage.session` for use.
    -   Supports backup and recovery via a BIP39 mnemonic (seed phrase).
    -   Implemented functionalities are visible in `src/lib/crypto.ts` (mnemonic, key derivation, encryption) and `src/lib/identity.ts` (Ed25519 operations, DID generation). User interface elements for setup, identity creation/import, and unlocking are present in `src/pages/`.

2.  **DID Authentication:**

    -   Implements a challenge-response signing mechanism using the active identity's Ed25519 key to authenticate the user to Vibe Cloud.
    -   Obtains and manages session credentials (e.g., JWTs) scoped to the identity and requesting app.
    -   Token management logic is evident in `src/background-modules/token-manager.ts`.

3.  **Consent Management & Permissioned Proxy:**

    -   Provides a UI for granting/denying Vibe Apps permission to interact using the active identity.
    -   Aims for a tri-state permission model (`always`/`ask`/`never`) scoped per `(identity, origin, scope)`.
    -   Intercepts requests intended for Vibe Cloud APIs, verifies permissions, attaches authentication (JWT), and forwards authorized requests.
    -   The central message handling for these interactions is in `src/background-modules/message-handler.ts`. UI components for consent are expected in `src/components/agent/` (though not fully detailed in the initial file list).

4.  **Developer API (`window.vibe`):**
    -   Injects a JavaScript API (`vibe-inpage.js`) into web pages for Vibe Apps to:
        -   Request initialization and permissions (`init`).
        -   Perform data operations (e.g., `readOnce`, `write`).
    -   The `src/vibe-inpage.ts` file indicates the presence of this injected script.

## Current Implementation Highlights

-   **Cryptographic Operations:** `src/lib/crypto.ts` and `src/lib/identity.ts` contain robust functions for key generation (Ed25519, HD keys from mnemonic), encryption (AES-GCM), decryption, signing, and DID derivation.
-   **Background Logic:** `src/background-modules/` houses key service worker logic for message handling (`message-handler.ts`), session management including active identity and vault state (`session-manager.ts`), and token management (`token-manager.ts`).
-   **User Interface Pages:** `src/pages/` includes components for `DashboardPage`, `SetupWizardPage`, `ImportIdentityPage`, `NewIdentityPage`, `SettingsPage`, and `UnlockPage`, indicating a user-facing interface for managing the agent.

## Getting Started with Development

To install dependencies:

```bash
bun install
```

To start a development server (which typically handles building the extension for loading into Chrome):

```bash
bun dev
```

After running `bun dev`, load the extension into Chrome:

1. Open Chrome and navigate to `chrome://extensions`.
2. Enable "Developer mode" (usually a toggle in the top right).
3. Click "Load unpacked".
4. Select the `vibe-agent/vibe-browser-extension/dist` directory.

## Future Developments (as per spec)

-   Cloud sync/backup of keys or permissions.
-   WebSocket proxying (`read` subscriptions).
-   Complex transaction signing flows.
-   Internationalization (i18n).
-   Importing existing keys (beyond seed phrase recovery).
-   Connecting to or managing multiple Vibe Cloud instances.
