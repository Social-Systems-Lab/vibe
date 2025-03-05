// p2p-test.tsx - admin dashboard to test p2p functionality
import React, { useState, useRef } from "react";
import { View, Text, TextInput, StyleSheet, TouchableOpacity, FlatList, KeyboardAvoidingView, Platform, ActivityIndicator } from "react-native";
import { useP2P } from "../../components/p2p/p2p-context";
import { router } from "expo-router";

export default function P2PTestScreen() {
    const { connectToPeer, disconnectFromPeer, sendMessage, messages, connections, localPeerId, isReady } = useP2P();

    const [targetPeerId, setTargetPeerId] = useState("");
    const [messageText, setMessageText] = useState("");
    const [error, setError] = useState<string | null>(null);
    const messageInputRef = useRef<TextInput>(null);

    // Connect to a peer
    const handleConnect = async () => {
        try {
            if (!targetPeerId.trim()) {
                setError("Please enter a peer ID");
                return;
            }
            setError(null);
            await connectToPeer(targetPeerId);
        } catch (err) {
            setError((err as Error).message || "Failed to connect to peer");
        }
    };

    // Disconnect from a peer
    const handleDisconnect = (peerId: string) => {
        try {
            disconnectFromPeer(peerId);
            setError(null);
        } catch (err) {
            setError((err as Error).message || "Failed to disconnect from peer");
        }
    };

    // Send a message to a peer
    const handleSendMessage = async (peerId: string) => {
        try {
            if (!messageText.trim()) {
                return;
            }
            await sendMessage(peerId, messageText);
            setMessageText("");
            messageInputRef.current?.clear();
            setError(null);
        } catch (err) {
            setError((err as Error).message || "Failed to send message");
        }
    };

    // Get connected peers
    const connectedPeers = Array.from(connections.keys());

    // Filter messages for the active peer
    const filteredMessages = messages.filter((msg) => connectedPeers.includes(msg.peerId));

    if (!isReady) {
        return (
            <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color="#2196F3" />
                <Text style={styles.loadingText}>Initializing P2P...</Text>
            </View>
        );
    }

    return (
        <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === "ios" ? "padding" : "height"} keyboardVerticalOffset={100}>
            <View style={styles.header}>
                <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
                    <Text style={styles.backButtonText}>Back</Text>
                </TouchableOpacity>
                <Text style={styles.title}>P2P Testing</Text>
            </View>

            {/* Peer ID Information */}
            <View style={styles.infoSection}>
                <Text style={styles.infoLabel}>Your Peer ID:</Text>
                <Text style={styles.peerIdText}>{localPeerId}</Text>
                <Text style={styles.infoDescription}>Share this ID with others so they can connect to you.</Text>
            </View>

            {/* Connection Form */}
            <View style={styles.connectionForm}>
                <TextInput style={styles.input} placeholder="Enter peer ID to connect" value={targetPeerId} onChangeText={setTargetPeerId} autoCapitalize="none" autoCorrect={false} />
                <TouchableOpacity style={styles.connectButton} onPress={handleConnect}>
                    <Text style={styles.buttonText}>Connect</Text>
                </TouchableOpacity>
            </View>

            {/* Error Messages */}
            {error && (
                <View style={styles.errorContainer}>
                    <Text style={styles.errorText}>{error}</Text>
                </View>
            )}

            {/* Connected Peers */}
            <View style={styles.connectedPeers}>
                <Text style={styles.sectionTitle}>Connected Peers</Text>
                {connectedPeers.length === 0 ? (
                    <Text style={styles.emptyStateText}>No connected peers</Text>
                ) : (
                    <FlatList
                        data={connectedPeers}
                        keyExtractor={(item) => item}
                        renderItem={({ item }) => (
                            <View style={styles.peerItem}>
                                <Text style={styles.peerItemText}>{item}</Text>
                                <TouchableOpacity style={styles.disconnectButton} onPress={() => handleDisconnect(item)}>
                                    <Text style={styles.buttonText}>Disconnect</Text>
                                </TouchableOpacity>
                            </View>
                        )}
                    />
                )}
            </View>

            {/* Messages */}
            <View style={styles.messagesContainer}>
                <Text style={styles.sectionTitle}>Messages</Text>
                <FlatList
                    data={filteredMessages}
                    keyExtractor={(item, index) => `${item.peerId}-${index}`}
                    renderItem={({ item }) => (
                        <View style={[styles.messageItem, item.incoming ? styles.incomingMessage : styles.outgoingMessage]}>
                            <Text style={styles.messageText}>{item.content}</Text>
                            <Text style={styles.messageTimestamp}>{item.timestamp.toLocaleTimeString()}</Text>
                        </View>
                    )}
                    style={styles.messagesList}
                />
            </View>

            {/* Message Input (only visible when connected to at least one peer) */}
            {connectedPeers.length > 0 && (
                <View style={styles.messageInputContainer}>
                    <TextInput ref={messageInputRef} style={styles.messageInput} placeholder="Type a message..." value={messageText} onChangeText={setMessageText} multiline />
                    <TouchableOpacity style={styles.sendButton} onPress={() => handleSendMessage(connectedPeers[0])}>
                        <Text style={styles.buttonText}>Send</Text>
                    </TouchableOpacity>
                </View>
            )}
        </KeyboardAvoidingView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: "#f5f5f5",
        paddingTop: 50,
    },
    loadingContainer: {
        flex: 1,
        justifyContent: "center",
        alignItems: "center",
        backgroundColor: "#f5f5f5",
    },
    loadingText: {
        marginTop: 10,
        fontSize: 16,
        color: "#555",
    },
    header: {
        flexDirection: "row",
        alignItems: "center",
        paddingHorizontal: 16,
        paddingVertical: 10,
        borderBottomWidth: 1,
        borderBottomColor: "#e0e0e0",
        backgroundColor: "#fff",
    },
    backButton: {
        paddingVertical: 8,
        paddingHorizontal: 12,
    },
    backButtonText: {
        fontSize: 16,
        color: "#2196F3",
    },
    title: {
        flex: 1,
        fontSize: 18,
        fontWeight: "bold",
        textAlign: "center",
        marginRight: 40,
    },
    infoSection: {
        backgroundColor: "#fff",
        padding: 16,
        marginHorizontal: 16,
        marginTop: 16,
        borderRadius: 8,
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
        elevation: 2,
    },
    infoLabel: {
        fontSize: 14,
        color: "#666",
        marginBottom: 4,
    },
    peerIdText: {
        fontSize: 18,
        fontWeight: "bold",
        color: "#333",
        marginBottom: 8,
    },
    infoDescription: {
        fontSize: 14,
        color: "#666",
        fontStyle: "italic",
    },
    connectionForm: {
        flexDirection: "row",
        backgroundColor: "#fff",
        padding: 16,
        marginHorizontal: 16,
        marginTop: 16,
        borderRadius: 8,
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
        elevation: 2,
    },
    input: {
        flex: 1,
        height: 40,
        borderWidth: 1,
        borderColor: "#ccc",
        borderRadius: 4,
        paddingHorizontal: 12,
        backgroundColor: "#fff",
        marginRight: 8,
    },
    connectButton: {
        backgroundColor: "#2196F3",
        paddingHorizontal: 16,
        paddingVertical: 8,
        borderRadius: 4,
        justifyContent: "center",
    },
    buttonText: {
        color: "#fff",
        fontWeight: "500",
    },
    errorContainer: {
        backgroundColor: "#ffebee",
        padding: 12,
        marginHorizontal: 16,
        marginTop: 16,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: "#ffcdd2",
    },
    errorText: {
        color: "#d32f2f",
    },
    connectedPeers: {
        backgroundColor: "#fff",
        padding: 16,
        marginHorizontal: 16,
        marginTop: 16,
        borderRadius: 8,
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
        elevation: 2,
        maxHeight: 150,
    },
    sectionTitle: {
        fontSize: 16,
        fontWeight: "bold",
        marginBottom: 8,
        color: "#333",
    },
    emptyStateText: {
        color: "#666",
        fontStyle: "italic",
    },
    peerItem: {
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
        paddingVertical: 8,
        borderBottomWidth: 1,
        borderBottomColor: "#f0f0f0",
    },
    peerItemText: {
        fontSize: 16,
        color: "#333",
    },
    disconnectButton: {
        backgroundColor: "#f44336",
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 4,
    },
    messagesContainer: {
        flex: 1,
        backgroundColor: "#fff",
        padding: 16,
        marginHorizontal: 16,
        marginTop: 16,
        marginBottom: 16,
        borderRadius: 8,
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
        elevation: 2,
    },
    messagesList: {
        flex: 1,
    },
    messageItem: {
        padding: 12,
        borderRadius: 8,
        marginBottom: 8,
        maxWidth: "80%",
    },
    incomingMessage: {
        backgroundColor: "#e3f2fd",
        alignSelf: "flex-start",
    },
    outgoingMessage: {
        backgroundColor: "#e0f7fa",
        alignSelf: "flex-end",
    },
    messageText: {
        fontSize: 16,
        color: "#333",
    },
    messageTimestamp: {
        fontSize: 12,
        color: "#888",
        marginTop: 4,
        alignSelf: "flex-end",
    },
    messageInputContainer: {
        flexDirection: "row",
        backgroundColor: "#fff",
        padding: 16,
        borderTopWidth: 1,
        borderTopColor: "#e0e0e0",
    },
    messageInput: {
        flex: 1,
        minHeight: 40,
        maxHeight: 100,
        borderWidth: 1,
        borderColor: "#ccc",
        borderRadius: 20,
        paddingHorizontal: 16,
        paddingVertical: 8,
        backgroundColor: "#fff",
        marginRight: 8,
    },
    sendButton: {
        backgroundColor: "#2196F3",
        width: 60,
        borderRadius: 20,
        justifyContent: "center",
        alignItems: "center",
    },
});
