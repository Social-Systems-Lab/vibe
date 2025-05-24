# Vibe Project Overview

Vibe is a technology platform and movement focused on empowering individuals by giving them back control over their digital lives, including their identities, data, and online interactions. It aims to provide tools for secure communication, self-owned identity, decentralized commerce, and civic engagement.

## Core Components

The Vibe ecosystem is built around three main components:

### 1. Vibe Agent (Browser Extension)

The Vibe Agent is a browser extension that functions as your personal digital wallet, identity manager, and security guard for your online interactions within the Vibe ecosystem. It operates primarily through a **Side Panel** interface, accessible by clicking the Vibe icon in the browser toolbar.

**Key Features & User Flows:**

-   **Initial Setup (Onboarding):**

    -   **Welcome:** Upon first installation, the user is greeted by a **Setup Wizard**. They can choose to:
        -   **Create a New Vault:** For users new to Vibe.
        -   **Import an Existing Vault:** For users who have a Vibe seed phrase.
    -   **Password Creation:** The user creates a strong master password to encrypt their Vibe vault. This vault securely stores their cryptographic keys and identity information. (**AES-GCM encryption** with a key derived via **PBKDF2**).
    -   **Seed Phrase (New Vault):** If creating a new vault, a unique **BIP39 mnemonic seed phrase** (e.g., 12 or 24 words) is generated and displayed. The user _must_ securely back up this phrase, as it's the only way to recover their identities if they lose access to their browser or password. They will be asked to confirm they've saved it.
    -   **Import Seed Phrase (Existing Vault):** If importing, the user enters their previously saved seed phrase. They will then also set a new password for this imported vault on the current browser.
    -   **First Identity Creation:** After the vault is set up (new or imported with no identities recovered), the user is guided to create their first digital identity. This involves:
        -   Providing a **Display Name** (e.g., "My Main Vibe").
        -   Optionally uploading a **Profile Picture**.
        -   Configuring a **Vibe Cloud Provider** (defaults to the Official Vibe Cloud, but custom URLs can be added for self-hosted instances, potentially with a claim code).
    -   **Setup Completion:** A confirmation screen indicates the setup is complete.

-   **Accessing the Vault (Unlocking):**

    -   When the Side Panel is opened, if the vault is locked, an **Unlock Screen** is presented.
    -   The user enters their master password to decrypt and access their identities and settings.
    -   A hint of the last active identity (e.g., last 6 characters of the DID) might be shown.

-   **Dashboard (Main Interface - Post-Unlock):**

    -   **Active Identity Display:** Shows the currently selected identity's avatar, display name, and full DID (Decentralized Identifier, e.g., `did:vibe:...`).
    -   **Cloud Status:** Displays the connection status of the active identity to its configured Vibe Cloud instance. This can be expanded for more details.
    -   **Application Context:** If the current website tab is a Vibe-enabled application, the Dashboard shows the app's name and icon. It provides a quick link to manage permissions for this app (navigates to the Consent Request screen).
    -   **Navigation Buttons:**
        -   **Switch Identity:** Takes the user to the "Switch Identity" screen.
        -   **Settings:** Takes the user to the "Identity Settings" screen.

-   **Managing Identities:**

    -   **Switch Identity Screen (`SelectIdentityPage`):**
        -   Displays all created identities in a grid view (avatar, name, DID).
        -   Allows the user to click on an identity to make it the active one.
        -   Includes an "Add Identity" button, which navigates to the "Create New Identity" screen.
    -   **Create New Identity Screen (`NewIdentityPage`):**
        -   Accessible from "Switch Identity" or during the initial setup if no identities were imported.
        -   Users can set a display name, upload a profile picture, and configure the Vibe Cloud provider (similar to the first identity setup).
        -   Requires vault unlock if locked.
    -   **Import Identities (Full Vault - `ImportIdentityPage`):**
        -   Accessible typically from Settings (though not explicitly shown in the Settings page code, it's a standard feature).
        -   Allows a user to import an entire Vibe vault using their master seed phrase and, if the original vault was password-protected, that original password. This replaces the current browser's Vibe Agent data with the imported data.
        -   *Note: This is different from the "Import Phrase" step in the initial Setup Wizard, which is about setting up the *current* browser's vault for the first time using an existing seed.*

-   **Identity Settings Screen (`SettingsPage`):**

    -   **Edit Profile:** For the _currently active_ identity, users can:
        -   Change their **Profile Picture**.
        -   Edit their **Display Name**.
        -   Saving changes requires vault unlock.
    -   **Danger Zone:**
        -   **Delete This Identity:** Permanently deletes the _currently active_ identity from the local Vibe Agent and attempts to deprovision associated cloud services. This action is irreversible and requires vault unlock and user confirmation. If other identities exist, the agent switches to another. If it's the last identity, the agent effectively resets to a "setup required" state.
        -   **Reset Vibe:** Completely wipes _all_ Vibe data from the browser (all identities, the vault, settings). This is a highly destructive action requiring confirmation. It also attempts to clear associated PouchDB databases. The agent will then require a full new setup.

-   **Application Consent Management (`ConsentRequestPage`):**

    -   **Permission Prompts:** When a Vibe-enabled web application requests access to the user's identity or data for the first time (or requests new permissions), this screen appears.
    -   **Details Displayed:** Shows the requesting app's name, icon (if available), origin (website URL), and the specific permissions being requested (e.g., "read:profile", "write:notes") for the currently active Vibe identity.
    -   **User Choices:** For each permission, the user can typically choose to "Always" allow, "Ask" each time, or "Never" allow.
    -   **Decision:** The user can "Allow" the selected permissions or "Deny" the request. Denying can also be done by closing the prompt.
    -   **Reviewing Permissions:** Users can also reach this screen from the Dashboard (via the "manage permissions" link for an active app context) to review and modify previously granted permissions.

-   **User Profile Viewing (`UserProfilePage`):**

    -   Displays a profile for a Vibe DID (Decentralized Identifier). This could be one of the user's own identities or an external Vibe user's profile if the system supports viewing others.
    -   Shows avatar, display name, site/origin, a bio, and the DID.
    -   Currently, this page seems more for display, with future plans for interactions like messaging.

-   **Core Cryptography:**

    -   Uses **Ed25519** cryptographic key pairs for each identity (`did:vibe:...`). These keys are non-extractable from the browser's secure WebCrypto API context where possible.
    -   The vault containing these keys and other sensitive data is encrypted using **AES-GCM**.
    -   The encryption key for the vault is derived from the user's master password using **PBKDF2**.

-   **Developer Interaction:**
    -   Injects a `window.vibe` API into web pages, allowing Vibe-enabled applications to request initialization, permissions, and perform data operations, all mediated by the Vibe Agent.

### 2. Vibe Cloud

Vibe Cloud is your personal, sovereign digital hub. Think of it as your own secure corner of the internet where your data lives, under your control.

**Key Features:**

-   **Personal Data Store:** Provides a secure and persistent place for your identity-related information, application data (like notes or contacts), and files.
-   **User-Controlled Storage:** Utilizes **Apache CouchDB** as its primary database for storing structured data like user profiles and application-specific information. CouchDB is known for its reliability and synchronization capabilities.
-   **Large File Storage:** Integrates with S3-compatible storage solutions (like **Minio**) for handling larger files such as images, videos, or documents.
-   **Cross-Device Synchronization:** Data stored in your Vibe Cloud can be automatically synchronized across your different devices, thanks to CouchDB's replication features.
-   **Secure Access:** Designed with security in mind, relying on HTTPS for secure communication (typically managed by a reverse proxy in self-hosted setups) and CouchDB's own security features for data at rest.
-   **Flexible Deployment:** You can choose to self-host your Vibe Cloud instance for maximum control or use a trusted provider.

### 3. Vibe Notes Test App

The Vibe Notes Test App is a sample application built to demonstrate how Vibe-enabled applications can work. As the name suggests, it's a simple note-taking application.

**Key Features:**

-   **Decentralized Note-Taking:** Allows users to create, view, and manage notes.
-   **Vibe Integration:** Leverages the Vibe Agent for identity and authentication, and Vibe Cloud for storing the notes data securely under the user's control.
-   **Demonstrates Vibe SDK Usage:** Serves as a practical example for developers looking to build applications on the Vibe platform, showcasing how to use the Vibe SDK to interact with the Agent and Cloud.

## Vision

Vibe's overarching goal is to build a more equitable and empowering digital world. By providing tools that prioritize user ownership, security, and decentralization, Vibe aims to foster greater digital autonomy, dignity, and the ability for individuals and communities to connect and collaborate on their own terms.
