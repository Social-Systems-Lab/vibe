// profile.tsx - The profile screen that shows user details and actions.
import React from "react";
import { View, Text, Image, StyleSheet, ScrollView, TouchableOpacity } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "@/components/auth/auth-context";
import Constants from "expo-constants";
import { SquircleMask } from "@/components/ui/squircle";

export default function ProfileScreen() {
    const router = useRouter();
    const { currentAccount, logout } = useAuth();
    const appVersion = Constants.expoConfig?.version || "1.0.0";

    if (!currentAccount) {
        return (
            <View style={styles.noAccountContainer}>
                <Text style={styles.noAccountText}>No account selected.</Text>
            </View>
        );
    }

    const handleSwitchAccount = () => {
        router.push("/accounts/account-select");
    };

    const handleLogout = async () => {
        await logout();
        router.replace("/accounts/account-select");
    };

    return (
        <View style={styles.container}>
            <ScrollView contentContainerStyle={styles.scrollContent}>
                {/* Clickable Profile Header */}
                <TouchableOpacity style={styles.profileInfoContainer} onPress={() => router.push("/accounts/edit-profile")}>
                    <SquircleMask size={70} style={{ marginRight: 16 }}>
                        <Image
                            source={
                                currentAccount.pictureUrl
                                    ? { uri: `${currentAccount.pictureUrl}?v=${currentAccount.updatedAt}` }
                                    : require("@/assets/images/default-picture.png")
                            }
                            style={styles.profileImage}
                        />
                    </SquircleMask>
                    <View style={styles.profileTextContainer}>
                        <View style={styles.profileTextRow}>
                            <Text style={styles.profileName}>{currentAccount.name}</Text>
                        </View>
                        <Text style={styles.profileDid} numberOfLines={1} ellipsizeMode="tail">
                            {currentAccount.did}
                        </Text>
                    </View>
                </TouchableOpacity>

                {/* Server Status */}
                <View style={styles.sectionContainer}>
                    <Text style={styles.sectionTitle}>Server Connection</Text>
                    <View style={styles.serverInfoContainer}>
                        <View style={styles.serverNameContainer}>
                            <Text style={styles.serverName}>
                                {currentAccount.server?.name || 'No server configured'}
                            </Text>
                            <Text style={styles.serverUrl} numberOfLines={1} ellipsizeMode="tail">
                                {currentAccount.server?.url || ''}
                            </Text>
                        </View>
                        <View style={[
                            styles.connectionIndicator,
                            currentAccount.server?.isConnected ? styles.connected : styles.disconnected
                        ]} />
                    </View>
                </View>
                
                {/* Menu Items */}
                <View style={styles.menuContainer}>
                    <MenuItem iconName="cloud-outline" label="Server Settings" onPress={() => router.push("/accounts/server-settings")} />
                    <MenuItem iconName="swap-horizontal-outline" label="Switch Account" onPress={handleSwitchAccount} />
                    <MenuItem iconName="log-out-outline" label="Log Out" onPress={handleLogout} />
                </View>
            </ScrollView>

            {/* Footer with App Version */}
            <View style={styles.footer}>
                <Text style={styles.versionText}>Vibe {appVersion}</Text>
            </View>
        </View>
    );
}

function MenuItem({ iconName, label, onPress }: { iconName: keyof typeof Ionicons.glyphMap; label: string; onPress: () => void }) {
    return (
        <TouchableOpacity style={styles.menuItem} onPress={onPress}>
            <View style={styles.menuItemLeft}>
                <Ionicons name={iconName} size={28} color="#333" style={styles.menuItemIcon} />
                <Text style={styles.menuItemText}>{label}</Text>
            </View>
            <Ionicons name="chevron-forward-outline" size={20} color="#999" />
        </TouchableOpacity>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: "#FFF",
    },
    scrollContent: {
        paddingBottom: 40,
    },
    noAccountContainer: {
        flex: 1,
        justifyContent: "center",
        alignItems: "center",
    },
    noAccountText: {
        fontSize: 18,
        color: "#888",
    },
    profileInfoContainer: {
        flexDirection: "row",
        padding: 20,
        alignItems: "center",
        backgroundColor: "#f9f9f9",
    },
    profileImage: {
        width: 70,
        height: 70,
        backgroundColor: "#ccc",
    },
    profileTextContainer: {
        flex: 1,
    },
    profileTextRow: {
        flexDirection: "row",
        alignItems: "center",
        marginBottom: 4,
    },
    profileName: {
        fontSize: 18,
        fontWeight: "bold",
        flexShrink: 1,
    },
    profileDid: {
        fontSize: 13,
        color: "#666",
    },
    sectionContainer: {
        marginTop: 20,
        paddingHorizontal: 20,
    },
    sectionTitle: {
        fontSize: 18,
        fontWeight: "600",
        marginBottom: 10,
    },
    serverInfoContainer: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        padding: 16,
        backgroundColor: "#f9f9f9",
        borderRadius: 8,
        borderWidth: 1,
        borderColor: "#eee",
    },
    serverNameContainer: {
        flex: 1,
    },
    serverName: {
        fontSize: 16,
        fontWeight: "600",
    },
    serverUrl: {
        fontSize: 13,
        color: "#666",
        marginTop: 4,
    },
    connectionIndicator: {
        width: 12,
        height: 12,
        borderRadius: 6,
        marginLeft: 8,
    },
    connected: {
        backgroundColor: "#4CAF50",
    },
    disconnected: {
        backgroundColor: "#F44336",
    },
    menuContainer: {
        marginTop: 20,
    },
    menuItem: {
        flexDirection: "row",
        alignItems: "center",
        paddingVertical: 20, // More spacious
        paddingHorizontal: 20,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: "#ccc",
        justifyContent: "space-between",
    },
    menuItemLeft: {
        flexDirection: "row",
        alignItems: "center",
    },
    menuItemIcon: {
        marginRight: 18,
    },
    menuItemText: {
        fontSize: 16,
        color: "#333",
    },
    footer: {
        paddingVertical: 0,
        alignItems: "center",
        borderTopWidth: StyleSheet.hairlineWidth,
        borderTopColor: "#ccc",
        backgroundColor: "#fff",
    },
    versionText: {
        textAlign: "center",
        fontSize: 12,
        color: "#aaa",
        marginTop: 10,
        marginBottom: 10,
    },
});
