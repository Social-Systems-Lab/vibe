// test.tsx - Test screen for account creation, login, encryption, etc.
import React, { useState } from "react";
import { ScrollView, View, Text, TextInput, Button, ActivityIndicator, StyleSheet, TouchableOpacity } from "react-native";
import { useAuth } from "@/components/auth/auth-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { AuthType } from "@/types/types";
import { useDb } from "@/components/db/db-context";

export default function TestScreen() {
    const { createAccount, login, logout, accounts, currentAccount, encryptData, decryptData, deleteAccount } = useAuth();
    const { put, get } = useDb();
    const router = useRouter();

    const [accountName, setAccountName] = useState<string>("");
    const [authType, setAuthType] = useState<AuthType>("BIOMETRIC");
    const [pin, setPin] = useState<string>("");

    const [dataToEncrypt, setDataToEncrypt] = useState<string>("");
    const [encryptedData, setEncryptedData] = useState<string | null>(null);
    const [decryptedData, setDecryptedData] = useState<string | null>(null);

    const [dataToWrite, setDataToWrite] = useState<string>("");
    const [readData, setReadData] = useState<any>(null);

    const [isLoading, setIsLoading] = useState<boolean>(false);

    const handleCreateAccount = async () => {
        setIsLoading(true);
        try {
            await createAccount(accountName, authType, undefined, authType === "PIN" ? pin : undefined);
            console.log("Account created successfully.");
        } catch (error) {
            console.error("Error creating account:", error);
        }
        setIsLoading(false);
    };

    const handleLogin = async (did: string) => {
        setIsLoading(true);
        try {
            await login(did, authType === "PIN" ? pin : undefined);
            console.log("Logged into account:", did);
        } catch (error) {
            console.error("Error logging into account:", error);
        }
        setIsLoading(false);
    };

    const handleEncryptData = async () => {
        setIsLoading(true);
        try {
            if (!currentAccount) {
                console.error("No account selected");
                return;
            }
            const encrypted = await encryptData(dataToEncrypt);
            setEncryptedData(encrypted);
        } catch (error) {
            console.error("Error encrypting data:", error);
        }
        setIsLoading(false);
    };

    const handleDecryptData = async () => {
        setIsLoading(true);
        try {
            if (!encryptedData) {
                console.error("No encrypted data to decrypt");
                return;
            }
            const decrypted = await decryptData(encryptedData);
            setDecryptedData(decrypted);
        } catch (error) {
            console.error("Error decrypting data:", error);
        }
        setIsLoading(false);
    };

    const handleWriteData = async () => {
        setIsLoading(true);
        try {
            if (!currentAccount) {
                console.error("No account selected");
                return;
            }
            await put({ _id: currentAccount.did, testData: dataToWrite });
            setDataToWrite("");
        } catch (error) {
            console.error("Error writing data:", error);
        }
        setIsLoading(false);
    };

    const handleReadData = async () => {
        setIsLoading(true);
        try {
            if (!currentAccount) {
                console.error("No account selected");
                return;
            }
            const result = await get(currentAccount.did);
            setReadData(result);
        } catch (error) {
            console.error("Error reading data:", error);
        }
        setIsLoading(false);
    };

    const handleLogout = async () => {
        setIsLoading(true);
        try {
            await logout();
            console.log("Logged out successfully.");
        } catch (error) {
            console.error("Error logging out:", error);
        }
        setIsLoading(false);
    };

    const handleDeleteAccount = async (did: string) => {
        setIsLoading(true);
        try {
            await deleteAccount(did);
            console.log("Account deleted successfully:", did);
        } catch (error) {
            console.error("Error deleting account:", error);
        }
        setIsLoading(false);
    };

    return (
        <ScrollView contentContainerStyle={styles.container}>
            <View style={styles.section}>
                <Text style={styles.sectionTitle}>Current Account</Text>
                {currentAccount ? (
                    <View style={styles.accountCard}>
                        <Text style={styles.accountName}>{currentAccount.name}</Text>
                        <Text style={styles.accountDid}>{currentAccount.did}</Text>
                        <Button title="Logout" onPress={handleLogout} />
                    </View>
                ) : (
                    <Text>No account logged in</Text>
                )}
            </View>

            <View style={styles.section}>
                <Text style={styles.sectionTitle}>Create Account</Text>
                <TextInput placeholder="Account Name" value={accountName} onChangeText={setAccountName} style={styles.input} />
                <Text>Auth Type:</Text>
                <Button
                    title={authType === "BIOMETRIC" ? "Switch to PIN" : "Switch to Biometric"}
                    onPress={() => setAuthType(authType === "BIOMETRIC" ? "PIN" : "BIOMETRIC")}
                />
                {authType === "PIN" && <TextInput placeholder="PIN" value={pin} onChangeText={setPin} secureTextEntry style={styles.input} />}
                <Button title="Create Account" onPress={handleCreateAccount} />
            </View>

            <View style={styles.section}>
                <Text style={styles.sectionTitle}>Accounts</Text>
                {accounts.map((account) => (
                    <View key={account.did} style={styles.accountItem}>
                        <View style={styles.accountInfo}>
                            <Text style={styles.accountName}>{account.name}</Text>
                            <Text style={styles.accountDid}>{account.did.slice(0, 10)}...</Text>
                        </View>
                        <View style={styles.accountActions}>
                            <Button title="Login" onPress={() => handleLogin(account.did)} />
                            <TouchableOpacity onPress={() => handleDeleteAccount(account.did)}>
                                <Ionicons name="trash" size={24} color="red" />
                            </TouchableOpacity>
                        </View>
                    </View>
                ))}
            </View>

            <View style={styles.section}>
                <Text style={styles.sectionTitle}>Encrypt Data</Text>
                <TextInput placeholder="Data to Encrypt" value={dataToEncrypt} onChangeText={setDataToEncrypt} style={styles.input} />
                <Button title="Encrypt Data" onPress={handleEncryptData} />
                <Text>Encrypted Data: {encryptedData ? encryptedData.slice(0, 20) + "..." : "N/A"}</Text>
                <Button title="Decrypt Data" onPress={handleDecryptData} />
                <Text>Decrypted Data: {decryptedData ? decryptedData : "N/A"}</Text>
                {currentAccount && (
                    <>
                        <TextInput placeholder="Data to Write" value={dataToWrite} onChangeText={setDataToWrite} style={styles.input} />
                        <Button title="Write Data" onPress={handleWriteData} />
                        <Text>Data: {currentAccount.did}</Text>
                        <Button title="Read Data" onPress={handleReadData} />
                        <Text>Read Data: {readData ? JSON.stringify(readData) : "N/A"}</Text>
                    </>
                )}
            </View>

            <View style={styles.section}>
                <Button title="Go to Account Select Screen" onPress={() => router.replace("/accounts/account-select")} />
            </View>

            {isLoading && <ActivityIndicator size="large" color="#0000ff" />}
        </ScrollView>
    );
}

const styles = StyleSheet.create({
    container: {
        padding: 16,
    },
    section: {
        marginBottom: 24,
    },
    sectionTitle: {
        fontSize: 18,
        fontWeight: "bold",
        marginBottom: 8,
    },
    accountCard: {
        padding: 16,
        backgroundColor: "#f0f0f0",
        borderRadius: 8,
        marginBottom: 16,
    },
    accountName: {
        fontSize: 16,
        fontWeight: "bold",
    },
    accountDid: {
        fontSize: 14,
        color: "#666",
        marginBottom: 8,
    },
    input: {
        borderBottomWidth: 1,
        marginVertical: 8,
        padding: 8,
    },
    accountItem: {
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
        padding: 8,
        borderBottomWidth: 1,
        borderBottomColor: "#ccc",
    },
    accountInfo: {
        flex: 1,
    },
    accountActions: {
        flexDirection: "row",
        alignItems: "center",
    },
});
