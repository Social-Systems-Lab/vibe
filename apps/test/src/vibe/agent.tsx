// apps/test/src/vibe/agent.tsx - Renamed from ui-context.tsx
// This provider now simulates the Vibe Agent itself, managing identities,
// permissions (internally), UI prompts, and providing the `window.vibe` SDK interface.

import React, { createContext, useState, useContext, useCallback, useEffect, useMemo } from "react";
import type { ReactNode } from "react"; // Import ReactNode as a type
// Removed import { MockVibeAgent } from "./agent";
// Consolidated imports for both class and provider:
import type {
    VibeAgent, // Added
    Account, // Added
    SubscriptionCallback, // Added
    ReadParams, // Added
    WriteParams, // Added
    ConsentRequest,
    ActionRequest,
    ActionResponse,
    PermissionSetting,
    Identity,
    AppManifest,
    VibeState,
    ReadResult,
    WriteResult,
    Unsubscribe,
} from "./types";
import { generateEd25519KeyPair, signEd25519, didFromEd25519, uint8ArrayToHex, type Ed25519KeyPair, hexToUint8Array } from "../lib/identity";
import { Buffer } from "buffer";
import * as ed from "@noble/ed25519";
// Import crypto helpers needed for vault operations
import {
    deriveEncryptionKey,
    decryptData,
    seedFromMnemonic,
    getMasterHDKeyFromSeed,
    deriveChildKeyPair,
    wipeMemory,
    type EncryptedData,
    generateSalt,
    generateMnemonic, // Added for createNewVault
    encryptData, // Added for createNewVault
} from "../lib/crypto";
import type { HDKey } from "micro-ed25519-hdkey"; // Import type

import { ConsentModal } from "../components/agent/ConsentModal";
import { ActionPromptModal } from "../components/agent/ActionPromptModal";
import { InitPrompt } from "../components/agent/InitPrompt"; // Added import
import { UnlockModal } from "../components/agent/UnlockModal"; // Import UnlockModal
import { Button } from "@/components/ui/button"; // Import Button for error step

// --- Constants for MockVibeAgent ---
const VIBE_CLOUD_BASE_URL = "http://127.0.0.1:3001"; // 3001 = backen run outside docker, 3000=backend in docker
const ADMIN_CLAIM_CODE = "ABC1-XYZ9"; // From vibe-cloud/.env
const LOCAL_STORAGE_KEY_PREFIX = "vibe_agent_";
// Use keys defined in SetupWizard
const LOCAL_STORAGE_VAULT_KEY = "vibe_agent_vault";
const LOCAL_STORAGE_VAULT_SALT_KEY = "vibe_agent_vault_salt";
const LOCAL_STORAGE_CLOUD_URL_KEY = "vibe_agent_cloud_url"; // Keep for now, might move into vault later
// Keep other keys separate for now
const LOCAL_STORAGE_ACTIVE_DID_KEY = `${LOCAL_STORAGE_KEY_PREFIX}active_did`;
const LOCAL_STORAGE_PERMISSIONS_KEY = `${LOCAL_STORAGE_KEY_PREFIX}permissions`;
const LOCAL_STORAGE_JWT_KEY = `${LOCAL_STORAGE_KEY_PREFIX}jwts`;

// Type for the decrypted vault structure
interface VaultData {
    encryptedSeedPhrase: EncryptedData;
    identities: Array<{
        did: string;
        derivationPath: string;
        profile_name: string | null;
        profile_picture: string | null;
    }>;
    settings: {
        nextAccountIndex: number;
    };
}

// Type for public identity info (when locked)
type PublicIdentityInfo = Omit<Identity, "privateKey" | "publicKey">;

// --- MockVibeAgent Class Definition ---
/**
 * Mock implementation of the VibeAgent interface.
 * Manages identities (via encrypted vault), permissions locally, and simulates UI interactions.
 */
export class MockVibeAgent implements VibeAgent {
    // Add export keyword
    // --- State ---
    public isLocked: boolean = true; // Agent starts locked - make public for provider check
    private vaultSalt: Uint8Array | null = null; // Loaded from storage
    private encryptedVaultData: VaultData | null = null; // Loaded from storage

    // In-memory state (populated after unlock)
    private identities: Identity[] = []; // Holds full Identity objects with keys *only when unlocked*
    private activeIdentity: Identity | null = null; // Refers to an object in the in-memory `identities` array
    private decryptedSeedPhrase: string | null = null; // Temporary, wiped after use
    private masterHDKey: HDKey | null = null; // Temporary, wiped after use

    // State loaded/managed regardless of lock status (or after unlock)
    private permissions: Record<string, Record<string, Record<string, PermissionSetting>>> = {};
    private jwts: Record<string, string> = {};
    private cloudUrl: string | null = null; // Loaded from storage

    // App/UI related state
    private manifest: AppManifest | null = null;
    private currentOrigin: string = window.location.origin;

    // --- UI Interaction Callbacks ---
    private uiRequestConsent: ((request: ConsentRequest) => Promise<Record<string, PermissionSetting>>) | null = null;
    private uiRequestActionConfirmation: ((request: ActionRequest) => Promise<ActionResponse>) | null = null;
    private uiRequestInitPrompt: ((manifest: AppManifest) => Promise<void>) | null = null; // Added for Scenario 1
    // TODO: Add uiRequestPasswordPrompt callback

    // Backend/WebSocket related (kept for potential future direct connection)
    private webSocket: WebSocket | null = null;
    private isWebSocketConnecting: boolean = false;
    private webSocketUrl: string | null = null;
    private subscriptions: Map<string, SubscriptionCallback<any>> = new Map();
    private pendingSubscriptions: Map<string, SubscriptionCallback<any>> = new Map();

    private isInitialized = false;
    private isInitializing = false;

    constructor() {
        console.log("MockVibeAgent: Initializing...");
        this.loadInitialStateFromStorage(); // Load only non-sensitive data initially
        console.log(`MockVibeAgent: Initialized. Locked: ${this.isLocked}`);
    }

    // Method for UI Layer to inject prompt functions
    public setUIHandlers(handlers: {
        requestConsent: (request: ConsentRequest) => Promise<Record<string, PermissionSetting>>;
        requestActionConfirmation: (request: ActionRequest) => Promise<ActionResponse>;
        requestInitPrompt: (manifest: AppManifest) => Promise<void>; // Added
        // TODO: Add requestPasswordPrompt handler
    }): void {
        console.log("[MockVibeAgent] Setting UI handlers.");
        this.uiRequestConsent = handlers.requestConsent;
        this.uiRequestActionConfirmation = handlers.requestActionConfirmation;
        this.uiRequestInitPrompt = handlers.requestInitPrompt; // Added
    }

    // --- WebSocket Methods (Placeholder/Future Use) ---

    private async ensureWebSocketConnection(): Promise<void> {
        this.ensureInitialized(); // Need JWT and manifest

        // Already connected and open? Nothing to do.
        if (this.webSocket && this.webSocket.readyState === WebSocket.OPEN) {
            return;
        }

        // Currently connecting? Wait for it to finish (or fail).
        if (this.isWebSocketConnecting) {
            // Simple approach: wait a bit and check again, or use a Promise-based lock
            console.debug("WebSocket is already connecting, waiting...");
            // A more robust solution would use a Promise that resolves/rejects when connection attempt finishes
            await new Promise((resolve) => setTimeout(resolve, 100)); // Simple polling/delay
            return this.ensureWebSocketConnection(); // Re-check status
        }

        // Not connected, not connecting: Initiate connection
        if (!this.webSocket || this.webSocket.readyState === WebSocket.CLOSED) {
            // Use JWT for the active identity
            const activeJwt = this.activeIdentity ? this.jwts[this.activeIdentity.did] : null;
            if (!activeJwt || !this.manifest?.appId) {
                throw new Error("Cannot establish WebSocket connection without an active identity JWT and App ID.");
            }
            // Construct URL (handle potential http/https mismatch)
            const wsProtocol = VIBE_CLOUD_BASE_URL.startsWith("https:") ? "wss:" : "ws:";
            const wsHost = VIBE_CLOUD_BASE_URL.replace(/^https?:/, "");
            this.webSocketUrl = `${wsProtocol}${wsHost}/ws?token=${encodeURIComponent(activeJwt)}&appId=${encodeURIComponent(this.manifest.appId)}`;

            console.log(`Attempting to connect WebSocket to: ${this.webSocketUrl.split("?")[0]}...`); // Don't log token
            this.isWebSocketConnecting = true;
            this.webSocket = new WebSocket(this.webSocketUrl);

            return new Promise((resolve, reject) => {
                this.webSocket!.onopen = () => {
                    console.log("WebSocket connection established.");
                    this.isWebSocketConnecting = false;
                    // Process any subscriptions that were waiting
                    this.processPendingSubscriptions();
                    resolve();
                };

                this.webSocket!.onmessage = (event) => {
                    this.handleWebSocketMessage(event.data);
                };

                this.webSocket!.onerror = (event) => {
                    console.error("WebSocket error:", event);
                    this.isWebSocketConnecting = false;
                    this.webSocket = null; // Reset on error
                    // Reject pending subscriptions? Or just let subsequent calls fail?
                    this.pendingSubscriptions.clear(); // Clear pending ones on error
                    reject(new Error("WebSocket connection error."));
                };

                this.webSocket!.onclose = (event) => {
                    console.log(`WebSocket closed: Code=${event.code}, Reason=${event.reason}`);
                    this.isWebSocketConnecting = false;
                    this.webSocket = null; // Reset on close
                    // Clear subscriptions as they are no longer active
                    this.subscriptions.clear();
                    this.pendingSubscriptions.clear();
                    // Optionally notify the app about the disconnection
                };
            });
        }
        // Should not reach here if logic is correct, but return resolved promise
        return Promise.resolve();
    }

    private processPendingSubscriptions(): void {
        if (!this.webSocket || this.webSocket.readyState !== WebSocket.OPEN) {
            console.warn("WebSocket not open, cannot process pending subscriptions.");
            return;
        }
        console.debug(`Processing ${this.pendingSubscriptions.size} pending subscriptions...`);
        this.pendingSubscriptions.forEach((callback, collection) => {
            // Move from pending to active
            this.subscriptions.set(collection, callback);
            // Send subscribe message
            this.sendWebSocketMessage({ action: "subscribe", collection });
        });
        this.pendingSubscriptions.clear();
    }

    private handleWebSocketMessage(rawMessage: any): void {
        try {
            const message = JSON.parse(rawMessage);
            console.debug("WebSocket message received:", message);

            // Handle backend messages (update, error, status confirmations)
            if (message.type === "update" && message.collection && message.data) {
                const callback = this.subscriptions.get(message.collection);
                if (callback) {
                    // Assuming backend sends the single changed doc in `data`
                    // We need to merge this into the existing state, which the agent doesn't know.
                    // The current VibeProvider/SDK design expects the *full* dataset on update.
                    // This is a mismatch!
                    // Option 1: Agent refetches full data (inefficient)
                    // Option 2: Backend RealtimeService sends full data (potentially large)
                    // Option 3: SDK/App handles merging the single update (complex state logic in app)

                    // --- TEMPORARY WORKAROUND (Option 1 - Inefficient): Refetch ---
                    console.warn(`Received single doc update for ${message.collection}. Refetching full data as a workaround.`);
                    this.readOnce({ collection: message.collection })
                        .then((result) => {
                            if (result.ok) {
                                callback(null, result.data);
                            } else {
                                callback(new Error(result.error || `Refetch failed for ${message.collection}`), null);
                            }
                        })
                        .catch((err) => {
                            callback(err, null);
                        });
                    // --- End Workaround ---

                    // Ideal (if backend sent full data or app handled merge):
                    // callback(null, message.data); // Adjust based on actual payload structure
                } else {
                    console.warn(`Received update for unsubscribed collection: ${message.collection}`);
                }
            } else if (
                message.status === "subscribed" ||
                message.status === "unsubscribed" ||
                message.status === "denied" ||
                message.status === "not_subscribed"
            ) {
                // Log confirmation/status messages from backend
                console.log(`WebSocket status for collection '${message.collection}': ${message.status}${message.reason ? ` (${message.reason})` : ""}`);
            } else if (message.error) {
                console.error(`WebSocket error message from server: ${message.error}`);
                // Maybe notify specific subscription? Difficult without context.
            } else {
                console.warn("Received unknown WebSocket message format:", message);
            }
        } catch (error) {
            console.error("Failed to parse WebSocket message:", rawMessage, error);
        }
    }

    private sendWebSocketMessage(message: object): void {
        if (this.webSocket && this.webSocket.readyState === WebSocket.OPEN) {
            try {
                console.debug("Sending WebSocket message:", message);
                this.webSocket.send(JSON.stringify(message));
            } catch (error) {
                console.error("Failed to send WebSocket message:", error);
            }
        } else {
            console.warn("WebSocket not open, cannot send message:", message);
            // TODO: Queue message or handle error? For subscribe/unsubscribe, queuing might be complex.
        }
    }

    // --- Vault and State Management ---

    // Check if vault exists in storage
    public hasVault(): boolean {
        return !!localStorage.getItem(LOCAL_STORAGE_VAULT_KEY) && !!localStorage.getItem(LOCAL_STORAGE_VAULT_SALT_KEY);
    }

    // Loads only the salt and encrypted vault initially. Does not unlock.
    private loadInitialStateFromStorage(): void {
        try {
            const storedSaltHex = localStorage.getItem(LOCAL_STORAGE_VAULT_SALT_KEY);
            const storedVaultJson = localStorage.getItem(LOCAL_STORAGE_VAULT_KEY);

            if (storedSaltHex && storedVaultJson) {
                this.vaultSalt = hexToUint8Array(storedSaltHex);
                this.encryptedVaultData = JSON.parse(storedVaultJson);
                this.isLocked = true; // Explicitly set to locked, even if vault exists
                console.log("MockVibeAgent: Vault salt and encrypted data loaded. Agent is LOCKED.");
            } else {
                // This case should ideally not happen after setup is complete.
                // If it does, it means setup wasn't done or storage was cleared.
                this.isLocked = true; // Remain locked
                this.vaultSalt = null;
                this.encryptedVaultData = null;
                console.warn("MockVibeAgent: Vault salt or data not found in localStorage. Agent remains LOCKED. Setup may be required.");
            }

            // Load non-sensitive data that doesn't require unlock (permissions, JWTs, cloud URL)
            // Permissions
            const storedPermissions = localStorage.getItem(LOCAL_STORAGE_PERMISSIONS_KEY);
            this.permissions = storedPermissions ? JSON.parse(storedPermissions) : {};
            console.log(`MockVibeAgent: Loaded permissions (${Object.keys(this.permissions).length} DIDs).`);

            // JWTs
            const storedJwts = localStorage.getItem(LOCAL_STORAGE_JWT_KEY);
            this.jwts = storedJwts ? JSON.parse(storedJwts) : {};
            console.log(`MockVibeAgent: Loaded JWTs (${Object.keys(this.jwts).length} DIDs).`);

            // Cloud URL
            this.cloudUrl = localStorage.getItem(LOCAL_STORAGE_CLOUD_URL_KEY);
            console.log(`MockVibeAgent: Loaded Cloud URL: ${this.cloudUrl || "Not set"}`);

            // Note: Active DID ref is loaded after unlock, as it refers to the derived identities.
        } catch (error) {
            console.error("MockVibeAgent: Error loading initial state from localStorage:", error);
            // Reset state in case of corruption
            this.vaultSalt = null;
            this.encryptedVaultData = null;
            this.permissions = {};
            this.jwts = {};
            this.cloudUrl = null;
            this.isLocked = true;
        }
    }

    // Saves the currently encrypted vault and salt (e.g., after adding an identity)
    // NOTE: This should only be called internally when the vault structure changes.
    // The vault remains encrypted on disk.
    private saveVaultToStorage(): void {
        // Vault saving should happen when the encryptedVaultData is updated (e.g., adding identity)
        // This method might not be needed if updates happen atomically.
        // For now, assume vault is saved by the methods that modify it (like a future createIdentity).
        if (!this.vaultSalt || !this.encryptedVaultData) {
            console.error("MockVibeAgent: Cannot save vault if vault data/salt is missing.");
            return;
        }
        try {
            const saltHex = Buffer.from(this.vaultSalt).toString("hex");
            localStorage.setItem(LOCAL_STORAGE_VAULT_SALT_KEY, saltHex);
            localStorage.setItem(LOCAL_STORAGE_VAULT_KEY, JSON.stringify(this.encryptedVaultData));
            console.log("MockVibeAgent: Encrypted vault and salt saved to localStorage.");
        } catch (error) {
            console.error("MockVibeAgent: Error saving vault state to localStorage:", error);
        }
    }

    // Saves non-vault state (permissions, JWTs, active DID ref, cloud URL)
    // Should generally be called after modifications while unlocked.
    private saveNonVaultStateToStorage(): void {
        try {
            localStorage.setItem(LOCAL_STORAGE_PERMISSIONS_KEY, JSON.stringify(this.permissions));
            localStorage.setItem(LOCAL_STORAGE_JWT_KEY, JSON.stringify(this.jwts));
            if (this.activeIdentity) {
                localStorage.setItem(LOCAL_STORAGE_ACTIVE_DID_KEY, this.activeIdentity.did);
            } else {
                localStorage.removeItem(LOCAL_STORAGE_ACTIVE_DID_KEY);
            }
            if (this.cloudUrl) {
                localStorage.setItem(LOCAL_STORAGE_CLOUD_URL_KEY, this.cloudUrl);
            } else {
                localStorage.removeItem(LOCAL_STORAGE_CLOUD_URL_KEY);
            }
            console.log("MockVibeAgent: Non-vault state (permissions, JWTs, active DID, cloud URL) saved.");
        } catch (error) {
            console.error("MockVibeAgent: Error saving non-vault state to localStorage:", error);
        }
    }

    // Clears ALL agent-related data from storage (for testing/reset)
    public clearAllStorage(): void {
        try {
            localStorage.removeItem(LOCAL_STORAGE_VAULT_KEY);
            localStorage.removeItem(LOCAL_STORAGE_VAULT_SALT_KEY);
            localStorage.removeItem(LOCAL_STORAGE_ACTIVE_DID_KEY);
            localStorage.removeItem(LOCAL_STORAGE_PERMISSIONS_KEY);
            localStorage.removeItem(LOCAL_STORAGE_JWT_KEY);
            localStorage.removeItem(LOCAL_STORAGE_CLOUD_URL_KEY);
            // Also clear in-memory state
            this.isLocked = true;
            this.vaultSalt = null;
            this.encryptedVaultData = null;
            this.identities = [];
            this.activeIdentity = null;
            this.decryptedSeedPhrase = null;
            if (this.masterHDKey) {
                // HDKey doesn't have an explicit wipe, rely on GC
                this.masterHDKey = null;
            }
            this.permissions = {};
            this.jwts = {};
            this.cloudUrl = null;
            console.log("MockVibeAgent: Cleared ALL agent state from localStorage and memory.");
        } catch (error) {
            console.error("MockVibeAgent: Error clearing state:", error);
        }
    }

    // --- Vault Creation (New Vibe Flow) ---

    /**
     * Creates a brand new vault with a new mnemonic and first identity.
     * Encrypts the vault with the provided password.
     * Should only be called if no vault exists (`hasVault()` is false).
     * @param password The password to encrypt the new vault.
     * @returns The generated 24-word mnemonic phrase (for user backup).
     */
    public async createNewVault(password: string): Promise<string> {
        if (this.hasVault()) {
            throw new Error("Cannot create new vault: Vault already exists.");
        }
        if (!password) {
            throw new Error("Password is required to create a new vault.");
        }

        console.log("MockVibeAgent: Creating new vault...");

        let encryptionKey: CryptoKey | null = null;
        let plaintextPhrase: string | null = null;
        let seed: Buffer | null = null;
        let tempMasterHDKey: HDKey | null = null;

        try {
            // 1. Generate Salt & Derive Key
            this.vaultSalt = generateSalt();
            encryptionKey = await deriveEncryptionKey(password, this.vaultSalt);
            console.log("MockVibeAgent: Salt generated and encryption key derived.");

            // 2. Generate Mnemonic & Seed
            plaintextPhrase = generateMnemonic(); // Generate 24 words by default
            seed = await seedFromMnemonic(plaintextPhrase);
            tempMasterHDKey = getMasterHDKeyFromSeed(seed);
            console.log("MockVibeAgent: Mnemonic, seed, and master HD key generated.");

            // 3. Derive First Identity (Index 0)
            const firstKeys = deriveChildKeyPair(tempMasterHDKey, 0);
            const firstDid = didFromEd25519(firstKeys.publicKey);
            console.log(`MockVibeAgent: First identity derived: ${firstDid}`);

            // 4. Encrypt Mnemonic
            const encryptedSeedPhraseData = await encryptData(plaintextPhrase, encryptionKey);
            console.log("MockVibeAgent: Mnemonic phrase encrypted.");

            // 5. Create Vault Structure
            this.encryptedVaultData = {
                encryptedSeedPhrase: encryptedSeedPhraseData,
                identities: [
                    {
                        did: firstDid,
                        derivationPath: firstKeys.derivationPath,
                        profile_name: null, // Initially null
                        profile_picture: null, // Initially null
                    },
                ],
                settings: {
                    nextAccountIndex: 1, // Next index to use is 1
                },
            };

            // 6. Save Vault to Storage
            this.saveVaultToStorage(); // Saves salt and encryptedVaultData

            // 7. Set In-Memory State (Unlock)
            this.isLocked = false;
            this.masterHDKey = tempMasterHDKey; // Keep master key in memory now that we're unlocked
            tempMasterHDKey = null; // Clear temp reference
            this.identities = [
                {
                    did: firstDid,
                    publicKey: firstKeys.publicKey,
                    privateKey: firstKeys.privateKey,
                    label: null,
                    pictureUrl: null,
                },
            ];
            this.activeIdentity = this.identities[0];

            // 8. Save Active DID Reference
            this.saveNonVaultStateToStorage(); // Saves active DID ref (and potentially empty permissions/JWTs)

            console.log("MockVibeAgent: New vault created, saved, and agent unlocked.");

            // 9. Return the plaintext phrase for backup
            const phraseToReturn = plaintextPhrase;
            plaintextPhrase = null; // Clear reference before returning
            return phraseToReturn;
        } catch (error) {
            console.error("MockVibeAgent: Failed to create new vault:", error);
            // Clean up potentially partially created state
            this.clearAllStorage(); // Clear everything on creation failure
            throw new Error(`Vault creation failed: ${error instanceof Error ? error.message : "Unknown error"}`);
        } finally {
            // Wipe sensitive data from memory
            if (plaintextPhrase) {
                plaintextPhrase = plaintextPhrase.replace(/./g, " "); // Simple wipe
                plaintextPhrase = null;
            }
            if (seed) wipeMemory(seed);
            if (tempMasterHDKey) tempMasterHDKey = null; // Rely on GC for HDKey object
            // Rely on GC for encryptionKey (CryptoKey)
            encryptionKey = null;
        }
    }

    // --- Unlock / Lock ---

    public async unlock(password: string): Promise<void> {
        if (!this.isLocked) {
            console.log("MockVibeAgent: Already unlocked.");
            return;
        }
        if (!this.vaultSalt || !this.encryptedVaultData) {
            throw new Error("Cannot unlock: Vault salt or data is missing.");
        }

        let encryptionKey: CryptoKey | null = null;
        let seed: Buffer | null = null;
        try {
            console.log("MockVibeAgent: Deriving key to unlock vault...");
            encryptionKey = await deriveEncryptionKey(password, this.vaultSalt);

            console.log("MockVibeAgent: Decrypting seed phrase...");
            this.decryptedSeedPhrase = await decryptData(this.encryptedVaultData.encryptedSeedPhrase, encryptionKey);

            console.log("MockVibeAgent: Deriving master HD key...");
            seed = await seedFromMnemonic(this.decryptedSeedPhrase);
            this.masterHDKey = getMasterHDKeyFromSeed(seed);

            console.log("MockVibeAgent: Deriving identity keys from vault data...");
            this.identities = this.encryptedVaultData.identities.map((idData) => {
                const derivedKeys = deriveChildKeyPair(this.masterHDKey!, parseInt(idData.derivationPath.split("/").pop()!, 10)); // Assuming index is last part
                if (didFromEd25519(derivedKeys.publicKey) !== idData.did) {
                    console.error(
                        `DID mismatch during unlock for path ${idData.derivationPath}! Expected ${idData.did}, got ${didFromEd25519(derivedKeys.publicKey)}`
                    );
                    throw new Error(`Identity data corruption detected for ${idData.did}`);
                }
                return {
                    did: idData.did,
                    publicKey: derivedKeys.publicKey,
                    privateKey: derivedKeys.privateKey, // Store the derived private key in memory
                    label: idData.profile_name, // Use stored profile name as label
                    pictureUrl: idData.profile_picture,
                };
            });

            // Restore active identity reference
            const storedActiveDid = localStorage.getItem(LOCAL_STORAGE_ACTIVE_DID_KEY);
            if (storedActiveDid) {
                this.activeIdentity = this.identities.find((id) => id.did === storedActiveDid) || null;
            }
            // Default to first identity if no active one was stored or found
            if (!this.activeIdentity && this.identities.length > 0) {
                this.activeIdentity = this.identities[0];
                // Save the defaulted active DID ref
                localStorage.setItem(LOCAL_STORAGE_ACTIVE_DID_KEY, this.activeIdentity.did);
            }

            this.isLocked = false;
            console.log(`MockVibeAgent: Vault unlocked. ${this.identities.length} identities loaded. Active: ${this.activeIdentity?.did || "None"}`);
        } catch (error) {
            console.error("MockVibeAgent: Unlock failed.", error);
            // Ensure sensitive data is cleared on failure
            this.lock(); // Call lock to clear potentially partially populated state
            throw new Error(`Unlock failed: ${error instanceof Error ? error.message : "Incorrect password or corrupted vault."}`);
        } finally {
            // Wipe intermediate sensitive data (seed, decrypted phrase, encryption key)
            if (seed) wipeMemory(seed);
            if (this.decryptedSeedPhrase) {
                // Simple wipe for string - replace with more robust method if needed
                this.decryptedSeedPhrase = this.decryptedSeedPhrase.replace(/./g, " ");
                this.decryptedSeedPhrase = null;
            }
            // CryptoKey cannot be wiped directly, rely on GC
            encryptionKey = null;
        }
    }

    public lock(): void {
        console.log("MockVibeAgent: Locking agent...");
        this.isLocked = true;
        this.identities = []; // Clear identities with keys
        this.activeIdentity = null; // Clear active identity reference
        // Wipe master key and decrypted phrase if they exist
        if (this.masterHDKey) {
            // HDKey has no wipe method, rely on GC
            this.masterHDKey = null;
        }
        if (this.decryptedSeedPhrase) {
            this.decryptedSeedPhrase = this.decryptedSeedPhrase.replace(/./g, " ");
            this.decryptedSeedPhrase = null;
        }
        console.log("MockVibeAgent: Agent locked.");
    }

    // Helper to ensure the agent is unlocked before performing sensitive operations
    private ensureUnlocked(): void {
        if (this.isLocked) {
            throw new Error("Agent is locked. Unlock required.");
        }
    }

    // --- Initialization & State ---

    async init(
        manifest: AppManifest
    ): Promise<{ account: Account | null; permissions: Record<string, PermissionSetting> | null; activeIdentity: Identity | null; identities: Identity[] }> {
        if (this.isInitialized || this.isInitializing) {
            console.warn(`MockVibeAgent already ${this.isInitializing ? "initializing" : "initialized"}. Returning current state.`);
            return this.getCurrentStateForSdk();
        }
        this.isInitializing = true;
        console.log("MockVibeAgent: Initializing with manifest:", manifest);
        this.manifest = manifest;
        this.currentOrigin = window.location.origin; // Ensure origin is set

        // --- Unlock Check ---
        // TODO: Implement unlock flow if needed at init
        if (this.isLocked) {
            console.warn("MockVibeAgent.init: Agent is locked. Need to unlock first.");
            // In a real scenario, this might trigger an unlock prompt.
            // For the mock, we might assume it's unlocked or require manual unlock via dev tools/context.
            // Let's proceed assuming unlock happens elsewhere for now, but add a check.
            // throw new Error("Agent is locked. Cannot initialize app.");
            // OR return a state indicating locked status?
            const publicIdentities =
                this.encryptedVaultData?.identities.map((idData) => ({
                    did: idData.did,
                    label: idData.profile_name,
                    pictureUrl: idData.profile_picture,
                })) || [];
            return { account: null, permissions: null, activeIdentity: null, identities: publicIdentities as Identity[] }; // Return public state if locked
        }
        // --- End Unlock Check ---

        try {
            // --- Step 1: Check for Active Identity ---
            if (!this.activeIdentity) {
                // If no identity is active (might happen on first load or after clearing storage),
                // we cannot proceed with app-specific init. The user needs to select/create one first.
                // The AgentProvider should handle showing the IdentityPanel.
                // We return a state indicating no active identity, but don't throw an error here,
                // as the VibeProvider might still want to show the app shell.
                console.warn("[MockVibeAgent.init] No active identity. Waiting for user selection.");
                // Return current state without account/permissions
                const state = await this.getCurrentStateForSdk(false); // Pass false to skip active identity check
                this.isInitialized = false; // Not fully initialized for the app yet
                this.isInitializing = false;
                return state;
                // OLD: throw new Error("No active identity selected. Cannot initialize application.");
            }
            const identity = this.activeIdentity; // Use the active identity

            // --- Step 2: Ensure Active Identity has JWT (Claim if needed) ---
            // This remains important for backend interactions
            if (!this.jwts[identity.did]) {
                console.log(`JWT missing for active identity ${identity.did}, attempting claim...`);
                try {
                    await this.performAdminClaim(identity);
                    // performAdminClaim now calls saveNonVaultStateToStorage
                } catch (claimError) {
                    console.error("Claim failed during init:", claimError);
                    // Proceeding without JWT might break data operations, but let init continue for now
                }
            }

            // --- Step 3: Determine Initialization Scenario based on Permissions ---
            const existingPermissions = this.permissions[identity.did]?.[this.currentOrigin] || {};
            const hasExistingPermissions = Object.keys(existingPermissions).length > 0;
            const requestedPermissions = new Set(manifest.permissions);
            const grantedPermissions = new Set(Object.keys(existingPermissions));
            const newPermissions = manifest.permissions.filter((p) => !grantedPermissions.has(p));
            // Removed permissions are those in grantedPermissions but not in requestedPermissions
            // const removedPermissions = Object.keys(existingPermissions).filter(p => !requestedPermissions.has(p));

            let scenario: "new" | "update" | "no_change" = "no_change";
            if (!hasExistingPermissions) {
                scenario = "new";
            } else if (newPermissions.length > 0) {
                scenario = "update";
            }

            console.log(`[MockVibeAgent.init] Scenario determined: ${scenario}`, { hasExistingPermissions, newPermissions });

            // --- Step 4: Execute Scenario Logic ---
            let finalPermissions = { ...existingPermissions }; // Start with existing

            if (scenario === "new") {
                // Scenario 1: New App - Show Init Prompt, then Consent Modal
                console.log("[MockVibeAgent.init] New application registration required.");
                if (!this.uiRequestInitPrompt || !this.uiRequestConsent) {
                    throw new Error("UI handlers for InitPrompt or Consent are not set.");
                }
                // 1. Show the initial prompt (Google One-Tap style)
                await this.uiRequestInitPrompt(manifest); // This promise resolves when the user clicks the prompt

                // 2. User clicked prompt, now show the full consent modal
                const consentRequest: ConsentRequest = {
                    manifest,
                    origin: this.currentOrigin,
                    requestedPermissions: manifest.permissions,
                    existingPermissions: {}, // None exist yet
                    newPermissions: manifest.permissions, // All are new
                };
                const granted = await this.triggerConsentUI(consentRequest); // Use the existing trigger method
                finalPermissions = granted; // Update permissions based on consent result
                await this.updatePermissionsForOrigin(finalPermissions); // Save granted permissions
                console.log("[MockVibeAgent.init] New app consent granted.");
            } else if (scenario === "update") {
                // Scenario 3: Existing App, New Permissions Requested - Show Consent Modal directly
                console.log("[MockVibeAgent.init] Application requires updated permissions:", newPermissions);
                if (!this.uiRequestConsent) {
                    throw new Error("UI handler for Consent is not set.");
                }
                const consentRequest: ConsentRequest = {
                    manifest,
                    origin: this.currentOrigin,
                    requestedPermissions: manifest.permissions, // Ask for the full current set
                    existingPermissions: existingPermissions,
                    newPermissions: newPermissions, // Highlight these
                };
                const granted = await this.triggerConsentUI(consentRequest);
                finalPermissions = granted; // Update permissions based on consent result
                await this.updatePermissionsForOrigin(finalPermissions); // Save updated permissions
                console.log("[MockVibeAgent.init] Updated app consent granted.");
            } else {
                // Scenario 2: Existing App, No Changes or Only Removals
                // Optional: Handle removed permissions (e.g., revoke them) - For now, we just accept the current manifest
                console.log("[MockVibeAgent.init] Application already registered with sufficient permissions.");
                // We might want to update the stored permissions to remove ones no longer in the manifest,
                // but for now, we'll just use the existing ones that cover the manifest's needs.
                // finalPermissions remains existingPermissions
            }

            // --- Step 5: Finalize Initialization ---
            this.isInitialized = true; // Mark as initialized *for this app*
            console.log("MockVibeAgent: Initialization complete for this app.");
            // Return the final state based on the outcome
            return this.getCurrentStateForSdk(); // Get state based on active identity and final permissions
        } catch (error) {
            console.error("MockVibeAgent: Initialization failed:", error);
            this.isInitialized = false;
            // Return state indicating failure (no account/permissions) but keep identities
            const state = await this.getCurrentStateForSdk(false); // Get state without requiring active identity
            return { ...state, account: null, permissions: null };
        } finally {
            this.isInitializing = false;
        }
    }

    // Helper to get state formatted for SDK init/update
    // Added optional flag to skip active identity check during early init stages or failures
    private async getCurrentStateForSdk(requireActiveIdentity = true): Promise<{
        account: Account | null;
        permissions: Record<string, PermissionSetting> | null;
        activeIdentity: Identity | null;
        identities: Identity[]; // Return full identities if unlocked, public info if locked
    }> {
        // If locked, return only the publicly available info (identities without keys)
        if (this.isLocked) {
            const publicIdentities =
                this.encryptedVaultData?.identities.map((idData) => ({
                    did: idData.did,
                    label: idData.profile_name, // Use profile name as label when locked
                    pictureUrl: idData.profile_picture,
                    // Keys are omitted
                })) || [];
            // Cast to Identity[] for compatibility, acknowledging keys are missing
            return { account: null, permissions: null, activeIdentity: null, identities: publicIdentities as Identity[] };
        }

        // If unlocked, proceed as before
        const identity = this.activeIdentity;
        if (requireActiveIdentity && !identity) {
            // This case should ideally be handled before calling this helper in final stages
            console.warn("getCurrentStateForSdk called requires active identity, but none found.");
            // Return public info even if unlocked but no active identity selected
            const publicIdentities = this.identities.map((id) => ({
                did: id.did,
                label: id.label,
                pictureUrl: id.pictureUrl,
            }));
            return { account: null, permissions: null, activeIdentity: null, identities: publicIdentities as Identity[] };
        }

        const account = identity ? { userDid: identity.did } : null;
        // Only return permissions if an identity is active
        const permissions = identity ? this.permissions[identity.did]?.[this.currentOrigin] || {} : null;

        // Return copies of identities to prevent external modification
        const identitiesCopy = this.identities.map((id) => ({ ...id }));

        return {
            account,
            permissions,
            activeIdentity: identity ? { ...identity } : null, // Return a copy
            identities: identitiesCopy,
        };
    }

    async getVibeState(): Promise<VibeState> {
        const state = await this.getCurrentStateForSdk(); // Uses the updated implementation above
        return {
            account: state.account ?? undefined,
            permissions: state.permissions ?? undefined,
            activeIdentity: state.activeIdentity ?? undefined, // Handle potential null
            identities: state.identities,
        };
    }

    // --- Identity Management ---

    // TODO: Refactor createIdentity to work with the encrypted vault
    async createIdentity(label: string, pictureUrl?: string): Promise<Identity> {
        this.ensureUnlocked(); // Must be unlocked to create identity
        // console.warn("MockVibeAgent.createIdentity needs refactoring for encrypted vault."); // Keep for now

        if (!this.masterHDKey || !this.encryptedVaultData) {
            throw new Error("Cannot create identity: Master key or vault data missing.");
        }

        const nextIndex = this.encryptedVaultData.settings.nextAccountIndex;
        console.log(`Deriving new identity key pair (index ${nextIndex})...`);
        const newKeys = deriveChildKeyPair(this.masterHDKey, nextIndex);
        const did = didFromEd25519(newKeys.publicKey);

        const newIdentity: Identity = {
            did,
            publicKey: newKeys.publicKey,
            privateKey: newKeys.privateKey,
            label: label || null, // Use provided label or null
            pictureUrl: pictureUrl || null,
        };

        // Add to in-memory list
        this.identities.push(newIdentity);

        // Update the encrypted vault data structure
        this.encryptedVaultData.identities.push({
            did: did,
            derivationPath: newKeys.derivationPath,
            profile_name: label || null,
            profile_picture: pictureUrl || null,
        });
        this.encryptedVaultData.settings.nextAccountIndex = nextIndex + 1;

        // Save the updated vault (which contains the new identity structure without keys)
        this.saveVaultToStorage();

        // If this is the first identity created after unlock, make it active
        if (!this.activeIdentity) {
            this.activeIdentity = newIdentity;
            this.saveNonVaultStateToStorage(); // Save active DID ref
        }

        console.log("New identity created and vault updated:", newIdentity.did);
        // TODO: Trigger state update to SDK/UI?
        return { ...newIdentity }; // Return a copy
    }

    async setActiveIdentity(did: string): Promise<void> {
        this.ensureUnlocked(); // Must be unlocked
        const identityToActivate = this.identities.find((id) => id.did === did);
        if (!identityToActivate) {
            throw new Error(`Identity with DID ${did} not found.`);
        }
        if (this.activeIdentity?.did === did) {
            console.log(`Identity ${did} is already active.`);
            return;
        }
        console.log(`Setting active identity to: ${did}`);
        this.activeIdentity = identityToActivate;
        this.saveNonVaultStateToStorage(); // Save active DID ref
        // TODO: Trigger state update to SDK/UI?
        // TODO: Ensure new active identity has JWT if needed? (Maybe in init/unlock)
    }

    async getIdentities(): Promise<Identity[]> {
        if (this.isLocked) {
            // Return only public info if locked
            const publicIdentities =
                this.encryptedVaultData?.identities.map((idData) => ({
                    did: idData.did,
                    label: idData.profile_name,
                    pictureUrl: idData.profile_picture,
                    // Keys omitted
                })) || [];
            return publicIdentities as Identity[]; // Cast needed as keys are missing
        }
        // Return full identity objects (copies) if unlocked
        return this.identities.map((id) => ({ ...id }));
    }

    async getActiveIdentity(): Promise<Identity | null> {
        if (this.isLocked) return null; // No active identity if locked
        return this.activeIdentity ? { ...this.activeIdentity } : null; // Return a copy
    }

    // --- Permission Management ---

    async getPermission(identityDid: string, origin: string, scope: string): Promise<PermissionSetting | null> {
        // Permissions can be checked even if locked? Yes, they are stored separately.
        return this.permissions[identityDid]?.[origin]?.[scope] || null;
    }

    async setPermission(identityDid: string, origin: string, scope: string, setting: PermissionSetting): Promise<void> {
        // Permissions can be set even if locked? Yes.
        if (!this.permissions[identityDid]) {
            this.permissions[identityDid] = {};
        }
        if (!this.permissions[identityDid][origin]) {
            this.permissions[identityDid][origin] = {};
        }
        console.log(`Setting permission for ${identityDid} / ${origin} / ${scope} -> ${setting}`);
        this.permissions[identityDid][origin][scope] = setting;
        this.saveNonVaultStateToStorage(); // Save permissions
        // TODO: Trigger state update?
    }

    // Helper to get all permissions for the current active identity and origin
    private async getCurrentPermissionsForOrigin(): Promise<Record<string, PermissionSetting>> {
        if (this.isLocked || !this.activeIdentity) return {}; // Need unlocked state for activeIdentity
        return this.permissions[this.activeIdentity.did]?.[this.currentOrigin] || {};
    }

    // Helper to update permissions for the current active identity and origin
    private async updatePermissionsForOrigin(newPermissions: Record<string, PermissionSetting>): Promise<void> {
        if (this.isLocked || !this.activeIdentity) return; // Need unlocked state for activeIdentity
        const did = this.activeIdentity.did;
        if (!this.permissions[did]) {
            this.permissions[did] = {};
        }
        this.permissions[did][this.currentOrigin] = {
            ...(this.permissions[did][this.currentOrigin] || {}),
            ...newPermissions,
        };
        this.saveNonVaultStateToStorage(); // Save permissions
        // TODO: Trigger state update?
    }

    async getAllPermissionsForIdentity(identityDid: string): Promise<Record<string, Record<string, PermissionSetting>>> {
        // Can be checked if locked
        return this.permissions[identityDid] || {};
    }

    async revokeOriginPermissions(identityDid: string, origin: string): Promise<void> {
        // Can be done if locked
        if (this.permissions[identityDid]?.[origin]) {
            console.log(`Revoking all permissions for ${identityDid} at origin ${origin}`);
            delete this.permissions[identityDid][origin];
            this.saveNonVaultStateToStorage(); // Save permissions
            // TODO: Trigger state update?
        }
    }

    // --- UI Interaction Hooks (Called by SDK/Internal Logic) ---
    // These now use the injected UI handlers

    // Public methods required by the VibeAgent interface
    async requestConsent(request: ConsentRequest): Promise<Record<string, PermissionSetting>> {
        // This is now primarily called directly by AgentProvider for Scenario 3,
        // or indirectly via triggerConsentUI for Scenario 1.
        return this.triggerConsentUI(request);
    }

    async requestActionConfirmation(request: ActionRequest): Promise<ActionResponse> {
        return this.triggerActionConfirmationUI(request);
    }

    // Internal trigger methods that use the injected handlers
    private async triggerConsentUI(request: ConsentRequest): Promise<Record<string, PermissionSetting>> {
        console.log("[MockVibeAgent] Triggering Consent UI via callback", request);
        if (!this.uiRequestConsent) {
            console.error("[MockVibeAgent] uiRequestConsent handler not set!");
            // Fallback: Simulate denial or throw error? Throwing is safer.
            throw new Error("Consent UI handler not available.");
        }
        try {
            const result = await this.uiRequestConsent(request);
            console.log("[MockVibeAgent] Consent UI result:", result);
            return result;
        } catch (error) {
            console.error("[MockVibeAgent] Consent UI request failed:", error);
            throw error; // Re-throw denial or other errors
        }
    }

    // Added trigger for the new Init Prompt (Scenario 1)
    private async triggerInitPromptUI(manifest: AppManifest): Promise<void> {
        console.log("[MockVibeAgent] Triggering Init Prompt UI via callback", manifest);
        if (!this.uiRequestInitPrompt) {
            console.error("[MockVibeAgent] uiRequestInitPrompt handler not set!");
            throw new Error("Init Prompt UI handler not available.");
        }
        try {
            // This promise resolves when the user clicks the prompt, allowing init to proceed to consent.
            await this.uiRequestInitPrompt(manifest);
            console.log("[MockVibeAgent] Init Prompt UI interaction complete (user clicked).");
        } catch (error) {
            console.error("[MockVibeAgent] Init Prompt UI request failed:", error);
            throw error; // Re-throw error if the prompt itself fails/is dismissed incorrectly
        }
    }

    private async triggerActionConfirmationUI(request: ActionRequest): Promise<ActionResponse> {
        console.log("[MockVibeAgent] Triggering Action Confirmation UI via callback", request);
        if (!this.uiRequestActionConfirmation) {
            console.error("[MockVibeAgent] uiRequestActionConfirmation handler not set!");
            throw new Error("Action Confirmation UI handler not available.");
        }
        // No try/catch needed here as the promise resolves with ActionResponse (allowed: false) on denial
        const result = await this.uiRequestActionConfirmation(request);
        console.log("[MockVibeAgent] Action Confirmation UI result:", result);
        return result;
    }

    // --- Simulation Helpers REMOVED ---
    // We no longer simulate consent; we trigger the actual UI flow.
    // private simulateConsent(...) { ... }

    // --- Authentication/Claim ---

    // Updated to accept identity
    private async performAdminClaim(identity: Identity): Promise<void> {
        this.ensureUnlocked(); // Need unlocked identity
        if (!identity || !identity.privateKey) {
            // Check for private key specifically
            throw new Error("Cannot perform claim without a valid, unlocked identity.");
        }

        const messageBytes = new TextEncoder().encode(ADMIN_CLAIM_CODE);
        const signatureBytes = signEd25519(messageBytes, identity.privateKey);
        const signatureBase64 = Buffer.from(signatureBytes).toString("base64");

        const url = `${this.cloudUrl || VIBE_CLOUD_BASE_URL}/api/v1/admin/claim`; // Use configured cloud URL
        console.log(`Attempting claim to ${url} with DID ${identity.did}`);

        try {
            const response = await fetch(url, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    did: identity.did,
                    claimCode: ADMIN_CLAIM_CODE,
                    signature: signatureBase64,
                }),
            });

            const responseBody = await response.json();

            if (!response.ok) {
                console.error("Admin claim failed:", response.status, responseBody);
                throw new Error(`Admin claim failed: ${responseBody?.error || response.statusText}`);
            }

            if (!responseBody.token) {
                console.error("Admin claim response missing token:", responseBody);
                throw new Error("Admin claim successful, but token was not returned.");
            }

            this.jwts[identity.did] = responseBody.token; // Store JWT against DID
            this.saveNonVaultStateToStorage(); // Save JWTs
            console.log(`Admin claim successful for ${identity.did}, JWT obtained.`);
        } catch (error) {
            console.error("Error during admin claim fetch:", error);
            throw error; // Re-throw network or parsing errors
        }
    }

    // Placeholder for claim flow using code
    async claimIdentityWithCode(identityDid: string, claimCode: string): Promise<{ jwt: string }> {
        console.warn("claimIdentityWithCode not fully implemented in mock agent.");
        this.ensureUnlocked();
        const identity = this.identities.find((id) => id.did === identityDid);
        if (!identity) throw new Error("Identity not found for claim.");

        // Simulate admin claim logic for now
        await this.performAdminClaim(identity); // Reuses admin claim logic

        const jwt = this.jwts[identityDid];
        if (!jwt) throw new Error("Claim simulation failed to produce JWT.");
        return { jwt };
    }

    // --- Core Data Methods (Need Permission Checks) ---

    private ensureInitialized(): void {
        // Updated check: Ensure agent is unlocked and has active identity/manifest
        this.ensureUnlocked();
        if (!this.isInitialized || !this.manifest || !this.activeIdentity) {
            throw new Error("MockVibeAgent not initialized or missing active identity/manifest. Call init() first.");
        }
    }

    // --- API Interaction Helper (Updated for Active Identity JWT) ---
    private async fetchApi<T>(endpoint: string, method: "GET" | "POST" | "PUT" | "DELETE" = "POST", body?: any, skipEnsureInitialized?: boolean): Promise<T> {
        if (!skipEnsureInitialized) {
            this.ensureInitialized(); // Ensures agent is unlocked, initialized, and has active identity/manifest
        }

        const activeJwt = this.activeIdentity ? this.jwts[this.activeIdentity.did] : null;
        if (!activeJwt && !skipEnsureInitialized) {
            // Allow skipping JWT check during init/claim itself
            throw new Error(`No JWT found for active identity: ${this.activeIdentity?.did}`);
        }

        const baseUrl = this.cloudUrl || VIBE_CLOUD_BASE_URL; // Use configured URL or default
        const url = `${baseUrl}${endpoint}`;
        console.log(`Fetching API: ${method} ${url}`, body ? { body } : {});

        const headers: HeadersInit = {
            "Content-Type": "application/json",
        };
        // Manifest might not be set if skipEnsureInitialized is true (e.g., during claim)
        if (this.manifest?.appId) {
            headers["X-Vibe-App-ID"] = this.manifest.appId;
        }
        if (activeJwt) {
            headers["Authorization"] = `Bearer ${activeJwt}`;
        }

        try {
            const response = await fetch(url, {
                method: method,
                headers: headers,
                body: body ? JSON.stringify(body) : undefined,
            });

            if (response.status === 204) {
                console.log(`API Response ${response.status} (No Content) for ${method} ${url}`);
                return null as T;
            }

            const responseBody = await response.json();

            if (!response.ok) {
                console.error(`API Error ${response.status}: ${method} ${url}`, responseBody);
                const errorMessage = responseBody?.error?.details || responseBody?.error || responseBody?.message || `HTTP error ${response.status}`;
                throw new Error(`API request failed: ${errorMessage}`);
            }

            console.log(`API Response ${response.status}: ${method} ${url}`, responseBody);
            return responseBody as T;
        } catch (error) {
            console.error(`Network or parsing error during API fetch: ${method} ${url}`, error);
            if (error instanceof Error) {
                throw new Error(`Network request failed: ${error.message}`);
            } else {
                throw new Error("An unknown network error occurred.");
            }
        }
    }

    // --- Data Methods (Integrating Permission Checks) ---

    async readOnce<T>(params: ReadParams): Promise<ReadResult<T>> {
        this.ensureInitialized(); // Basic check: agent unlocked, initialized, has active identity & manifest
        const { collection, filter } = params;
        const scope = `read:${collection}`;
        const identity = this.activeIdentity!; // Safe due to ensureInitialized
        const origin = this.currentOrigin;

        console.log(`[MockVibeAgent] readOnce requested for ${scope}`);

        let permission = await this.getPermission(identity.did, origin, scope);

        if (permission === "never") {
            console.log(`[MockVibeAgent] Permission denied for ${scope}`);
            throw new Error(`Permission denied to ${scope}`);
        }

        if (permission === "ask") {
            console.log(`[MockVibeAgent] Permission 'ask' for ${scope}. Requesting confirmation...`);
            const actionRequest: ActionRequest = {
                actionType: "read",
                origin: origin,
                collection: collection,
                filter: filter,
                identity: identity, // Pass the full unlocked identity for display
                appInfo: { name: this.manifest?.name ?? "App", pictureUrl: this.manifest?.pictureUrl },
            };
            const confirmation = await this.triggerActionConfirmationUI(actionRequest);

            if (!confirmation.allowed) {
                console.log(`[MockVibeAgent] User denied action confirmation for ${scope}`);
                if (confirmation.rememberChoice) {
                    await this.setPermission(identity.did, origin, scope, "never");
                }
                throw new Error(`User denied permission for ${scope}`);
            }

            if (confirmation.rememberChoice) {
                await this.setPermission(identity.did, origin, scope, "always");
                permission = "always"; // Update effective permission for this call
            }
            // If allowed (and maybe remembered), proceed...
        }

        // If permission is 'always' or was granted via 'ask'
        console.log(`[MockVibeAgent] Permission granted for ${scope}. Calling fetchApi...`);
        const apiPayload = { collection, filter: filter || {} };
        try {
            const result = await this.fetchApi<{ docs: T[] }>("/api/v1/data/read", "POST", apiPayload);
            return { ok: true, data: result.docs };
        } catch (error) {
            console.error(`readOnce fetchApi failed for ${scope}:`, error);
            // Don't return error in data field, use error property
            return { ok: false, error: error instanceof Error ? error.message : String(error), data: [] };
        }
    }

    async read<T>(params: ReadParams, callback: SubscriptionCallback<T>): Promise<Unsubscribe> {
        this.ensureInitialized();
        const { collection, filter } = params;
        const scope = `read:${collection}`;
        const identity = this.activeIdentity!;
        const origin = this.currentOrigin;

        console.log(`[MockVibeAgent] read (subscription) requested for ${scope}`);

        // --- Permission Check (Similar to readOnce) ---
        let permission = await this.getPermission(identity.did, origin, scope);
        if (permission === "never") {
            console.log(`[MockVibeAgent] Permission denied for subscription ${scope}`);
            throw new Error(`Permission denied for subscription ${scope}`);
        }
        if (permission === "ask") {
            console.log(`[MockVibeAgent] Permission 'ask' for subscription ${scope}. Requesting confirmation...`);
            const actionRequest: ActionRequest = {
                actionType: "read", // Treat subscription start as a 'read' action for prompt
                origin: origin,
                collection: collection,
                filter: filter,
                identity: identity,
                appInfo: { name: this.manifest?.name ?? "App", pictureUrl: this.manifest?.pictureUrl },
            };
            const confirmation = await this.triggerActionConfirmationUI(actionRequest);
            if (!confirmation.allowed) {
                console.log(`[MockVibeAgent] User denied subscription confirmation for ${scope}`);
                if (confirmation.rememberChoice) {
                    await this.setPermission(identity.did, origin, scope, "never");
                }
                throw new Error(`User denied permission for subscription ${scope}`);
            }
            if (confirmation.rememberChoice) {
                await this.setPermission(identity.did, origin, scope, "always");
                permission = "always";
            }
        }
        // --- End Permission Check ---

        console.log(`[MockVibeAgent] Permission granted for subscription ${scope}. Setting up...`);
        // TODO: WebSocket logic needs updating for multi-identity JWTs if used
        // For now, bypass WebSocket and return a mock subscription

        // --- Mock Subscription (No WebSocket) ---
        console.warn("[MockVibeAgent] read subscription using mock implementation (no WebSocket).");
        // Simulate initial fetch
        this.readOnce<T>(params)
            .then((result) => {
                if (result.ok) callback(null, result.data);
                else callback(new Error(result.error || "Initial fetch failed"), null);
            })
            .catch((err) => callback(err, null));
        // Mock unsubscribe
        const unsubscribe = async () => {
            console.log(`[MockVibeAgent] Mock Unsubscribe called for ${collection}`);
        };
        return unsubscribe;
        // --- End Mock Subscription ---

        // --- Original WebSocket logic (needs review/update if re-enabled) ---
        /*
        try {
            await this.ensureWebSocketConnection(); // Needs JWT update potentially
        } catch (error) {
            console.error(`Failed to establish WebSocket connection for ${collection}:`, error);
            callback(error instanceof Error ? error : new Error("WebSocket connection failed"), null);
            return async () => {};
        }
        */
        /*
        try {
            await this.ensureWebSocketConnection(); // Needs JWT update potentially
        } catch (error) {
            console.error(`Failed to establish WebSocket connection for ${collection}:`, error);
            callback(error instanceof Error ? error : new Error("WebSocket connection failed"), null);
            return async () => {};
        }

        // Perform initial readOnce via HTTP (already done above for permission check, could optimize)
        console.log(`Performing initial readOnce for subscription '${collection}'...`);
        try {
            const initialResult = await this.readOnce<T>(params); // Call the permission-checked version
            if (initialResult.ok) {
                callback(null, initialResult.data); // Send initial data
            } else {
                console.error(`Initial readOnce failed for ${collection}: ${initialResult.error}`);
                callback(new Error(initialResult.error || "Initial read failed"), null);
                // Don't proceed with WS subscription if initial read fails? Or allow?
                // For now, let's stop here if initial read fails after permission grant.
                 return async () => {}; // Return no-op unsubscribe
            }
        } catch (error) {
             console.error(`Error during initial readOnce for ${collection}:`, error);
             callback(error instanceof Error ? error : new Error("Unknown error during initial fetch"), null);
             return async () => {}; // Return no-op unsubscribe
        }


        // Register subscription and send WS message
        if (this.webSocket && this.webSocket.readyState === WebSocket.OPEN) {
            console.log(`WebSocket open, sending subscribe message for ${collection}`);
            this.subscriptions.set(collection, callback);
            this.sendWebSocketMessage({ action: "subscribe", collection });
        } else {
            console.log(`WebSocket not open yet, adding ${collection} to pending subscriptions`);
            this.pendingSubscriptions.set(collection, callback);
        }

        console.log(`MockVibeAgent: Subscription request processed for '${collection}'.`);

        // Return unsubscribe function
        const unsubscribe = async () => {
            console.log(`Unsubscribing from collection '${collection}'...`);
            this.subscriptions.delete(collection);
            this.pendingSubscriptions.delete(collection); // Remove if it was pending
            this.sendWebSocketMessage({ action: "unsubscribe", collection });
        };
        return unsubscribe;
        */
        // --- End Original WebSocket logic ---
    }

    async unsubscribe(unsubscribeFn: Unsubscribe): Promise<void> {
        console.log("MockVibeAgent: Calling unsubscribe function.");
        await unsubscribeFn();
    }

    async write<T extends { _id?: string }>(params: WriteParams<T>): Promise<WriteResult> {
        this.ensureInitialized();
        const { collection, data } = params;
        const scope = `write:${collection}`;
        const identity = this.activeIdentity!;
        const origin = this.currentOrigin;

        console.log(`[MockVibeAgent] write requested for ${scope}`);

        // --- Permission Check ---
        let permission = await this.getPermission(identity.did, origin, scope);
        if (permission === "never") {
            console.log(`[MockVibeAgent] Permission denied for ${scope}`);
            throw new Error(`Permission denied to ${scope}`);
        }
        if (permission === "ask") {
            console.log(`[MockVibeAgent] Permission 'ask' for ${scope}. Requesting confirmation...`);
            const actionRequest: ActionRequest = {
                actionType: "write",
                origin: origin,
                collection: collection,
                data: data, // Include data for preview
                identity: identity,
                appInfo: { name: this.manifest?.name ?? "App", pictureUrl: this.manifest?.pictureUrl },
            };
            const confirmation = await this.triggerActionConfirmationUI(actionRequest);
            if (!confirmation.allowed) {
                console.log(`[MockVibeAgent] User denied action confirmation for ${scope}`);
                if (confirmation.rememberChoice) {
                    await this.setPermission(identity.did, origin, scope, "never");
                }
                throw new Error(`User denied permission for ${scope}`);
            }
            if (confirmation.rememberChoice) {
                await this.setPermission(identity.did, origin, scope, "always");
                permission = "always";
            }
        }
        // --- End Permission Check ---

        console.log(`[MockVibeAgent] Permission granted for ${scope}. Calling fetchApi...`);
        const apiPayload = { collection, data };
        try {
            const result = await this.fetchApi<any>("/api/v1/data/write", "POST", apiPayload);
            // Adapt response (same as before)
            if (Array.isArray(result)) {
                const ids = result.filter((r) => r.ok).map((r) => r.id);
                const errors = result.filter((r) => !r.ok);
                return { ok: errors.length === 0, ids, errors: errors.length > 0 ? errors : undefined };
            } else if (result && result.ok && result.id) {
                return { ok: true, ids: [result.id] };
            } else if (result && !result.ok) {
                return { ok: false, ids: [], errors: [result] };
            } else {
                console.error("Unexpected write API response format:", result);
                return { ok: false, ids: [], errors: [{ error: "unknown", reason: "Unexpected API response format" }] };
            }
        } catch (error) {
            console.error(`write fetchApi failed for ${scope}:`, error);
            return { ok: false, ids: [], errors: [{ error: "network_or_parse", reason: error instanceof Error ? error.message : String(error) }] };
        }
    }
}

// --- Agent React Context & Provider ---

// Define the shape of the Agent's context value (for Agent UI components like IdentityPanel)
interface AgentContextValue {
    // Agent State (exposed to Agent UI)
    identities: Identity[]; // Will contain full Identity if unlocked, PublicIdentityInfo if locked
    activeIdentity: Identity | null; // Will be null if locked
    isLocked: boolean; // Expose lock state

    // Agent Actions (called by Agent UI)
    createIdentity: (label: string, pictureUrl?: string) => Promise<Identity | null>;
    setActiveIdentity: (did: string) => Promise<void>;
    unlock: (password: string) => Promise<void>; // Expose unlock
    lock: () => void; // Expose lock
    // TODO: Add methods for managing permissions if needed in UI (e.g., openPermissionManager)

    // UI Prompt State (Internal to AgentProvider, but needed for modals)
    isConsentOpen: boolean;
    consentRequest: ConsentRequest | null;
    isActionPromptOpen: boolean;
    actionRequest: ActionRequest | null;
    isInitPromptOpen: boolean; // Added
    initPromptManifest: AppManifest | null; // Added
    isUnlockModalOpen: boolean; // Added state for unlock modal
}

const AgentContext = createContext<AgentContextValue | undefined>(undefined);

interface AgentProviderProps {
    children: ReactNode;
    agentInstance: MockVibeAgent; // Add prop to accept pre-created agent
}

export function AgentProvider({ children, agentInstance }: AgentProviderProps) {
    // Destructure agentInstance
    // --- Agent Instance ---
    // Use the provided agent instance instead of creating a new one
    const agent = agentInstance; // No useMemo needed here

    // --- Agent State (Managed by this Provider) ---
    const [identities, setIdentities] = useState<Identity[]>([]); // Holds full or public info based on lock state
    const [activeIdentity, _setActiveIdentityState] = useState<Identity | null>(null); // Renamed state setter
    const [isLocked, setIsLocked] = useState<boolean>(true); // Track lock state in provider

    // --- UI Prompt State ---
    const [isConsentOpen, setIsConsentOpen] = useState(false);
    const [consentRequest, setConsentRequest] = useState<ConsentRequest | null>(null);
    const [consentResolver, setConsentResolver] = useState<((result: Record<string, PermissionSetting> | null) => void) | null>(null);

    const [isActionPromptOpen, setIsActionPromptOpen] = useState(false);
    const [actionRequest, setActionRequest] = useState<ActionRequest | null>(null);
    const [actionResolver, setActionResolver] = useState<((result: ActionResponse) => void) | null>(null);

    const [isInitPromptOpen, setIsInitPromptOpen] = useState(false); // Added
    const [initPromptManifest, setInitPromptManifest] = useState<AppManifest | null>(null);
    const [initPromptResolver, setInitPromptResolver] = useState<(() => void) | null>(null);

    const [isUnlockModalOpen, setIsUnlockModalOpen] = useState<boolean>(false); // State for unlock modal

    // --- Helper to refresh provider state from agent ---
    const refreshAgentState = useCallback(
        async (checkLockStatus = true) => {
            // Avoid unnecessary checks if we know the lock status hasn't changed
            const currentLockStatus = agent.isLocked; // Access internal state directly (or add getter)
            if (checkLockStatus) {
                setIsLocked(currentLockStatus);
            }

            try {
                // Get identities (public or full based on lock state)
                const currentIdentities = await agent.getIdentities();
                setIdentities(currentIdentities);
                // Get active identity (will be null if locked)
                const currentActiveIdentity = await agent.getActiveIdentity();
                _setActiveIdentityState(currentActiveIdentity);

                console.log("[AgentProvider] Refreshed state from agent:", { isLocked: currentLockStatus });

                // Automatically open unlock modal if agent is locked and vault exists
                if (checkLockStatus && currentLockStatus && agent.hasVault()) {
                    // Add hasVault() method to agent
                    console.log("[AgentProvider] Agent is locked and vault exists, opening unlock modal.");
                    setIsUnlockModalOpen(true);
                }
            } catch (error) {
                console.error("[AgentProvider] Error refreshing agent state:", error);
                // Handle error, maybe reset state?
                setIdentities([]);
                _setActiveIdentityState(null);
                setIsLocked(true);
            }
        },
        [agent]
    ); // Dependency on agent instance

    // --- Effect to Load Initial Agent State & Check Lock ---
    useEffect(() => {
        refreshAgentState(true); // Load initial state and check lock status
    }, [refreshAgentState]); // Run only once

    // --- UI Interaction Logic ---
    // These are passed to the agent instance via setUIHandlers
    const requestConsent = useCallback((request: ConsentRequest): Promise<Record<string, PermissionSetting>> => {
        return new Promise((resolve, reject) => {
            console.log("[AgentProvider] requestConsent called by agent instance", request);
            setConsentRequest(request);
            setIsConsentOpen(true);
            setConsentResolver(() => (result: Record<string, PermissionSetting> | null) => {
                setIsConsentOpen(false);
                setConsentRequest(null);
                setConsentResolver(null);
                if (result) {
                    console.log("[AgentProvider] Consent granted by user", result);
                    resolve(result);
                } else {
                    console.log("[AgentProvider] Consent denied by user");
                    reject(new Error("User denied consent request."));
                }
            });
        });
    }, []); // Empty dependency array: these functions don't depend on component state directly

    const handleConsentDecision = (grantedPermissions: Record<string, PermissionSetting> | null) => {
        if (consentResolver) {
            consentResolver(grantedPermissions);
        }
    };

    const requestActionConfirmation = useCallback((request: ActionRequest): Promise<ActionResponse> => {
        return new Promise((resolve) => {
            console.log("[AgentProvider] requestActionConfirmation called by agent instance", request);
            setActionRequest(request);
            setIsActionPromptOpen(true);
            setActionResolver(() => (result: ActionResponse) => {
                setIsActionPromptOpen(false);
                setActionRequest(null);
                setActionResolver(null);
                console.log("[AgentProvider] Action confirmation decision by user", result);
                resolve(result);
            });
        });
    }, []); // Empty dependency array

    const handleActionDecision = (response: ActionResponse) => {
        if (actionResolver) {
            actionResolver(response);
        }
    };

    // Added: Handler for the Init Prompt (Scenario 1)
    const requestInitPrompt = useCallback((manifest: AppManifest): Promise<void> => {
        return new Promise((resolve) => {
            console.log("[AgentProvider] requestInitPrompt called by agent instance", manifest);
            setInitPromptManifest(manifest);
            setIsInitPromptOpen(true);
            // This resolver is called when the user *clicks* the prompt, allowing init to proceed to consent
            setInitPromptResolver(() => () => {
                setIsInitPromptOpen(false); // Hide prompt after click
                setInitPromptManifest(null);
                setInitPromptResolver(null);
                console.log("[AgentProvider] Init prompt clicked by user");
                resolve(); // Resolve the promise to signal the agent to continue
            });
            // Note: No reject case needed here unless the prompt itself can fail/be dismissed
        });
    }, []); // Empty dependency array

    // Added: Handler for when the InitPrompt component is clicked by the user
    const handleInitPromptClick = () => {
        if (initPromptResolver) {
            initPromptResolver(); // This resolves the promise in requestInitPrompt
        }
    };

    // --- Effect to Connect UI Handlers and Define window.vibe ---
    useEffect(() => {
        console.log("[AgentProvider] Setting UI handlers and defining window.vibe");

        // 1. Connect UI Handlers
        agent.setUIHandlers({ requestConsent, requestActionConfirmation, requestInitPrompt }); // Added requestInitPrompt

        // 2. Define window.vibe SDK Interface
        // This simulates the agent injecting the SDK into the page
        const sdkInterface = {
            init: (manifest: AppManifest, onStateChange: (state: VibeState) => void): Promise<Unsubscribe> => {
                console.log("[window.vibe] init called", manifest);
                // Wrap the agent.init call in a new promise to control when onStateChange is called
                return new Promise(async (resolve, reject) => {
                    try {
                        // Agent's init now handles the scenarios and UI prompts internally.
                        // It returns the *final* state after any necessary consent.
                        const finalState = await agent.init(manifest);
                        console.log("[window.vibe] Agent init successful, final state:", finalState);

                        // Check if initialization was actually successful (e.g., user didn't deny consent)
                        // We determine success by checking if an activeIdentity and account exist in the final state.
                        // If the user denied consent or there's no active identity, init technically "failed" from the app's perspective.
                        if (finalState.activeIdentity && finalState.account) {
                            // Adapt nulls to undefined for VibeState compatibility before calling onStateChange
                            onStateChange({
                                account: finalState.account ?? undefined,
                                permissions: finalState.permissions ?? undefined,
                                activeIdentity: finalState.activeIdentity ?? undefined,
                                identities: finalState.identities,
                            }); // Send final state ONLY on success

                            // TODO: Implement proper state change subscription in MockVibeAgent
                            console.warn("[window.vibe] Mock SDK does not currently push state updates after init.");

                            // Return a mock unsubscribe function
                            const unsubscribe = () => {
                                console.log("[window.vibe] unsubscribe called (mock)");
                                // In a real scenario, this would tell the agent to clean up resources for this app.
                            };
                            resolve(unsubscribe); // Resolve the main promise with the unsubscribe function
                        } else {
                            // Initialization didn't fully complete (e.g., no active identity, consent denied)
                            // Send a state update indicating no active session, but don't throw an error here,
                            // let the VibeProvider handle the lack of activeIdentity/account.
                            console.warn("[window.vibe] Agent init completed but no active session established (no active identity or consent denied).");
                            onStateChange({
                                identities: finalState.identities,
                                activeIdentity: undefined,
                                account: undefined,
                                permissions: undefined,
                            });
                            // Still resolve the promise, but maybe with a different signal or just no-op unsubscribe?
                            // Resolving allows the VibeProvider to know the init attempt finished.
                            const unsubscribe = () => {
                                console.log("[window.vibe] unsubscribe called (mock, init incomplete)");
                            };
                            resolve(unsubscribe);
                            // Or reject? Rejecting might be better to signal failure clearly to VibeProvider.
                            // Let's try rejecting.
                            // reject(new Error("Initialization failed: No active identity or consent denied."));
                        }
                    } catch (error) {
                        console.error("[window.vibe] Agent init threw an error:", error);
                        // Notify VibeProvider of the error state
                        const currentIdentities = await agent.getIdentities(); // Get current identities even on error
                        onStateChange({
                            identities: currentIdentities,
                            activeIdentity: undefined,
                            account: undefined,
                            permissions: undefined,
                        });
                        reject(error); // Reject the main promise
                    }
                });
            },
            readOnce: async (collection: string, filter?: any): Promise<ReadResult> => {
                console.log(`[window.vibe] readOnce called: ${collection}`, filter);
                return agent.readOnce({ collection, filter });
            },
            read: async (collection: string, filter?: any, callback?: (result: ReadResult) => void): Promise<Unsubscribe> => {
                console.log(`[window.vibe] read called: ${collection}`, filter);
                // Agent's read now expects the callback format (error | null, data | null)
                const agentCallback = (error: Error | null, data: any | null) => {
                    if (callback) {
                        const result: ReadResult = { ok: !error, data: data || [], error: error?.message };
                        callback(result);
                    }
                };
                return agent.read({ collection, filter }, agentCallback);
            },
            write: async (collection: string, data: any | any[]): Promise<WriteResult> => {
                console.log(`[window.vibe] write called: ${collection}`, data);
                return agent.write({ collection, data });
            },
            // --- Expose Agent methods needed by VibeProvider (SHOULD NOT BE NEEDED after refactor) ---
            // getVibeState: async (): Promise<VibeState> => {
            //     console.log("[window.vibe] getVibeState called (should be internal to agent)");
            //     return agent.getVibeState();
            // }
        };

        // Assign to window
        (window as any).vibe = sdkInterface;

        // Cleanup function: Remove window.vibe when provider unmounts
        return () => {
            console.log("[AgentProvider] Cleaning up: Removing window.vibe");
            delete (window as any).vibe;
            // Optional: Tell agent to clean up? Depends on agent's design.
        };
        // Dependencies: agent instance and the stable callback functions
    }, [agent, requestConsent, requestActionConfirmation, requestInitPrompt]); // Added requestInitPrompt dependency

    // --- Agent Actions (Called by UI Components like IdentityPanel) ---
    const createIdentity = useCallback(
        async (label: string, pictureUrl?: string): Promise<Identity | null> => {
            console.log("[AgentProvider] createIdentity called", { label, pictureUrl });
            try {
                const newIdentity = await agent.createIdentity(label, pictureUrl);
                await refreshAgentState(); // Refresh state after creation
                console.log("[AgentProvider] Identity created, state updated", { newIdentity });
                return newIdentity;
            } catch (error) {
                console.error("[AgentProvider] Error creating identity:", error);
                // TODO: Show error to user?
                return null;
            }
        },
        [agent, refreshAgentState] // Depends on agent and refresh helper
    );

    const setActiveIdentity = useCallback(
        async (did: string): Promise<void> => {
            console.log("[AgentProvider] setActiveIdentity called", { did });
            try {
                await agent.setActiveIdentity(did);
                await refreshAgentState(); // Refresh state after switching
                console.log("[AgentProvider] Active identity switched, state updated");
                // TODO: Should ideally trigger a state update via window.vibe.onStateChange
                // For now, VibeProvider might need to manually re-init or re-fetch on identity change.
            } catch (error) {
                console.error("[AgentProvider] Error setting active identity:", error);
                // TODO: Show error to user?
            }
        },
        [agent, refreshAgentState] // Depends on agent and refresh helper
    );

    // --- Unlock/Lock Actions ---
    const unlock = useCallback(
        async (password: string) => {
            try {
                await agent.unlock(password);
                setIsUnlockModalOpen(false); // Close modal on success
                await refreshAgentState(false); // Update provider state after unlock (don't re-check lock status)
            } catch (error) {
                console.error("[AgentProvider] Unlock failed:", error);
                // TODO: Show error message in UI (e.g., via a toast or state variable in UnlockModal)
                throw error; // Re-throw for potential UI handling in UnlockModal
            }
        },
        [agent, refreshAgentState]
    );

    const lock = useCallback(() => {
        agent.lock();
        refreshAgentState(false); // Update provider state after lock (don't re-check lock status)
    }, [agent, refreshAgentState]);

    // --- Context Value for Agent UI ---
    const contextValue: AgentContextValue = {
        identities,
        activeIdentity,
        isLocked, // Expose lock state
        createIdentity,
        setActiveIdentity,
        unlock, // Expose unlock action
        lock, // Expose lock action
        // Pass through modal state needed for rendering
        isConsentOpen,
        consentRequest,
        isActionPromptOpen,
        actionRequest,
        isInitPromptOpen, // Added
        initPromptManifest, // Added
        isUnlockModalOpen, // Added
    };

    return (
        <AgentContext.Provider value={contextValue}>
            {children}
            {/* Render Modals controlled by this context */}
            <UnlockModal isOpen={isUnlockModalOpen} onUnlock={unlock} />
            <InitPrompt isOpen={isInitPromptOpen} manifest={initPromptManifest} onClick={handleInitPromptClick} />
            <ConsentModal isOpen={isConsentOpen} request={consentRequest} onDecision={handleConsentDecision} />
            <ActionPromptModal isOpen={isActionPromptOpen} request={actionRequest} onDecision={handleActionDecision} />
        </AgentContext.Provider>
    );
}

// Renamed hook for Agent UI components
export function useAgent() {
    const context = useContext(AgentContext);
    if (context === undefined) {
        throw new Error("useAgent must be used within an AgentProvider");
    }
    return context;
}
