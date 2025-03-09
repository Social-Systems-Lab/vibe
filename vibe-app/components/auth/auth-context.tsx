// auth-context.tsx - User account and auth management. RSA key generation and signing context
// Uses a WebView to interact with the jsrsasign library

import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from "react";
import { Buffer } from "buffer";
import * as FileSystem from "expo-file-system";
import * as SecureStore from "expo-secure-store";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Crypto from "expo-crypto";
import * as Device from "expo-device";
import { View, StyleSheet } from "react-native";
import WebView from "react-native-webview";
import { Asset } from "expo-asset";
import { useTabs } from "../ui/tab-context";
import { APPS_KEY_PREFIX } from "@/constants/constants";
import { Account, AuthType, RsaKeys, InstalledApp, ServerConfig, ChallengeResponse, RegistrationResponse } from "@/types/types";
import { useDb } from "../db/db-context";
import { getDirNameFromDid } from "@/lib/utils";

// Polyfill Buffer for React Native if necessary
if (typeof Buffer === "undefined") {
    global.Buffer = require("buffer").Buffer;
}

type Operation = "read" | "write";
type PermissionSetting = "never" | "ask" | "always";

type CloudCredentials = {
    username: string;
    password: string;
    dbName: string;
    deviceId: string;
}

type CreateAccountResult = {
    account: Account;
    encryptionKey: string;
}

type AuthContextType = {
    // Account management
    jsrsaWebViewRef: React.RefObject<WebView>;
    accounts: Account[];
    currentAccount: Account | null;
    loading: boolean;
    initialized: boolean;
    generateRSAKeys: () => Promise<RsaKeys>;
    signChallenge: (privateKey: string, challenge: string) => Promise<string>;
    createAccount: (accountName: string, authType: AuthType, pictureUrl?: string, pin?: string, serverConfig?: ServerConfig) => Promise<CreateAccountResult>;
    updateAccount: (accountDid: string, newName?: string, newPictureUri?: string) => Promise<void>;
    updateServerConfig: (accountDid: string, serverConfig: ServerConfig) => Promise<void>;
    deleteAccount: (accountDid: string) => Promise<void>;
    encryptData: (data: string) => Promise<string>;
    decryptData: (encryptedData: string) => Promise<string>;
    login: (accountDid: string, pin?: string) => Promise<void>;
    logout: () => Promise<void>;

    // App management
    installedApps: InstalledApp[];
    addOrUpdateApp: (app: Partial<InstalledApp>, account?: Account) => Promise<void>;
    removeApp: (appId: string) => Promise<void>;
    setAppPinned: (appId: string, pinned: boolean) => Promise<void>;
    setAppHidden: (appId: string, hidden: boolean) => Promise<void>;

    // Permissions
    checkPermission: (appId: string, operation: Operation, collection: string) => Promise<PermissionSetting>;
    updatePermission: (appId: string, operation: Operation, collection: string, newValue: PermissionSetting) => Promise<void>;

    // Vibe Cloud
    storeCredentials: (
        account: Account,
        credentials: CloudCredentials
    ) => Promise<void>;
    loadCredentials: (account: Account) => Promise<CloudCredentials | null>;
    registerWithVibeCloud: (account: Account, inEncryptionKey?: string) => Promise<boolean>;
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const jsrsaWebViewRef = useRef<WebView>(null);
    const jsrsasignHtmlUri = Asset.fromModule(require("@/assets/auth/jsrsasign.html")).uri;
    const pendingRequests = useRef<{ [key: string]: (value: any) => void }>({});
    const [accounts, setAccounts] = useState<Account[]>([]);
    const [encryptionKey, setEncryptionKey] = useState<string>("");
    const [currentAccount, setCurrentAccount] = useState<Account | null>(null);
    const [loading, setLoading] = useState<boolean>(false);
    const [initialized, setInitialized] = useState<boolean>(false);
    const [installedApps, setInstalledApps] = useState<InstalledApp[]>([]);
    const { resetTabs, clearTabs } = useTabs();
    const { open, close } = useDb(); // Get database functions

    const ACCOUNTS_KEY = "accounts";
    const DEVICE_ID_KEY = "deviceId";
    const getAppsKey = (did: string) => `${APPS_KEY_PREFIX}${did}`;

    // Function to handle setting up an account: open DB and load apps
    const setupAccount = async (account: Account) => {
        if (!account) return;

        try {
            // 1. Open the database for this account
            const dbName = getDirNameFromDid(account.did);
            console.log(`Opening database for account: ${dbName}`);
            await open(dbName);
            console.log(`Database opened successfully`);

            // 2. Load installed apps for this account
            const appsKey = getAppsKey(account.did);
            const data = await AsyncStorage.getItem(appsKey);
            if (data) {
                setInstalledApps(JSON.parse(data));
            } else {
                setInstalledApps([]);
            }
        } catch (error) {
            console.error("Error setting up account:", error);
            // Continue anyway as we want basic functionality to work
        }
    };

    const callWebViewFunction = useCallback((message: { action: string; payload?: any }) => {
        return new Promise<any>((resolve, reject) => {
            const requestId = Date.now().toString(); // Unique request ID
            pendingRequests.current[requestId] = resolve;

            console.log("callWebViewFunction", JSON.stringify({ ...message, requestId }));

            jsrsaWebViewRef.current?.injectJavaScript(`
                    window.dispatchEvent(new MessageEvent('message', {
                        data: ${JSON.stringify({ ...message, requestId })}
                    }));
                `);

            // timeout to reject if no response is received
            setTimeout(() => {
                if (pendingRequests.current[requestId]) {
                    delete pendingRequests.current[requestId];
                    reject(new Error("WebView function timed out"));
                }
            }, 5 * 60000); // 5*60 seconds timeout
        });
    }, []);

    const generateRSAKeys = useCallback(() => {
        return callWebViewFunction({ action: "generateRSAKeys" });
    }, [callWebViewFunction]);

    const signChallenge = useCallback(
        (privateKey: string, challenge: string) => {
            return callWebViewFunction({
                action: "signChallenge",
                payload: { privateKey, challenge },
            });
        },
        [callWebViewFunction]
    );

    const storeAccounts = async (accounts: Account[]): Promise<void> => {
        await AsyncStorage.setItem(ACCOUNTS_KEY, JSON.stringify(accounts));
    };

    const loadAccounts = async (): Promise<Account[]> => {
        const data = await AsyncStorage.getItem(ACCOUNTS_KEY);
        return data ? JSON.parse(data) : [];
    };

    // App management functions
    async function saveInstalledApps(apps: InstalledApp[], account?: Account) {
        const targetAccount = account || currentAccount;
        if (!targetAccount) {
            throw new Error("Cannot add app: No account selected");
        }

        setInstalledApps(apps);
        const appsKey = getAppsKey(targetAccount.did);
        await AsyncStorage.setItem(appsKey, JSON.stringify(apps));
    }

    // Add or update an app
    async function addOrUpdateApp(app: Partial<InstalledApp>, account?: Account) {
        const targetAccount = account || currentAccount;
        if (!targetAccount) {
            throw new Error("Cannot add app: No account selected");
        }

        console.log("addOrUpdateApp for account:", targetAccount.did, ", app:", app);

        let existingIndex = installedApps.findIndex((a) => a.appId === app.appId);
        let newList;
        if (existingIndex >= 0) {
            // update
            newList = [...installedApps];
            newList[existingIndex] = { ...installedApps[existingIndex], ...app } as InstalledApp;
        } else {
            // add
            newList = [...installedApps, app as InstalledApp];
        }
        await saveInstalledApps(newList, account);
    }

    async function removeApp(appId: string) {
        const filtered = installedApps.filter((a) => a.appId !== appId);
        await saveInstalledApps(filtered);
    }

    async function setAppPinned(appId: string, pinned: boolean) {
        const newList = installedApps.map((a) => {
            if (a.appId === appId) return { ...a, pinned };
            return a;
        });
        await saveInstalledApps(newList);
    }

    async function setAppHidden(appId: string, hidden: boolean) {
        const newList = installedApps.map((a) => {
            if (a.appId === appId) return { ...a, hidden };
            return a;
        });
        await saveInstalledApps(newList);
    }

    // Permission management functions
    async function checkPermission(appId: string, operation: Operation, collection: string): Promise<PermissionSetting> {
        // e.g. expecting "read.contacts" or "write.contacts"
        const permKey = `${operation}.${collection}`;
        const app = installedApps.find((a) => a.appId === appId);
        if (!app) throw new Error("App not installed");

        // Get or default to "never"
        const permission = app.permissions?.[permKey] ?? "never";
        return permission;
    }

    async function updatePermission(appId: string, operation: Operation, collection: string, newValue: PermissionSetting) {
        const permKey = `${operation}.${collection}`;
        const app = installedApps.find((a) => a.appId === appId);
        if (!app) return;
        app.permissions = {
            ...app.permissions,
            [permKey]: newValue,
        };
        await saveInstalledApps([...installedApps]);
    }

    const generateEncryptionKey = async (): Promise<string> => {
        let keyBytes = await Crypto.getRandomBytesAsync(32);
        return Buffer.from(keyBytes).toString("base64");
    };

    const storeEncryptionKey = async (account: Account, encryptionKey: string, pin?: string): Promise<void> => {
        const secureStoreKey = account.did.replace(/[^a-zA-Z0-9._-]/g, "");
        if (account.requireAuthentication === "PIN" && pin) {
            const encryptedKeyWithPin = await encryptDataWithEncryptionKey(encryptionKey, pin);
            await SecureStore.setItemAsync(secureStoreKey, encryptedKeyWithPin);
        } else {
            await SecureStore.setItemAsync(secureStoreKey, encryptionKey, {
                requireAuthentication: true,
            });
        }
    };

    const retrieveEncryptionKey = async (account: Account, pin?: string): Promise<string> => {
        const secureStoreKey = account.did.replace(/[^a-zA-Z0-9._-]/g, "");
        const storedEncryptionKey = await SecureStore.getItemAsync(secureStoreKey, {
            requireAuthentication: account.requireAuthentication === "BIOMETRIC",
        });
        if (!storedEncryptionKey) {
            throw new Error("Encryption key not found");
        }
        if (account.requireAuthentication === "PIN" && pin) {
            return await decryptDataWithEncryptionKey(storedEncryptionKey, pin);
        }
        return storedEncryptionKey;
    };

    const encryptDataWithEncryptionKey = useCallback(
        async (data: string, encryptionKey: string): Promise<string> => {
            return callWebViewFunction({
                action: "encryptData",
                payload: { data, encryptionKey },
            });
        },
        [callWebViewFunction]
    );

    const decryptDataWithEncryptionKey = useCallback(
        async (encryptedData: string, encryptionKey: string): Promise<string> => {
            return callWebViewFunction({
                action: "decryptData",
                payload: { encryptedData, encryptionKey },
            });
        },
        [callWebViewFunction]
    );

    const encryptData = async (data: string, inEncryptionKey?: string): Promise<string> => {
        return encryptDataWithEncryptionKey(data, inEncryptionKey ?? encryptionKey);
    };

    const decryptData = async (encryptedData: string, inEncryptionKey?: string): Promise<string> => {
        return decryptDataWithEncryptionKey(encryptedData, inEncryptionKey ?? encryptionKey);
    };

    const generateDid = async (publicKey: string): Promise<string> => {
        // Hash the public key using SHA-256
        const hash = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, publicKey);

        // Convert the hash to Base64 and make it URL safe
        const base64Url = Buffer.from(hash, "hex")
            .toString("base64")
            .replace(/\+/g, "-") // Replace + with -
            .replace(/\//g, "_") // Replace / with _
            .replace(/=+$/, ""); // Remove trailing =

        // Prefix the result to form a DID
        return `did:fan:${base64Url}`;
    };

    const createAccount = async (accountName: string, authType: AuthType, pictureUrl?: string, pin?: string, serverConfig?: ServerConfig): Promise<CreateAccountResult> => {
        setLoading(true);
        try {
            const rsaKeys = await generateRSAKeys();
            const encryptionKey = await generateEncryptionKey();
            const encryptedPrivateKey = await encryptDataWithEncryptionKey(rsaKeys.privateKey, encryptionKey);

            const did = await generateDid(rsaKeys.publicKey);
            const accountFolder = `${FileSystem.documentDirectory}${getDirNameFromDid(did)}/`;
            await FileSystem.makeDirectoryAsync(accountFolder, { intermediates: true });
            await FileSystem.writeAsStringAsync(`${accountFolder}privateKey.pem.enc`, encryptedPrivateKey);

            // store profile picture
            let storedPicturePath: string | undefined = undefined;
            let sourcePictureUri: string | undefined = pictureUrl;
            if (!sourcePictureUri) {
                const defaultAsset = Asset.fromModule(require("@/assets/images/default-picture.png"));
                if (!defaultAsset.localUri) {
                    await defaultAsset.downloadAsync();
                }
                sourcePictureUri = defaultAsset.localUri ?? undefined;
            }

            if (sourcePictureUri) {
                let extension = ".png";
                const match = sourcePictureUri.match(/\.(\w+)(\?|$)/);
                if (match && match[1]) {
                    extension = `.${match[1]}`;
                }

                const destination = `${accountFolder}picture${extension}`;
                try {
                    await FileSystem.copyAsync({
                        from: sourcePictureUri,
                        to: destination,
                    });
                    storedPicturePath = destination;
                } catch (err) {
                    console.error("Error copying profile picture:", err);
                }
            }

            // Set up default server config if none provided
            const defaultServer: ServerConfig = serverConfig || {
                url: "http://localhost:5000",
                name: "Local Server",
                isConnected: false,
                serverOption: "none",
            };

            const now = Date.now();
            const newAccount: Account = {
                did,
                publicKey: rsaKeys.publicKey,
                name: accountName,
                pictureUrl: storedPicturePath,
                requireAuthentication: authType,
                updatedAt: now,
                server: defaultServer,
            };

            await storeEncryptionKey(newAccount, encryptionKey, pin);

            const updatedAccounts = [...accounts, newAccount];
            setAccounts(updatedAccounts);
            await storeAccounts(updatedAccounts);

            // Set current account and encryption key
            setCurrentAccount(newAccount);
            setEncryptionKey(encryptionKey);

            // Set up the account (open DB and load apps)
            await setupAccount(newAccount);

            // Return the new account for immediate use
            let result: CreateAccountResult = {
                account: newAccount,
                encryptionKey,
            }
            return result;
        } catch (error) {
            console.error("Error creating account:", error);
            throw error;
        } finally {
            setLoading(false);
        }
    };

    async function updateAccount(accountDid: string, newName?: string, newPictureUri?: string): Promise<void> {
        const index = accounts.findIndex((acc) => acc.did === accountDid);
        if (index < 0) throw new Error("Account not found");
        const account = accounts[index];

        // if a new picture was provided, copy it into the account folder
        let storedPicturePath = account.pictureUrl;
        if (newPictureUri) {
            const accountFolder = `${FileSystem.documentDirectory}${getDirNameFromDid(accountDid)}/`;
            // derive extension, copy file, etc. (like in createAccount)
            const extension = newPictureUri.match(/\.(\w+)(\?|$)/)?.[1] || "png";
            const destination = `${accountFolder}picture.${extension}`;
            await FileSystem.copyAsync({ from: newPictureUri, to: destination });
            storedPicturePath = destination;
        }

        // update account object
        const now = Date.now();
        const updatedAccount = {
            ...account,
            name: newName || account.name,
            pictureUrl: storedPicturePath || account.pictureUrl,
            updatedAt: now,
        };

        // update the array of accounts in state and AsyncStorage
        const newAccounts = [...accounts];
        newAccounts[index] = updatedAccount;
        setAccounts(newAccounts);
        await storeAccounts(newAccounts);

        // 5. If this is the current account, update it
        if (currentAccount?.did === accountDid) {
            setCurrentAccount(updatedAccount);
        }
    }

    // Update server configuration for an account
    async function updateServerConfig(accountDid: string, serverConfig: ServerConfig): Promise<void> {
        const index = accounts.findIndex((acc) => acc.did === accountDid);
        if (index < 0) throw new Error("Account not found");
        const account = accounts[index];

        // Update account object with new server config
        const now = Date.now();
        const updatedAccount = {
            ...account,
            server: serverConfig,
            updatedAt: now,
        };

        // Update accounts in state and storage
        const newAccounts = [...accounts];
        newAccounts[index] = updatedAccount;
        setAccounts(newAccounts);
        await storeAccounts(newAccounts);

        // If this is the current account, update it
        if (currentAccount?.did === accountDid) {
            setCurrentAccount(updatedAccount);
            
            // If server URL changed and the database is open, we should
            // potentially reinitialize database sync
            // This will be handled by the useAccountSync hook's effect
        }
    }

    const login = async (accountDid: string, pin?: string) => {
        try {
            const account = accounts.find((acc) => acc.did === accountDid);
            if (!account) throw new Error("Account not found");

            // Get encryption key
            const encryptionKey = await retrieveEncryptionKey(account, pin);

            // Close current database if there is one
            if (currentAccount) {
                await close().catch((err) => console.error("Error closing previous database:", err));
            }

            // Set current account and encryption key
            setCurrentAccount(account);
            setEncryptionKey(encryptionKey);

            // Set up the account (open DB and load apps)
            await setupAccount(account);

            // Reset tabs when logging in
            resetTabs();

            // For context communication, we'll use a different approach in React Native
        } catch (error) {
            console.error("Login failed:", error);
            throw error;
        }
    };

    const logout = async () => {
        try {
            // Close the database if there's an active account
            if (currentAccount) {
                await close().catch((err) => console.error("Error closing database on logout:", err));
            }

            // Clear account and installed apps
            setCurrentAccount(null);
            setInstalledApps([]); // Clear installed apps since no account is selected
            clearTabs();
        } catch (error) {
            console.error("Error during logout:", error);
            // Still clear the account even if there was an error
            setCurrentAccount(null);
            setInstalledApps([]);
            clearTabs();
        }
    };

    const deleteAccount = async (accountDid: string) => {
        setLoading(true);

        try {
            // If it's the current account, close the database first
            if (currentAccount?.did === accountDid) {
                await close().catch((err) => console.error("Error closing database for deleted account:", err));
            }

            // delete the account folder (which holds the private key, profile picture, etc.)
            const accountFolder = `${FileSystem.documentDirectory}${getDirNameFromDid(accountDid)}/`;
            try {
                await FileSystem.deleteAsync(accountFolder, { idempotent: true });
            } catch (err) {
                console.error("Error deleting account folder:", err);
            }

            // remove account app registry data from AsyncStorage.
            const appsKey = `${APPS_KEY_PREFIX}${accountDid}`;
            try {
                await AsyncStorage.removeItem(appsKey);
            } catch (err) {
                console.error("Error removing installed apps data:", err);
            }

            // remove the account from the global accounts list.
            const updatedAccounts = accounts.filter((account) => account.did !== accountDid);
            setAccounts(updatedAccounts);
            await storeAccounts(updatedAccounts);

            // if the deleted account was currently active, clear current account
            if (currentAccount?.did === accountDid) {
                setCurrentAccount(null);
            }
        } catch (error) {
            console.error("Error deleting account:", error);
            throw error;
        } finally {
            setLoading(false);
        }
    };

    const getDeviceId = async () => {
        // Check if we already have a device ID
        const existingId = await AsyncStorage.getItem(DEVICE_ID_KEY);
        if (existingId) return existingId;

        // Generate a new UUID for this device
        const newId = Crypto.randomUUID();
        await SecureStore.setItemAsync(DEVICE_ID_KEY, newId);
        return newId;
    };

    // Implement the registration function
    const registerWithVibeCloud = async (account: Account, inEncryptionKey?: string): Promise<boolean> => {
        if (!account || !account.server?.url) {
            console.error("No account or server URL provided");
            return false;
        }

        try {
            const deviceId = await getDeviceId();
            const serverUrl = account.server.url;
            console.log(`Attempting to register with Vibe Cloud at ${serverUrl}`);

            // 1. Request a challenge from the server
            const challengeResponse = await fetch(`${serverUrl}/api/account/challenge`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    did: account.did,
                }),
            });

            if (!challengeResponse.ok) {
                console.error("Failed to get challenge from server", await challengeResponse.text());
                return false;
            }

            const challengeData = (await challengeResponse.json()) as ChallengeResponse;
            if (!challengeData.success || !challengeData.challenge) {
                console.error("Invalid challenge response", challengeData);
                return false;
            }

            // 2. Get the account's private key
            const accountFolder = `${FileSystem.documentDirectory}${getDirNameFromDid(account.did)}/`;
            const encryptedPrivateKey = await FileSystem.readAsStringAsync(`${accountFolder}privateKey.pem.enc`);
            const privateKey = await decryptDataWithEncryptionKey(encryptedPrivateKey, inEncryptionKey ?? encryptionKey);

            // 3. Sign the challenge
            const signature = await signChallenge(privateKey, challengeData.challenge);


            console.log("START #########");
            console.log("START #########");
            console.log("encryptedPrivateKey", encryptedPrivateKey);
            console.log("privateKey", privateKey);
            console.log("encryptionKey", inEncryptionKey ?? encryptionKey);
            console.log("END #########");
            console.log("END #########");

            // 4. Send the signature back to complete registration
            const registrationResponse = await fetch(`${serverUrl}/api/account/register`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    did: account.did,
                    publicKey: account.publicKey,
                    signature: signature,
                    deviceId: deviceId,
                    deviceName: Device.deviceName || "Device",
                }),
            });

            if (!registrationResponse.ok) {
                console.error("Registration request failed", await registrationResponse.text());
                return false;
            }

            const registrationResult = (await registrationResponse.json()) as RegistrationResponse;
            if (!registrationResult.success) {
                console.error("Registration failed", registrationResult);
                return false;
            }

            // 5. Update the account with cloud credentials (store securely)
            // For this integration, we'll encrypt and store credentials alongside the account

            const credentials = registrationResult.credentials;

            // Call the new storeCredentials function
            await storeCredentials(account, {
                username: credentials.username,
                password: credentials.password,
                dbName: credentials.dbName,
                deviceId: deviceId,
            }, inEncryptionKey);

            // 6. Update account server connection status
            const updatedServerConfig: ServerConfig = {
                ...account.server,
                isConnected: true,
                lastConnected: Date.now(),
            };

            await updateServerConfig(account.did!, updatedServerConfig);

            console.log("Successfully registered with Vibe Cloud");
            return true;
        } catch (error) {
            console.error("Error registering with Vibe Cloud:", error);
            return false;
        }
    };

    const storeCredentials = async (
        account: Account,
        credentials: CloudCredentials,
        inEncryptionKey?: string,
    ) => {
        const accountFolder = `${FileSystem.documentDirectory}${getDirNameFromDid(account.did)}/`;
        // Encrypt before storing
        const encryptedCredentials = await encryptData(JSON.stringify(credentials), inEncryptionKey);
        await FileSystem.writeAsStringAsync(`${accountFolder}cloud-credentials.enc`, encryptedCredentials);
    };

    const loadCredentials = async (account: Account): Promise<CloudCredentials | null> => {
        try {
            const accountFolder = `${FileSystem.documentDirectory}${getDirNameFromDid(account.did)}/`;
            const credentialsPath = `${accountFolder}cloud-credentials.enc`;
            
            // Check if credentials exist
            const fileInfo = await FileSystem.getInfoAsync(credentialsPath);
            if (!fileInfo.exists) {
                return null;
            }
    
            // Read and decrypt credentials
            const encryptedCredentials = await FileSystem.readAsStringAsync(credentialsPath);
            const decryptedCredentials = await decryptData(encryptedCredentials);
            return JSON.parse(decryptedCredentials);
        } catch (error) {
            console.error('Error loading cloud credentials:', error);
            throw error;
        }
    };

    useEffect(() => {
        const initialize = async () => {
            setLoading(true);
            const loadedAccounts = await loadAccounts();
            setAccounts(loadedAccounts);
            setInitialized(true);
            setLoading(false);
        };
        initialize();
    }, []);

    return (
        <AuthContext.Provider
            value={{
                // Account management
                jsrsaWebViewRef,
                generateRSAKeys,
                signChallenge,
                accounts,
                currentAccount,
                createAccount,
                updateAccount,
                updateServerConfig,
                encryptData,
                decryptData,
                login,
                logout,
                loading,
                initialized,
                deleteAccount,
                storeCredentials,
                loadCredentials,

                // App management
                installedApps,
                addOrUpdateApp,
                removeApp,
                setAppPinned,
                setAppHidden,

                // Permissions
                checkPermission,
                updatePermission,

                // Vibe Cloud
                registerWithVibeCloud,
            }}
        >
            <View style={styles.hidden}>
                <WebView
                    ref={jsrsaWebViewRef}
                    source={{ uri: jsrsasignHtmlUri }}
                    javaScriptEnabled
                    onMessage={(event) => {
                        console.log("onMessage", event.nativeEvent.data);
                        const { requestId, response } = JSON.parse(event.nativeEvent.data);

                        // resolve the corresponding Promise
                        if (requestId && pendingRequests.current[requestId]) {
                            pendingRequests.current[requestId](response);
                            delete pendingRequests.current[requestId];
                        }
                    }}
                />
            </View>
            {children}
        </AuthContext.Provider>
    );
};

export const useAuth = (): AuthContextType => {
    const context = useContext(AuthContext);
    if (!context) throw new Error("useAuth must be used within an AuthProvider");
    return context;
};

const styles = StyleSheet.create({
    hidden: {
        height: 0,
        width: 0,
        position: "absolute",
        top: -10000, // hide webview off-screen
    },
});
