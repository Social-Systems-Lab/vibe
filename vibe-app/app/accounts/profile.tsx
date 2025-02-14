// profile.tsx - The profile screen that shows user details and actions.
import React from "react";
import { View, Text, Image, StyleSheet, ScrollView, TouchableOpacity } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "@/components/auth/auth-context";
import Constants from "expo-constants";

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
                    <Image
                        source={
                            currentAccount.pictureUrl
                                ? { uri: `${currentAccount.pictureUrl}?v=${currentAccount.updatedAt}` }
                                : require("@/assets/images/default-picture.png")
                        }
                        style={styles.profileImage}
                    />
                    <View style={styles.profileTextContainer}>
                        <View style={styles.profileTextRow}>
                            <Text style={styles.profileName}>{currentAccount.name}</Text>
                        </View>
                        <Text style={styles.profileDid} numberOfLines={1} ellipsizeMode="tail">
                            {currentAccount.did}
                        </Text>
                    </View>
                </TouchableOpacity>

                {/* Menu Items */}
                <View style={styles.menuContainer}>
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
        borderRadius: 35,
        backgroundColor: "#ccc",
        marginRight: 16,
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
    menuContainer: {
        marginTop: 4,
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
