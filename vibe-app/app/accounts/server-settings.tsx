// server-settings.tsx - Screen for managing server connection
import React, { useState, useEffect } from "react";
import { View, Text, TextInput, StyleSheet, TouchableOpacity, Alert, ScrollView, ActivityIndicator } from "react-native";
import { useRouter } from "expo-router";
import { useAuth } from "@/components/auth/auth-context";
import { MaterialIcons } from "@expo/vector-icons";
import { ServerConfig, ServerOption } from "@/types/types";
import { useAccountSync } from "@/hooks/useAccountSync";
import ServerStatusIndicator from "@/components/ui/server-status-indicator";

// Constants
const OFFICIAL_SERVER_URL = "https://cloud.vibeapp.dev";
const OFFICIAL_SERVER_NAME = "Official Vibe Cloud";

export default function ServerSettingsScreen() {
    const router = useRouter();
    const { currentAccount, updateServerConfig, registerWithVibeCloud } = useAuth();
    const { serverStatus, isRegistered, checkServerStatus } = useAccountSync();

    const [serverOption, setServerOption] = useState<ServerOption>("official");
    const [serverUrl, setServerUrl] = useState("");
    const [checking, setChecking] = useState(false);
    const [serverConnected, setServerConnected] = useState(false);

    // Initialize form with current account server settings
    useEffect(() => {
        if (currentAccount?.server) {
            setServerUrl(currentAccount.server.url || "");
            setServerOption(currentAccount.server.serverOption || "official");
            setServerConnected(currentAccount.server.isConnected || false);
        }
    }, [currentAccount]);

    // Check server connection
    const handleCheckConnection = async () => {
        if (!serverUrl.trim()) {
            Alert.alert("Invalid URL", "Please enter a valid server URL");
            return false;
        }

        setChecking(true);
        try {
            return new Promise<boolean>((resolve) => {
                const timeoutId = setTimeout(() => {
                    setServerConnected(false);
                    setChecking(false);
                    Alert.alert("Connection Timeout", "Could not connect to the server. Please check the URL and try again.");
                    resolve(false);
                }, 5000);

                fetch(`${serverUrl}/health`, {
                    headers: {
                        "ngrok-skip-browser-warning": "1",
                    },
                })
                    .then((response) => response.json())
                    .then((data) => {
                        clearTimeout(timeoutId);
                        const isConnected = data.status === "healthy";
                        setServerConnected(isConnected);
                        setChecking(false);

                        if (isConnected) {
                            Alert.alert("Success", "Successfully connected to the server");
                        } else {
                            Alert.alert("Connection Failed", "Server responded but health check failed.");
                        }

                        resolve(isConnected);
                    })
                    .catch((error) => {
                        clearTimeout(timeoutId);
                        console.error("Error checking server:", error);
                        setServerConnected(false);
                        setChecking(false);
                        Alert.alert("Connection Failed", "Could not connect to the server.");
                        resolve(false);
                    });
            });
        } catch (error) {
            console.error("Error in handleCheckConnection:", error);
            setServerConnected(false);
            setChecking(false);
            return false;
        }
    };

    // Save server settings
    const handleSaveSettings = async () => {
        if (serverOption === "custom" && !serverUrl.trim()) {
            Alert.alert("Invalid URL", "Please enter a valid server URL");
            return;
        }

        // Confirm server change if switching from one option to another
        if (currentAccount?.server?.serverOption !== serverOption) {
            Alert.alert("Confirm Server Change", "Changing servers will require re-syncing your data. Are you sure you want to continue?", [
                { text: "Cancel", style: "cancel" },
                {
                    text: "Continue",
                    style: "destructive",
                    onPress: async () => {
                        await saveServerConfig();
                    },
                },
            ]);
        } else {
            await saveServerConfig();
        }
    };

    const saveServerConfig = async () => {
        try {
            if (serverOption === "custom" && !serverConnected) {
                const confirmed = await handleCheckConnection();
                if (!confirmed) {
                    Alert.alert("Server Not Connected", "Would you like to save anyway?", [
                        { text: "Cancel", style: "cancel" },
                        {
                            text: "Save Anyway",
                            style: "destructive",
                            onPress: async () => await updateConfig(),
                        },
                    ]);
                    return;
                }
            }

            await updateConfig();
        } catch (error) {
            console.error("Error saving server settings:", error);
            Alert.alert("Error", "Failed to save server settings");
        }
    };

    const updateConfig = async () => {
        const newServerConfig: ServerConfig = {
            url: serverOption === "official" ? OFFICIAL_SERVER_URL : serverUrl,
            name: serverOption === "official" ? OFFICIAL_SERVER_NAME : "Custom Vibe Cloud",
            serverOption,
            isConnected: serverConnected,
            lastConnected: serverConnected ? Date.now() : undefined,
        };

        await updateServerConfig(currentAccount!.did, newServerConfig);

        // Attempt to register with Vibe Cloud if not using device-only mode
        if (serverOption !== "none") {
            const cloudRegistered = await registerWithVibeCloud(currentAccount!);
            if (!cloudRegistered) {
                Alert.alert("Cloud Registration Issue", "We couldn't connect to the Vibe Cloud. Your settings are saved but data may not sync until connection is restored.", [{ text: "OK" }]);
                return;
            }
        }

        Alert.alert("Success", "Server settings updated successfully");
        router.back();
    };

    return (
        <View style={styles.container}>
            <ScrollView contentContainerStyle={styles.content}>
                <Text style={styles.title}>Server Settings</Text>
                <Text style={styles.description}>Choose where to securely store and sync your data.</Text>

                <View style={styles.optionCardsContainer}>
                    {/* Official Vibe Cloud Option */}
                    <TouchableOpacity style={[styles.optionCard, serverOption === "official" && styles.selectedOptionCard]} onPress={() => setServerOption("official")}>
                        <View style={styles.optionCardContent}>
                            <View style={styles.optionCardHeader}>
                                <MaterialIcons name="cloud" size={24} color={serverOption === "official" ? "#3498db" : "#666"} />
                                <Text style={[styles.optionCardTitle, serverOption === "official" && styles.selectedOptionText]}>Official Vibe Cloud</Text>
                            </View>
                            <Text style={styles.optionCardDescription}>Secure syncing provided by Vibe</Text>
                        </View>
                        <View style={styles.optionCardCheckbox}>{serverOption === "official" && <MaterialIcons name="check-circle" size={24} color="#3498db" />}</View>
                    </TouchableOpacity>

                    {/* Custom Server Option */}
                    <TouchableOpacity style={[styles.optionCard, serverOption === "custom" && styles.selectedOptionCard]} onPress={() => setServerOption("custom")}>
                        <View style={styles.optionCardContent}>
                            <View style={styles.customOptionContent}>
                                <View style={styles.optionCardHeader}>
                                    <MaterialIcons name="dns" size={24} color={serverOption === "custom" ? "#3498db" : "#666"} />
                                    <Text style={[styles.optionCardTitle, serverOption === "custom" && styles.selectedOptionText]}>Custom Host</Text>
                                </View>
                                <Text style={styles.optionCardDescription}>Use a self-hosted or third party vibe cloud service</Text>
                            </View>
                        </View>

                        {serverOption === "custom" && (
                            <View style={styles.customServerContainer}>
                                <View style={styles.formGroup}>
                                    <Text style={styles.label}>Server URL</Text>
                                    <TextInput style={styles.input} value={serverUrl} onChangeText={setServerUrl} placeholder="e.g. http://localhost:5000" keyboardType="url" autoCapitalize="none" />
                                </View>

                                <View style={styles.connectionStatusContainer}>
                                    <TouchableOpacity style={styles.checkButton} onPress={() => {
                                        setChecking(true);
                                        checkServerStatus().finally(() => {
                                            setChecking(false);
                                            // Update local state based on the global state result
                                            setServerConnected(serverStatus === 'online');
                                        });
                                    }} disabled={checking || !serverUrl}>
                                        <Text style={styles.checkButtonText}>{checking ? "Checking..." : "Check Connection"}</Text>
                                    </TouchableOpacity>

                                    <ServerStatusIndicator />
                                    
                                    <View style={styles.connectionStatus}>
                                        <View style={[styles.statusIndicator, serverConnected ? styles.connected : styles.disconnected]} />
                                        <Text style={styles.statusText}>{checking ? "Checking..." : serverConnected ? "Connected" : "Not connected"}</Text>
                                    </View>
                                </View>
                            </View>
                        )}
                    </TouchableOpacity>

                    {/* Device Only Option */}
                    <TouchableOpacity style={[styles.optionCard, serverOption === "none" && styles.selectedOptionCard]} onPress={() => setServerOption("none")}>
                        <View style={styles.optionCardContent}>
                            <View style={styles.optionCardHeader}>
                                <MaterialIcons name="phonelink" size={24} color={serverOption === "none" ? "#3498db" : "#666"} />
                                <Text style={[styles.optionCardTitle, serverOption === "none" && styles.selectedOptionText]}>Device Only</Text>
                            </View>
                            <Text style={styles.optionCardDescription}>Your data stays on this device only</Text>
                        </View>
                        <View style={styles.optionCardCheckbox}>{serverOption === "none" && <MaterialIcons name="check-circle" size={24} color="#3498db" />}</View>
                    </TouchableOpacity>
                </View>

                <View style={styles.buttonContainer}>
                    <TouchableOpacity style={[styles.button, styles.cancelButton]} onPress={() => router.back()}>
                        <Text style={styles.cancelButtonText}>Cancel</Text>
                    </TouchableOpacity>

                    <TouchableOpacity style={[styles.button, styles.saveButton]} onPress={handleSaveSettings}>
                        <Text style={styles.saveButtonText}>Save Changes</Text>
                    </TouchableOpacity>
                </View>
            </ScrollView>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: "#fff",
    },
    content: {
        padding: 20,
    },
    title: {
        fontSize: 24,
        fontWeight: "600",
        marginBottom: 10,
    },
    description: {
        fontSize: 16,
        color: "#666",
        marginBottom: 20,
        lineHeight: 24,
    },
    optionCardsContainer: {
        marginTop: 20,
    },
    optionCard: {
        borderWidth: 1,
        borderColor: "#e0e0e0",
        borderRadius: 8,
        padding: 16,
        marginBottom: 12,
        backgroundColor: "#fff",
    },
    selectedOptionCard: {
        borderColor: "#3498db",
        borderWidth: 2,
        backgroundColor: "#f0f9ff",
    },
    optionCardContent: {
        flex: 1,
    },
    customOptionContent: {
        marginBottom: 10,
    },
    optionCardHeader: {
        flexDirection: "row",
        alignItems: "center",
        marginBottom: 6,
    },
    optionCardTitle: {
        fontSize: 18,
        fontWeight: "600",
        marginLeft: 10,
        color: "#333",
    },
    selectedOptionText: {
        color: "#3498db",
    },
    optionCardDescription: {
        fontSize: 14,
        color: "#666",
        marginLeft: 34,
    },
    optionCardCheckbox: {
        position: "absolute",
        right: 16,
        top: 16,
    },
    customServerContainer: {
        marginTop: 12,
        backgroundColor: "#f9f9f9",
        borderRadius: 8,
        padding: 16,
    },
    formGroup: {
        marginBottom: 15,
    },
    label: {
        fontSize: 16,
        marginBottom: 8,
        fontWeight: "500",
        color: "#333",
    },
    input: {
        borderWidth: 1,
        borderColor: "#ddd",
        borderRadius: 8,
        padding: 12,
        fontSize: 16,
    },
    connectionStatusContainer: {
        alignItems: "center",
    },
    checkButton: {
        backgroundColor: "#3498db",
        paddingVertical: 8,
        paddingHorizontal: 16,
        borderRadius: 6,
        marginBottom: 10,
    },
    checkButtonText: {
        color: "#fff",
        fontWeight: "500",
    },
    connectionStatus: {
        flexDirection: "row",
        alignItems: "center",
    },
    statusIndicator: {
        width: 12,
        height: 12,
        borderRadius: 6,
        marginRight: 8,
    },
    connected: {
        backgroundColor: "#4CAF50",
    },
    disconnected: {
        backgroundColor: "#F44336",
    },
    statusText: {
        fontSize: 16,
        color: "#333",
    },
    buttonContainer: {
        flexDirection: "row",
        justifyContent: "space-between",
        marginTop: 30,
    },
    button: {
        flex: 1,
        paddingVertical: 12,
        borderRadius: 8,
        alignItems: "center",
    },
    cancelButton: {
        backgroundColor: "#f5f5f5",
        marginRight: 10,
    },
    saveButton: {
        backgroundColor: "#3498db",
        marginLeft: 10,
    },
    cancelButtonText: {
        color: "#333",
        fontSize: 16,
        fontWeight: "500",
    },
    saveButtonText: {
        color: "#fff",
        fontSize: 16,
        fontWeight: "500",
    },
});
