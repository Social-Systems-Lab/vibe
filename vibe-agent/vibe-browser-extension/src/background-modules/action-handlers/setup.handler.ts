import { Buffer } from "buffer";
import * as Constants from "../constants";
import * as Types from "../types";
import * as SessionManager from "../session-manager";
import * as TokenManager from "../token-manager";
import {
    generateMnemonic,
    generateSalt,
    deriveEncryptionKey,
    encryptData,
    decryptData,
    seedFromMnemonic,
    getMasterHDKeyFromSeed,
    deriveChildKeyPair,
    wipeMemory,
    validateMnemonic,
    signMessage,
} from "../../lib/crypto";
import { didFromEd25519 } from "../../lib/identity";
import { broadcastAppStateToSubscriptions } from "../app-state-broadcaster";
import * as PouchDBManager from "../../lib/pouchdb";

export async function handleSetupCreateVault(payload: any): Promise<any> {
    await SessionManager.lockVaultState();
    const { password } = payload;
    if (!password || typeof password !== "string") {
        throw new Types.HandledError({ error: { message: "Password is required for SETUP_CREATE_VAULT.", code: "PASSWORD_REQUIRED" } });
    }
    const mnemonic = generateMnemonic();
    const salt = generateSalt();
    const saltHex = Buffer.from(salt).toString("hex");
    let encryptionKey: CryptoKey | null = null;
    let seed: Buffer | null = null;
    try {
        encryptionKey = await deriveEncryptionKey(password, salt);
        const encryptedMnemonicData = await encryptData(mnemonic, encryptionKey);
        seed = await seedFromMnemonic(mnemonic); // Keep seed in memory briefly for session init
        const vaultData = {
            encryptedSeedPhrase: encryptedMnemonicData,
            identities: [],
            settings: { nextIdentityIndex: 0, activeIdentityIndex: -1 },
        };
        await chrome.storage.local.set({
            [Constants.STORAGE_KEY_VAULT_SALT]: saltHex,
            [Constants.STORAGE_KEY_VAULT]: vaultData,
            [Constants.STORAGE_KEY_SETUP_COMPLETE]: true, // Mark setup as complete here
        });
        SessionManager.setInMemoryDecryptedSeed(mnemonic); // Unlock session with new seed
        await chrome.storage.session.set({
            [Constants.SESSION_STORAGE_ACTIVE_IDENTITY_INDEX]: -1, // No active identity yet
        });
        SessionManager.setCurrentActiveDid(null); // Explicitly set no active DID
        console.log("SETUP_CREATE_VAULT: Vault created, pre-unlocked (seed in memory), no identities yet.");
        return { mnemonic };
    } catch (error) {
        // Ensure vault remains locked on error
        await SessionManager.lockVaultState();
        throw new Types.HandledError({
            error: { message: `Vault creation failed: ${error instanceof Error ? error.message : String(error)}`, code: "VAULT_CREATION_FAILED" },
        });
    } finally {
        if (seed) wipeMemory(seed); // Clear seed from memory after use
    }
}

export async function handleSetupImportVault(payload: any): Promise<any> {
    const { importedMnemonic, password } = payload;
    if (!importedMnemonic || !password) {
        throw new Types.HandledError({ error: { message: "Mnemonic and password required.", code: "MISSING_PARAMS" } });
    }
    if (!validateMnemonic(importedMnemonic)) {
        throw new Types.HandledError({ error: { message: "Invalid mnemonic provided.", code: "INVALID_MNEMONIC" } });
    }

    await SessionManager.lockVaultState(); // Ensure clean state
    const salt = generateSalt();
    const saltHex = Buffer.from(salt).toString("hex");
    let encryptionKey: CryptoKey | null = null;
    let seed: Buffer | null = null;

    try {
        encryptionKey = await deriveEncryptionKey(password, salt);
        const encryptedMnemonicData = await encryptData(importedMnemonic, encryptionKey);
        seed = await seedFromMnemonic(importedMnemonic);
        const masterHDKey = getMasterHDKeyFromSeed(seed);
        const firstIdentityKeys = deriveChildKeyPair(masterHDKey, 0);
        const firstDid = didFromEd25519(firstIdentityKeys.publicKey);

        const vaultData = {
            encryptedSeedPhrase: encryptedMnemonicData,
            identities: [
                {
                    did: firstDid,
                    derivationPath: firstIdentityKeys.derivationPath,
                    profile_name: "Imported Identity", // Default name
                    profile_picture: null,
                    cloudUrl: null,
                },
            ],
            settings: { nextIdentityIndex: 1, activeIdentityIndex: 0 }, // First identity is active
        };

        await chrome.storage.local.set({
            [Constants.STORAGE_KEY_VAULT_SALT]: saltHex,
            [Constants.STORAGE_KEY_VAULT]: vaultData,
            // [Constants.STORAGE_KEY_SETUP_COMPLETE]: true, // Setup is not fully complete until finalized
        });
        // Don't unlock here, user needs to go through finalize step.
        // The UI will typically ask for password again to unlock and finalize.
        return {
            success: true,
            did: firstDid, // Provide DID for UI to proceed with finalization
            message: "Vault imported. Proceed to finalize.",
        };
    } catch (error) {
        await SessionManager.lockVaultState();
        throw new Types.HandledError({
            error: { message: `Vault import failed: ${error instanceof Error ? error.message : String(error)}`, code: "VAULT_IMPORT_FAILED" },
        });
    } finally {
        if (seed) wipeMemory(seed);
    }
}

export async function handleSetupImportSeedAndRecoverIdentities(payload: any): Promise<any> {
    const { importedMnemonic, password } = payload;
    if (!importedMnemonic || !validateMnemonic(importedMnemonic)) {
        throw new Types.HandledError({ error: { message: "Valid mnemonic required.", code: "INVALID_MNEMONIC" } });
    }
    if (!password) {
        throw new Types.HandledError({ error: { message: "Password required.", code: "PASSWORD_REQUIRED" } });
    }

    await SessionManager.lockVaultState();
    const salt = generateSalt();
    const saltHex = Buffer.from(salt).toString("hex");
    const encryptionKey = await deriveEncryptionKey(password, salt);
    const encryptedMnemonicData = await encryptData(importedMnemonic, encryptionKey);

    // Store basic vault structure first
    await chrome.storage.local.set({
        [Constants.STORAGE_KEY_VAULT_SALT]: saltHex,
        [Constants.STORAGE_KEY_VAULT]: {
            encryptedSeedPhrase: encryptedMnemonicData,
            identities: [],
            settings: { nextIdentityIndex: 0, activeIdentityIndex: -1 },
        },
    });

    let masterSeedBuffer: Buffer | null = null;
    try {
        masterSeedBuffer = await seedFromMnemonic(importedMnemonic);
        const masterHDKey = getMasterHDKeyFromSeed(masterSeedBuffer);
        const recoveredIdentities: Types.AgentIdentity[] = [];
        let consecutiveInactiveCount = 0;
        let currentIndex = 0;
        let nextIdentityIndexToStore = 0;

        while (consecutiveInactiveCount < Constants.GAP_LIMIT) {
            const keyPair = deriveChildKeyPair(masterHDKey, currentIndex);
            const currentDid = didFromEd25519(keyPair.publicKey);
            const statusUrl = `${Constants.OFFICIAL_VIBE_CLOUD_URL}/api/v1/identities/${currentDid}/status`;
            let isActive = false;
            let instanceStatus;
            let serverProfileName;
            let serverProfilePicture;
            let serverCloudUrl;
            let serverIsAdmin;

            try {
                const statusResponse = await fetch(statusUrl);
                if (statusResponse.ok) {
                    const data = await statusResponse.json();
                    isActive = data.isActive || false;
                    instanceStatus = data.instanceStatus;
                    // If active, try to get more details
                    if (isActive) {
                        const identityDetailsUrl = `${Constants.OFFICIAL_VIBE_CLOUD_URL}/api/v1/identities/${currentDid}`;
                        const detailsResponse = await fetch(identityDetailsUrl); // No auth needed for public read
                        if (detailsResponse.ok) {
                            const details = await detailsResponse.json();
                            serverProfileName = details.profile_name;
                            serverProfilePicture = details.profile_picture;
                            serverCloudUrl = details.instanceUrl;
                            serverIsAdmin = details.isAdmin;
                        }
                    }
                } else if (statusResponse.status !== 404) {
                    console.warn(`Status check for ${currentDid} failed: ${statusResponse.status}`);
                }
            } catch (fetchError) {
                console.warn(`Error fetching status for ${currentDid}:`, fetchError);
            }

            if (isActive) {
                recoveredIdentities.push({
                    identityDid: currentDid,
                    derivationPath: keyPair.derivationPath,
                    profile_name: serverProfileName || `Recovered Identity ${currentIndex + 1}`,
                    profile_picture: serverProfilePicture,
                    cloudUrl: serverCloudUrl || Constants.OFFICIAL_VIBE_CLOUD_URL, // Assume official if active
                    instanceStatus: instanceStatus,
                    isAdmin: serverIsAdmin || false,
                });
                consecutiveInactiveCount = 0;
                try {
                    // Proactive login to fetch and store tokens
                    const nonce = crypto.randomUUID().toString();
                    const timestamp = new Date().toISOString();
                    const messageToSign = `${currentDid}|${nonce}|${timestamp}`;
                    const signature = await signMessage(keyPair.privateKey, messageToSign);
                    const loginResponse = await fetch(`${Constants.OFFICIAL_VIBE_CLOUD_URL}/api/v1/auth/login`, {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ did: currentDid, nonce, timestamp, signature }),
                    });
                    if (loginResponse.ok) {
                        const result = await loginResponse.json();
                        const tokenDetails = result.tokenDetails as Types.TokenDetails;
                        if (tokenDetails) await TokenManager.storeCpTokens(currentDid, tokenDetails);
                    } else {
                        console.warn(`Proactive login failed for ${currentDid}: ${loginResponse.status}`);
                    }
                } catch (loginError: any) {
                    console.error(`Error during proactive login for ${currentDid}:`, loginError.message);
                }
                nextIdentityIndexToStore = currentIndex + 1;
            } else {
                consecutiveInactiveCount++;
            }
            currentIndex++;
        }

        const finalVaultData = {
            encryptedSeedPhrase: encryptedMnemonicData,
            identities: recoveredIdentities,
            settings: { nextIdentityIndex: nextIdentityIndexToStore, activeIdentityIndex: recoveredIdentities.length > 0 ? 0 : -1 },
        };
        await chrome.storage.local.set({ [Constants.STORAGE_KEY_VAULT]: finalVaultData, [Constants.STORAGE_KEY_SETUP_COMPLETE]: true });

        if (recoveredIdentities.length > 0) {
            SessionManager.setInMemoryDecryptedSeed(importedMnemonic);
            await chrome.storage.session.set({ [Constants.SESSION_STORAGE_ACTIVE_IDENTITY_INDEX]: 0 });
            await SessionManager.loadActiveIdentity(); // This will set currentActiveDid
            if (SessionManager.currentActiveDid) {
                await chrome.storage.local.set({ [Constants.STORAGE_KEY_LAST_ACTIVE_DID]: SessionManager.currentActiveDid });
                // Attempt to initialize sync for the newly active recovered identity
                const activeIdentity = recoveredIdentities.find((id) => id.identityDid === SessionManager.currentActiveDid);
                if (activeIdentity && (activeIdentity.cloudUrl || activeIdentity.instanceUrl)) {
                    // 'password' is the password used to import/recover the seed
                    PouchDBManager.initializeSync(SessionManager.currentActiveDid, password).catch((err) =>
                        console.error(`Error initializing PouchDB sync for recovered DID ${SessionManager.currentActiveDid}:`, err)
                    );
                }
            }
            await broadcastAppStateToSubscriptions();
            return {
                success: true,
                message: `Recovered ${recoveredIdentities.length} identities.`,
                recoveredCount: recoveredIdentities.length,
                primaryDid: recoveredIdentities[0].identityDid, // Use identityDid from AgentIdentity
            };
        } else {
            return { success: true, message: "No active identities found to recover.", recoveredCount: 0 };
        }
    } catch (error) {
        await SessionManager.lockVaultState();
        throw new Types.HandledError({
            error: { message: `Identity recovery failed: ${error instanceof Error ? error.message : String(error)}`, code: "RECOVERY_FAILED" },
        });
    } finally {
        if (masterSeedBuffer) wipeMemory(masterSeedBuffer);
    }
}

export async function handleSetupCompleteAndFinalize(payload: any): Promise<any> {
    const { identityName, identityPicture, cloudUrl, claimCode, password, mnemonic } = payload;

    if (!password || !mnemonic) {
        throw new Types.HandledError({ error: { message: "Password and mnemonic required.", code: "MISSING_PARAMS" } });
    }
    // This function assumes a vault was just created (SETUP_CREATE_VAULT) or imported (SETUP_IMPORT_VAULT)
    // and the first identity (index 0) is the one being finalized.

    const vaultResult = await chrome.storage.local.get(Constants.STORAGE_KEY_VAULT);
    let vaultData = vaultResult[Constants.STORAGE_KEY_VAULT];

    if (!vaultData || !vaultData.encryptedSeedPhrase) {
        // Check for encryptedSeedPhrase as a sign of initialized vault
        throw new Types.HandledError({ error: { message: "Vault not properly initialized or seed phrase missing.", code: "VAULT_NOT_INITIALIZED" } });
    }

    // Ensure seed is in memory for signing, by re-deriving if necessary (e.g. after import)
    // Or if it's a fresh setup, it should already be there from SETUP_CREATE_VAULT
    if (!SessionManager.getInMemoryDecryptedSeed()) {
        if (
            mnemonic !==
            (await decryptData(
                vaultData.encryptedSeedPhrase,
                await deriveEncryptionKey(
                    password,
                    await (async () => {
                        // Await the result of the IIFE
                        // Make IIFE async
                        const saltHex = (await chrome.storage.local.get(Constants.STORAGE_KEY_VAULT_SALT))[Constants.STORAGE_KEY_VAULT_SALT];
                        const saltBuffer = Buffer.from(saltHex, "hex");
                        return new Uint8Array(saltBuffer.buffer, saltBuffer.byteOffset, saltBuffer.byteLength);
                    })()
                )
            ))
        ) {
            throw new Types.HandledError({
                error: {
                    message: "Provided mnemonic does not match stored encrypted seed or decryption failed.",
                    code: "MNEMONIC_MISMATCH_OR_DECRYPTION_FAILURE",
                },
            });
        }
        SessionManager.setInMemoryDecryptedSeed(mnemonic);
    }

    let identityDidToFinalize: string;
    let identityIndexToFinalize = 0; // Default to 0 for new/imported vault

    if (!vaultData.identities || vaultData.identities.length === 0) {
        // This case is for SETUP_CREATE_VAULT path where identity is created now
        let seedForDerivation: Buffer | null = null;
        try {
            seedForDerivation = await seedFromMnemonic(mnemonic);
            const masterHDKey = getMasterHDKeyFromSeed(seedForDerivation);
            const keyPair = deriveChildKeyPair(masterHDKey, 0); // First identity
            identityDidToFinalize = didFromEd25519(keyPair.publicKey);
            vaultData.identities = [
                {
                    identityDid: identityDidToFinalize,
                    derivationPath: keyPair.derivationPath,
                    profile_name: identityName || `Identity 1`,
                    profile_picture: identityPicture || null,
                    cloudUrl: null,
                    isAdmin: false, // Default
                },
            ];
            vaultData.settings.nextIdentityIndex = 1;
            vaultData.settings.activeIdentityIndex = 0;
        } finally {
            if (seedForDerivation) wipeMemory(seedForDerivation);
        }
    } else {
        // This case is for SETUP_IMPORT_VAULT path where identity at index 0 exists
        identityDidToFinalize = vaultData.identities[0].identityDid;
        identityIndexToFinalize = 0;
    }

    const identityEntry = vaultData.identities[identityIndexToFinalize];

    if (cloudUrl === Constants.OFFICIAL_VIBE_CLOUD_URL) {
        let seedForSigning: Buffer | null = null;
        try {
            const currentMnemonic = SessionManager.getInMemoryDecryptedSeed();
            if (!currentMnemonic) throw new Error("Mnemonic not in session for signing.");
            seedForSigning = await seedFromMnemonic(currentMnemonic);
            const masterKey = getMasterHDKeyFromSeed(seedForSigning);
            // Use derivation path from vault if available, otherwise assume index
            const derivationPathIndex = parseInt(identityEntry.derivationPath?.split("/").pop() || identityIndexToFinalize.toString());
            const keyPair = deriveChildKeyPair(masterKey, derivationPathIndex);

            if (didFromEd25519(keyPair.publicKey) !== identityDidToFinalize) {
                throw new Error("Derived DID does not match identity DID to finalize.");
            }

            const nonce = crypto.randomUUID().toString();
            const timestamp = new Date().toISOString();
            const messageToSign = `${identityDidToFinalize}|${nonce}|${timestamp}|${claimCode || ""}`;
            const signature = await signMessage(keyPair.privateKey, messageToSign);

            const registerPayload: any = { did: identityDidToFinalize, nonce, timestamp, signature };
            if (identityName) registerPayload.profileName = identityName;
            if (identityPicture) registerPayload.profilePictureUrl = identityPicture;
            if (claimCode) registerPayload.claimCode = claimCode;

            const registerResponse = await fetch(`${Constants.OFFICIAL_VIBE_CLOUD_URL}/api/v1/auth/register`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(registerPayload),
            });

            if (!registerResponse.ok) {
                const errBody = await registerResponse.json().catch(() => ({ error: "Unknown registration error" }));
                throw new Error(`Registration failed: ${errBody.error || registerResponse.statusText}`);
            }
            const result = await registerResponse.json();
            const serverIdentity = result.identity as Types.AgentIdentity;
            const tokenDetails = result.tokenDetails as Types.TokenDetails;

            await TokenManager.storeCpTokens(identityDidToFinalize, tokenDetails);
            identityEntry.profile_name = serverIdentity.profile_name || identityName;
            identityEntry.profile_picture = serverIdentity.profile_picture || identityPicture;
            identityEntry.cloudUrl = serverIdentity.instanceUrl || cloudUrl;
            identityEntry.instanceId = serverIdentity.instanceId;
            identityEntry.instanceStatus = serverIdentity.instanceStatus;
            identityEntry.isAdmin = serverIdentity.isAdmin ?? false;
        } finally {
            if (seedForSigning) wipeMemory(seedForSigning);
        }
    } else if (cloudUrl) {
        // Self-hosted or other cloud
        identityEntry.profile_name = identityName;
        identityEntry.profile_picture = identityPicture;
        identityEntry.cloudUrl = cloudUrl;
    } else {
        // No cloud URL provided, just local profile update
        identityEntry.profile_name = identityName;
        identityEntry.profile_picture = identityPicture;
    }

    vaultData.settings.activeIdentityIndex = identityIndexToFinalize; // Ensure it's set
    await chrome.storage.local.set({
        [Constants.STORAGE_KEY_VAULT]: vaultData,
        [Constants.STORAGE_KEY_SETUP_COMPLETE]: true,
    });

    // Ensure session is active with this identity
    await chrome.storage.session.set({ [Constants.SESSION_STORAGE_ACTIVE_IDENTITY_INDEX]: identityIndexToFinalize });
    await SessionManager.loadActiveIdentity(); // This will set currentActiveDid
    if (SessionManager.currentActiveDid) {
        await chrome.storage.local.set({ [Constants.STORAGE_KEY_LAST_ACTIVE_DID]: SessionManager.currentActiveDid });
        // If cloudUrl is set (meaning Vibe Cloud is configured), attempt to initialize sync
        const currentIdentity = vaultData.identities[identityIndexToFinalize];
        if (currentIdentity && (currentIdentity.cloudUrl || currentIdentity.instanceUrl) && SessionManager.currentActiveDid) {
            // The 'password' variable holds the user's main vault password used for this setup flow
            PouchDBManager.initializeSync(SessionManager.currentActiveDid, password).catch((err) =>
                console.error(`Error initializing PouchDB sync for ${SessionManager.currentActiveDid} after setup completion:`, err)
            );
        }
    }

    await broadcastAppStateToSubscriptions();
    return {
        success: true,
        message: "Setup finalized.",
        did: identityDidToFinalize,
        identityName: identityEntry.profile_name,
    };
}

export async function handleFinalizeNewIdentitySetup(payload: any): Promise<any> {
    const { didToFinalize, identityIndex, identityName, identityPicture, cloudUrl, claimCode, password } = payload;

    if (!didToFinalize || typeof identityIndex !== "number" || !password) {
        throw new Types.HandledError({ error: { message: "Required fields missing for finalization.", code: "MISSING_PARAMS" } });
    }

    if (!SessionManager.isUnlocked) {
        // Attempt to unlock if password is provided
        const localData = await chrome.storage.local.get([Constants.STORAGE_KEY_VAULT, Constants.STORAGE_KEY_VAULT_SALT]);
        const vaultDataForUnlock = localData[Constants.STORAGE_KEY_VAULT];
        const saltHex = localData[Constants.STORAGE_KEY_VAULT_SALT];
        if (!vaultDataForUnlock || !saltHex) {
            throw new Types.HandledError({ error: { message: "Vault/salt not found for unlock attempt.", code: "VAULT_NOT_FOUND" } });
        }
        const saltBuffer = Buffer.from(saltHex, "hex");
        try {
            const encryptionKey = await deriveEncryptionKey(password, new Uint8Array(saltBuffer.buffer, saltBuffer.byteOffset, saltBuffer.byteLength));
            const decryptedSeedAttempt = await decryptData(vaultDataForUnlock.encryptedSeedPhrase, encryptionKey);
            if (!decryptedSeedAttempt) throw new Error("Decryption failed.");
            SessionManager.setInMemoryDecryptedSeed(decryptedSeedAttempt);
            // No need to call loadActiveIdentity yet, just need the seed.
        } catch (unlockError) {
            throw new Types.HandledError({
                error: { message: `Unlock failed: ${unlockError instanceof Error ? unlockError.message : String(unlockError)}`, code: "UNLOCK_FAILED" },
            });
        }
    }

    const decryptedSeed = SessionManager.getInMemoryDecryptedSeed();
    if (!decryptedSeed) {
        throw new Types.HandledError({
            error: { message: "Vault locked or in-memory seed missing after unlock attempt.", code: "VAULT_LOCKED_SEED_UNAVAILABLE" },
        });
    }

    const vaultResult = await chrome.storage.local.get(Constants.STORAGE_KEY_VAULT);
    let vaultData = vaultResult[Constants.STORAGE_KEY_VAULT];
    if (!vaultData || !vaultData.identities) {
        throw new Types.HandledError({ error: { message: "Vault data missing or invalid.", code: "VAULT_DATA_INVALID" } });
    }

    const identityEntryIndex = vaultData.identities.findIndex((idObj: any) => idObj.identityDid === didToFinalize); // Match AgentIdentity structure
    if (identityEntryIndex === -1) {
        throw new Types.HandledError({ error: { message: `Identity ${didToFinalize} not found in vault.`, code: "IDENTITY_NOT_FOUND" } });
    }

    const identityEntry = vaultData.identities[identityEntryIndex];

    if (cloudUrl === Constants.OFFICIAL_VIBE_CLOUD_URL) {
        let seedForSigning: Buffer | null = null;
        try {
            seedForSigning = await seedFromMnemonic(decryptedSeed);
            const masterKey = getMasterHDKeyFromSeed(seedForSigning);
            const keyPair = deriveChildKeyPair(masterKey, identityIndex); // Use provided identityIndex for derivation

            if (didFromEd25519(keyPair.publicKey) !== didToFinalize) {
                throw new Error("DID mismatch: Derived DID does not match didToFinalize.");
            }

            const nonce = crypto.randomUUID().toString();
            const timestamp = new Date().toISOString();
            const messageToSign = `${didToFinalize}|${nonce}|${timestamp}|${claimCode || ""}`;
            const signature = await signMessage(keyPair.privateKey, messageToSign);

            const registerPayload: any = { did: didToFinalize, nonce, timestamp, signature };
            if (identityName) registerPayload.profileName = identityName;
            if (identityPicture) registerPayload.profilePictureUrl = identityPicture;
            if (claimCode) registerPayload.claimCode = claimCode;

            const registerResponse = await fetch(`${Constants.OFFICIAL_VIBE_CLOUD_URL}/api/v1/auth/register`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(registerPayload),
            });

            if (!registerResponse.ok) {
                const errBody = await registerResponse.json().catch(() => ({ error: "Registration error" }));
                throw new Error(`Registration failed: ${errBody.error || registerResponse.statusText}`);
            }
            const result = await registerResponse.json();
            const serverIdentity = result.identity as Types.AgentIdentity;
            const tokenDetails = result.tokenDetails as Types.TokenDetails;

            await TokenManager.storeCpTokens(didToFinalize, tokenDetails);
            identityEntry.profile_name = serverIdentity.profile_name || identityName;
            identityEntry.profile_picture = serverIdentity.profile_picture || identityPicture;
            identityEntry.cloudUrl = serverIdentity.instanceUrl || cloudUrl; // Prefer server's URL
            identityEntry.instanceId = serverIdentity.instanceId;
            identityEntry.instanceStatus = serverIdentity.instanceStatus;
            identityEntry.isAdmin = serverIdentity.isAdmin ?? false;
        } finally {
            if (seedForSigning) wipeMemory(seedForSigning);
        }
    } else if (cloudUrl) {
        // Self-hosted or other cloud
        identityEntry.profile_name = identityName;
        identityEntry.profile_picture = identityPicture;
        identityEntry.cloudUrl = cloudUrl;
    } else {
        // No cloud URL, just local profile update
        identityEntry.profile_name = identityName || identityEntry.profile_name; // Keep existing if not provided
        identityEntry.profile_picture = identityPicture || identityEntry.profile_picture; // Keep existing if not provided
    }

    vaultData.settings.activeIdentityIndex = identityEntryIndex; // Set this newly finalized identity as active
    await chrome.storage.local.set({ [Constants.STORAGE_KEY_VAULT]: vaultData });
    await chrome.storage.session.set({ [Constants.SESSION_STORAGE_ACTIVE_IDENTITY_INDEX]: identityEntryIndex });
    await SessionManager.loadActiveIdentity(); // Load it into session
    if (SessionManager.currentActiveDid) {
        await chrome.storage.local.set({ [Constants.STORAGE_KEY_LAST_ACTIVE_DID]: SessionManager.currentActiveDid });
        // If cloudUrl is set, attempt to initialize sync
        const currentIdentity = vaultData.identities[identityEntryIndex];
        if (currentIdentity && (currentIdentity.cloudUrl || currentIdentity.instanceUrl) && SessionManager.currentActiveDid) {
            // The 'password' variable holds the user's main vault password used for this setup flow
            PouchDBManager.initializeSync(SessionManager.currentActiveDid, password).catch((err) =>
                console.error(`Error initializing PouchDB sync for ${SessionManager.currentActiveDid} after finalizing new identity setup:`, err)
            );
        }
    }
    await chrome.storage.local.set({ [Constants.STORAGE_KEY_SETUP_COMPLETE]: true }); // Ensure setup is marked complete

    await broadcastAppStateToSubscriptions();
    return {
        success: true,
        message: `Identity ${didToFinalize} finalized and set as active.`,
        did: didToFinalize,
        identityName: identityEntry.profile_name,
        newActiveDid: SessionManager.currentActiveDid,
    };
}

// SETUP_NEW_IDENTITY_AND_FINALIZE is a more complex flow that combines creation and finalization.
// It's often called when user is adding a subsequent identity, not the very first one.
export async function handleSetupNewIdentityAndFinalize(payload: any): Promise<any> {
    const { identityIndexToUse, identityName, identityPicture, cloudUrl, claimCode, password } = payload;

    // identityIndexToUse is crucial here, it should be the next available index.
    // Password is required to access the seed for deriving new keys.

    if (typeof identityIndexToUse !== "number") {
        throw new Types.HandledError({ error: { message: "Account index is required.", code: "MISSING_ACCOUNT_INDEX" } });
    }

    let decryptedSeed = SessionManager.getInMemoryDecryptedSeed();

    if (!SessionManager.isUnlocked || !decryptedSeed) {
        if (!password) {
            throw new Types.HandledError({
                error: { message: "Vault is locked. Password is required to create and finalize a new identity.", code: "VAULT_LOCKED_PASSWORD_REQUIRED" },
            });
        }
        console.log("SETUP_NEW_IDENTITY_AND_FINALIZE: Vault locked or seed missing, attempting unlock with provided password.");
        const localData = await chrome.storage.local.get([Constants.STORAGE_KEY_VAULT, Constants.STORAGE_KEY_VAULT_SALT]);
        const vaultDataForUnlock = localData[Constants.STORAGE_KEY_VAULT];
        const saltHex = localData[Constants.STORAGE_KEY_VAULT_SALT];

        if (!vaultDataForUnlock || !saltHex) {
            throw new Types.HandledError({ error: { message: "Vault or salt not found for unlock attempt.", code: "VAULT_NOT_FOUND" } });
        }
        const saltBuffer = Buffer.from(saltHex, "hex");
        try {
            const encryptionKey = await deriveEncryptionKey(password, new Uint8Array(saltBuffer.buffer, saltBuffer.byteOffset, saltBuffer.byteLength));
            const decryptedSeedAttempt = await decryptData(vaultDataForUnlock.encryptedSeedPhrase, encryptionKey);
            if (!decryptedSeedAttempt) {
                throw new Error("Decryption failed with the provided password.");
            }
            SessionManager.setInMemoryDecryptedSeed(decryptedSeedAttempt);
            decryptedSeed = decryptedSeedAttempt;
            // No need to call loadActiveIdentity yet, just need the seed.
        } catch (unlockError) {
            throw new Types.HandledError({
                error: { message: `Unlock failed: ${unlockError instanceof Error ? unlockError.message : String(unlockError)}`, code: "UNLOCK_FAILED" },
            });
        }
        console.log("SETUP_NEW_IDENTITY_AND_FINALIZE: Vault unlocked successfully with provided password.");
    }

    if (!decryptedSeed) {
        // Double check after potential unlock
        throw new Types.HandledError({ error: { message: "Seed is still unavailable after unlock attempt.", code: "SEED_UNAVAILABLE_POST_UNLOCK" } });
    }

    const vaultResult = await chrome.storage.local.get(Constants.STORAGE_KEY_VAULT);
    let vaultData = vaultResult[Constants.STORAGE_KEY_VAULT];
    if (!vaultData || !vaultData.settings || typeof vaultData.settings.nextIdentityIndex !== "number") {
        throw new Types.HandledError({ error: { message: "Vault data/settings invalid.", code: "VAULT_SETTINGS_INVALID" } });
    }

    // Ensure identityIndexToUse matches the expected nextIdentityIndex
    if (identityIndexToUse !== vaultData.settings.nextIdentityIndex) {
        console.warn(
            `Provided identityIndexToUse (${identityIndexToUse}) does not match vault's nextIdentityIndex (${vaultData.settings.nextIdentityIndex}). Using vault's index.`
        );
    }
    const newAccountIndex = vaultData.settings.nextIdentityIndex; // Always use the authoritative next index

    let seedBuffer: Buffer | null = null;
    try {
        seedBuffer = await seedFromMnemonic(decryptedSeed);
        const masterHDKey = getMasterHDKeyFromSeed(seedBuffer);
        const newKeyPair = deriveChildKeyPair(masterHDKey, newAccountIndex);
        const newIdentityDid = didFromEd25519(newKeyPair.publicKey);

        const newIdentityEntry: Types.AgentIdentity = {
            identityDid: newIdentityDid,
            derivationPath: newKeyPair.derivationPath,
            profile_name: identityName || `Identity ${newAccountIndex + 1}`,
            profile_picture: identityPicture || undefined, // Ensure undefined if null
            cloudUrl: undefined, // Will be set if cloud registration happens
            isAdmin: false, // Default
        };

        // Add to vault identities first
        vaultData.identities.push(newIdentityEntry);
        const newIdentityEntryIndexInVault = vaultData.identities.length - 1;

        if (cloudUrl === Constants.OFFICIAL_VIBE_CLOUD_URL) {
            const nonce = crypto.randomUUID().toString();
            const timestamp = new Date().toISOString();
            const messageToSign = `${newIdentityDid}|${nonce}|${timestamp}|${claimCode || ""}`;
            const signature = await signMessage(newKeyPair.privateKey, messageToSign);

            const registerPayload: any = { did: newIdentityDid, nonce, timestamp, signature };
            if (identityName) registerPayload.profileName = identityName;
            if (identityPicture) registerPayload.profilePictureUrl = identityPicture;
            if (claimCode) registerPayload.claimCode = claimCode;

            const registerResponse = await fetch(`${Constants.OFFICIAL_VIBE_CLOUD_URL}/api/v1/auth/register`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(registerPayload),
            });

            if (!registerResponse.ok) {
                const errBody = await registerResponse.json().catch(() => ({ error: "Registration error" }));
                // Don't remove identity from vault yet, allow local creation even if cloud fails
                throw new Error(`Cloud registration failed: ${errBody.error || registerResponse.statusText}. Identity created locally.`);
            }
            const result = await registerResponse.json();
            const serverIdentity = result.identity as Types.AgentIdentity;
            const tokenDetails = result.tokenDetails as Types.TokenDetails;

            await TokenManager.storeCpTokens(newIdentityDid, tokenDetails);
            // Update the entry in vaultData.identities
            vaultData.identities[newIdentityEntryIndexInVault].profile_name = serverIdentity.profile_name || newIdentityEntry.profile_name;
            vaultData.identities[newIdentityEntryIndexInVault].profile_picture = serverIdentity.profile_picture || newIdentityEntry.profile_picture;
            vaultData.identities[newIdentityEntryIndexInVault].cloudUrl = serverIdentity.instanceUrl;
            vaultData.identities[newIdentityEntryIndexInVault].instanceId = serverIdentity.instanceId;
            vaultData.identities[newIdentityEntryIndexInVault].instanceStatus = serverIdentity.instanceStatus;
            vaultData.identities[newIdentityEntryIndexInVault].isAdmin = serverIdentity.isAdmin ?? false;
        } else if (cloudUrl) {
            // Self-hosted or other
            vaultData.identities[newIdentityEntryIndexInVault].cloudUrl = cloudUrl;
        }

        vaultData.settings.nextIdentityIndex = newAccountIndex + 1;
        vaultData.settings.activeIdentityIndex = newIdentityEntryIndexInVault; // Make new identity active

        await chrome.storage.local.set({ [Constants.STORAGE_KEY_VAULT]: vaultData });
        await chrome.storage.session.set({ [Constants.SESSION_STORAGE_ACTIVE_IDENTITY_INDEX]: newIdentityEntryIndexInVault });
        await SessionManager.loadActiveIdentity(); // Load new active identity into session
        if (SessionManager.currentActiveDid) {
            await chrome.storage.local.set({ [Constants.STORAGE_KEY_LAST_ACTIVE_DID]: SessionManager.currentActiveDid });
            // If cloudUrl is set, attempt to initialize sync
            const currentIdentity = vaultData.identities[newIdentityEntryIndexInVault];
            if (currentIdentity && (currentIdentity.cloudUrl || currentIdentity.instanceUrl) && SessionManager.currentActiveDid) {
                // The 'password' variable holds the user's main vault password used for this setup flow
                PouchDBManager.initializeSync(SessionManager.currentActiveDid, password).catch((err) =>
                    console.error(`Error initializing PouchDB sync for ${SessionManager.currentActiveDid} after new identity finalization:`, err)
                );
            }
        }
        await chrome.storage.local.set({ [Constants.STORAGE_KEY_SETUP_COMPLETE]: true }); // Ensure setup is complete

        await broadcastAppStateToSubscriptions();
        return {
            success: true,
            message: `New identity ${newIdentityDid} created and finalized.`,
            did: newIdentityDid,
            identityName: vaultData.identities[newIdentityEntryIndexInVault].profile_name,
        };
    } catch (error) {
        // If cloud registration failed but local succeeded, vaultData might have the new identity.
        // Consider if we should revert local changes or inform user. For now, error is thrown.
        throw new Types.HandledError({
            error: {
                message: `New identity finalization failed: ${error instanceof Error ? error.message : String(error)}`,
                code: "NEW_IDENTITY_FINALIZE_FAILED",
            },
        });
    } finally {
        if (seedBuffer) wipeMemory(seedBuffer);
    }
}
