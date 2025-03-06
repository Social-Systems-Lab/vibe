// server-settings.tsx - Screen for managing server connection
import React, { useState, useEffect } from "react";
import { View, Text, TextInput, StyleSheet, TouchableOpacity, Alert, ScrollView, ActivityIndicator } from "react-native";
import { useRouter } from "expo-router";
import { useAuth } from "@/components/auth/auth-context";
import { useP2P } from "@/components/p2p/p2p-context";
import { Ionicons } from "@expo/vector-icons";
import { ServerConfig } from "@/types/types";

export default function ServerSettingsScreen() {
    const router = useRouter();
    const { currentAccount, updateServerConfig } = useAuth();
    const { setServerUrl, checkServerConnection, serverStatus } = useP2P();
    
    const [serverName, setServerName] = useState("");
    const [serverUrl, setLocalServerUrl] = useState("");
    const [loading, setLoading] = useState(false);
    const [checking, setChecking] = useState(false);
    
    // Initialize form with current account server settings
    useEffect(() => {
        if (currentAccount?.server) {
            setServerName(currentAccount.server.name || "");
            setLocalServerUrl(currentAccount.server.url || "");
            
            // Update P2P context with current server URL
            if (currentAccount.server.url) {
                setServerUrl(currentAccount.server.url);
            }
        }
    }, [currentAccount]);
    
    // Check server connection status
    const handleCheckConnection = async () => {
        if (!serverUrl.trim()) {
            Alert.alert("Invalid URL", "Please enter a valid server URL");
            return;
        }
        
        setChecking(true);
        try {
            // Update P2P context with new URL before checking
            setServerUrl(serverUrl);
            
            // Wait a moment for the context to update
            await new Promise(resolve => setTimeout(resolve, 100));
            
            // Check connection
            const connected = await checkServerConnection();
            
            if (connected) {
                Alert.alert("Success", "Successfully connected to the server");
            } else {
                Alert.alert("Connection Failed", "Could not connect to the server. Please check the URL and try again.");
            }
        } catch (error) {
            console.error("Error checking connection:", error);
            Alert.alert("Error", "An error occurred while checking the connection");
        } finally {
            setChecking(false);
        }
    };
    
    // Save server settings
    const handleSaveSettings = async () => {
        if (!serverUrl.trim()) {
            Alert.alert("Invalid URL", "Please enter a valid server URL");
            return;
        }
        
        setLoading(true);
        try {
            // Check connection one more time before saving
            setServerUrl(serverUrl);
            await new Promise(resolve => setTimeout(resolve, 100));
            const connected = await checkServerConnection();
            
            const newServerConfig: ServerConfig = {
                url: serverUrl,
                name: serverName || "Vibe Server",
                isConnected: connected,
                lastConnected: connected ? Date.now() : undefined
            };
            
            await updateServerConfig(currentAccount!.did, newServerConfig);
            Alert.alert("Success", "Server settings updated successfully");
            router.back();
        } catch (error) {
            console.error("Error saving server settings:", error);
            Alert.alert("Error", "Failed to save server settings");
        } finally {
            setLoading(false);
        }
    };
    
    if (!currentAccount) {
        return (
            <View style={styles.container}>
                <Text>No account selected</Text>
            </View>
        );
    }
    
    return (
        <View style={styles.container}>
            <ScrollView contentContainerStyle={styles.content}>
                <Text style={styles.title}>Server Settings</Text>
                <Text style={styles.description}>
                    Configure your connection to a Vibe Cloud server for P2P communication.
                </Text>
                
                <View style={styles.formGroup}>
                    <Text style={styles.label}>Server Name</Text>
                    <TextInput
                        style={styles.input}
                        value={serverName}
                        onChangeText={setServerName}
                        placeholder="Server Name (e.g. My Vibe Server)"
                    />
                </View>
                
                <View style={styles.formGroup}>
                    <Text style={styles.label}>Server URL</Text>
                    <TextInput
                        style={styles.input}
                        value={serverUrl}
                        onChangeText={setLocalServerUrl}
                        placeholder="Server URL (e.g. http://localhost:5000)"
                        keyboardType="url"
                        autoCapitalize="none"
                    />
                </View>
                
                <View style={styles.connectionStatusContainer}>
                    <View style={styles.connectionStatus}>
                        <View style={[
                            styles.statusIndicator,
                            serverStatus === 'connected' ? styles.connected : styles.disconnected
                        ]} />
                        <Text style={styles.statusText}>
                            {serverStatus === 'connecting' ? 'Checking connection...' :
                             serverStatus === 'connected' ? 'Connected' : 'Not connected'}
                        </Text>
                    </View>
                    
                    <TouchableOpacity
                        style={styles.checkButton}
                        onPress={handleCheckConnection}
                        disabled={checking || !serverUrl.trim()}
                    >
                        {checking ? (
                            <ActivityIndicator size="small" color="#fff" />
                        ) : (
                            <Text style={styles.checkButtonText}>Check Connection</Text>
                        )}
                    </TouchableOpacity>
                </View>
                
                <View style={styles.buttonContainer}>
                    <TouchableOpacity
                        style={[styles.button, styles.cancelButton]}
                        onPress={() => router.back()}
                        disabled={loading}
                    >
                        <Text style={styles.cancelButtonText}>Cancel</Text>
                    </TouchableOpacity>
                    
                    <TouchableOpacity
                        style={[styles.button, styles.saveButton]}
                        onPress={handleSaveSettings}
                        disabled={loading || checking}
                    >
                        {loading ? (
                            <ActivityIndicator size="small" color="#fff" />
                        ) : (
                            <Text style={styles.saveButtonText}>Save</Text>
                        )}
                    </TouchableOpacity>
                </View>
            </ScrollView>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#fff',
    },
    content: {
        padding: 20,
    },
    title: {
        fontSize: 24,
        fontWeight: '600',
        marginBottom: 10,
    },
    description: {
        fontSize: 16,
        color: '#666',
        marginBottom: 20,
        lineHeight: 24,
    },
    formGroup: {
        marginBottom: 20,
    },
    label: {
        fontSize: 16,
        fontWeight: '500',
        marginBottom: 8,
        color: '#333',
    },
    input: {
        borderWidth: 1,
        borderColor: '#ddd',
        borderRadius: 8,
        padding: 12,
        fontSize: 16,
    },
    connectionStatusContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: 15,
        backgroundColor: '#f5f5f5',
        borderRadius: 8,
        marginBottom: 25,
    },
    connectionStatus: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    statusIndicator: {
        width: 12,
        height: 12,
        borderRadius: 6,
        marginRight: 8,
    },
    connected: {
        backgroundColor: '#4CAF50',
    },
    disconnected: {
        backgroundColor: '#F44336',
    },
    statusText: {
        fontSize: 16,
        color: '#333',
    },
    checkButton: {
        backgroundColor: '#3498db',
        paddingVertical: 8,
        paddingHorizontal: 16,
        borderRadius: 6,
        minWidth: 120,
        alignItems: 'center',
    },
    checkButtonText: {
        color: '#fff',
        fontWeight: '500',
    },
    buttonContainer: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginTop: 20,
    },
    button: {
        flex: 1,
        paddingVertical: 12,
        borderRadius: 8,
        alignItems: 'center',
    },
    cancelButton: {
        backgroundColor: '#f5f5f5',
        marginRight: 10,
    },
    saveButton: {
        backgroundColor: '#3498db',
        marginLeft: 10,
    },
    cancelButtonText: {
        color: '#333',
        fontSize: 16,
        fontWeight: '500',
    },
    saveButtonText: {
        color: '#fff',
        fontSize: 16,
        fontWeight: '500',
    },
});