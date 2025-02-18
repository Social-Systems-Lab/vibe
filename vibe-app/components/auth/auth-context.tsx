// auth-context.tsx - User account and auth management. RSA key generation and signing context
// Uses a WebView to interact with the jsrsasign library

import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from "react";
import { Buffer } from "buffer";
import * as FileSystem from "expo-file-system";
import * as SecureStore from "expo-secure-store";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Crypto from "expo-crypto";
import { View, StyleSheet } from "react-native";
import WebView from "react-native-webview";
import { Asset } from "expo-asset";
import { useTabs } from "../ui/tab-context";
import { APPS_KEY_PREFIX } from "@/constants/constants";
import { Account, AuthType, RsaKeys } from "@/types/types";
import { useDb } from "../db/db-context";

// Polyfill Buffer for React Native if necessary
if (typeof Buffer === "undefined") {
    global.Buffer = require("buffer").Buffer;
}

type AuthContextType = {
    jsrsaWebViewRef: React.RefObject<WebView>;
    accounts: Account[];
    currentAccount: Account | null;
    loading: boolean;
    initialized: boolean;
    generateRSAKeys: () => Promise<RsaKeys>;
    signChallenge: (privateKey: string, challenge: string) => Promise<string>;
    createAccount: (accountName: string, authType: AuthType, pictureUrl?: string, pin?: string) => Promise<void>;
    updateAccount: (accountDid: string, newName?: string, newPictureUri?: string) => Promise<void>;
    deleteAccount: (accountDid: string) => Promise<void>;
    encryptData: (data: string) => Promise<string>;
    decryptData: (encryptedData: string) => Promise<string>;
    login: (accountDid: string, pin?: string) => Promise<void>;
    logout: () => Promise<void>;
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
    const { resetTabs, clearTabs } = useTabs();

    const ACCOUNTS_KEY = "accounts";

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
            }, 60000); // 60 seconds timeout
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

    const encryptData = async (data: string): Promise<string> => {
        if (!currentAccount) throw new Error("No account selected");
        return encryptDataWithEncryptionKey(data, encryptionKey);
    };

    const decryptData = async (encryptedData: string): Promise<string> => {
        if (!currentAccount) throw new Error("No account selected");
        return decryptDataWithEncryptionKey(encryptedData, encryptionKey);
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

    const createAccount = async (accountName: string, authType: AuthType, pictureUrl?: string, pin?: string) => {
        setLoading(true);
        const rsaKeys = await generateRSAKeys();
        const encryptionKey = await generateEncryptionKey();
        const encryptedPrivateKey = await encryptDataWithEncryptionKey(rsaKeys.privateKey, encryptionKey);

        const did = await generateDid(rsaKeys.publicKey);
        const accountFolder = `${FileSystem.documentDirectory}${did}/`;
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

        const now = Date.now();
        const newAccount: Account = {
            did,
            publicKey: rsaKeys.publicKey,
            name: accountName,
            pictureUrl: storedPicturePath,
            requireAuthentication: authType,
            updatedAt: now,
        };

        await storeEncryptionKey(newAccount, encryptionKey, pin);

        const updatedAccounts = [...accounts, newAccount];
        setAccounts(updatedAccounts);
        await storeAccounts(updatedAccounts);

        setCurrentAccount(newAccount);
        setEncryptionKey(encryptionKey);
        setLoading(false);
    };

    async function updateAccount(accountDid: string, newName?: string, newPictureUri?: string): Promise<void> {
        const index = accounts.findIndex((acc) => acc.did === accountDid);
        if (index < 0) throw new Error("Account not found");
        const account = accounts[index];

        // if a new picture was provided, copy it into the account folder
        let storedPicturePath = account.pictureUrl;
        if (newPictureUri) {
            const accountFolder = `${FileSystem.documentDirectory}${accountDid}/`;
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

    const login = async (accountDid: string, pin?: string) => {
        const account = accounts.find((acc) => acc.did === accountDid);
        if (!account) throw new Error("Account not found");
        const encryptionKey = await retrieveEncryptionKey(account, pin);
        setCurrentAccount(account);
        setEncryptionKey(encryptionKey);

        // reset tabs when logging in
        resetTabs();
    };

    const logout = async () => {
        setCurrentAccount(null);
        clearTabs();
    };

    const deleteAccount = async (accountDid: string) => {
        setLoading(true);

        // delete the account folder (which holds the private key, profile picture, etc.)
        const accountFolder = `${FileSystem.documentDirectory}${accountDid}/`;
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

        // if the deleted account was currently active, log out.
        if (currentAccount?.did === accountDid) {
            setCurrentAccount(null);
        }
        setLoading(false);
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
                jsrsaWebViewRef,
                generateRSAKeys,
                signChallenge,
                accounts,
                currentAccount,
                createAccount,
                updateAccount,
                encryptData,
                decryptData,
                login,
                logout,
                loading,
                initialized,
                deleteAccount,
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
