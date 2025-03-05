// account-select.tsx - Account selection screen
import React, { useState, useMemo } from "react";
import { Appearance, View, Text, TouchableOpacity, StyleSheet, FlatList, Image, Dimensions } from "react-native";
import Svg, { Defs, RadialGradient, Stop, Rect } from "react-native-svg";
import { Account, useAuth } from "@/components/auth/auth-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useThemeColor } from "@/hooks/useThemeColor";
import { SquircleMask } from "@/components/ui/squircle";

const { width, height } = Dimensions.get("window");

export default function AccountSelect() {
    const { accounts, logout, login } = useAuth();
    const router = useRouter();

    const colorScheme = Appearance.getColorScheme();
    const textColor = useThemeColor({}, "text");
    const backgroundColor = useThemeColor({}, "background");
    const iconColor = useThemeColor({}, "icon");

    const handleAccountSelect = async (accountDid: string) => {
        try {
            // await logout(); // don't log out since login can be cancelled
            await login(accountDid);
            router.replace("/main");
        } catch (error) {
            console.log("Error (or cancel) during account switch:", error);
        }
    };

    const handleCreateNewAccount = () => {
        router.push("/accounts/create-account-wizard");
    };

    return (
        <View style={styles.container}>
            {/* Radial Gradient Background */}
            <Svg height={height} width={width} style={StyleSheet.absoluteFill} fill={colorScheme === "light" ? "#FFFFFF" : "#1E293B"}>
                <Defs>
                    {colorScheme === "light" ? (
                        <RadialGradient id="radialGradientLight" cx="0%" cy="0%" r="100%" gradientUnits="userSpaceOnUse">
                            <Stop offset="0" stopColor="rgba(255, 255, 255, 1)" />
                            <Stop offset="0.2" stopColor="rgba(218, 232, 255, 0.26)" />
                            <Stop offset="0.6" stopColor="rgba(255, 255, 255, 0)" />
                        </RadialGradient>
                    ) : (
                        <RadialGradient id="radialGradientDark" cx="0%" cy="0%" r="100%" gradientUnits="userSpaceOnUse">
                            <Stop offset="0" stopColor="rgba(43, 34, 65, 1)" />
                            <Stop offset="0.2" stopColor="rgba(40,19, 109, 1)" />
                            <Stop offset="0.6" stopColor="rgba(15, 23, 42, 1)" />
                        </RadialGradient>
                    )}
                </Defs>
                <Rect width="100%" height="100%" fill={`url(#${colorScheme === "light" ? "radialGradientLight" : "radialGradientDark"})`} />
            </Svg>

            {/* Dark/Light Theme Toggle */}
            <Ionicons
                name="moon"
                size={24}
                color={iconColor}
                style={styles.themeToggle}
                onPress={() => {
                    Appearance.setColorScheme(Appearance.getColorScheme() === "dark" ? "light" : "dark");
                }}
            />

            {/* Header */}
            <View style={styles.header}>
                <Text style={[styles.title, { color: textColor }]}>Who is using Vibe?</Text>
            </View>

            {/* Account List */}
            <View style={styles.accountListContainer}>
                <FlatList
                    data={accounts}
                    keyExtractor={(item) => item.did}
                    numColumns={2}
                    renderItem={({ item, index }) => (
                        <TouchableOpacity style={styles.accountButton} onPress={() => handleAccountSelect(item.did)}>
                            <View style={[styles.accountImageContainer]}>
                                <SquircleMask size={120}>
                                    <Image
                                        source={{
                                            uri: `${item.pictureUrl}?v=${item.updatedAt}`,
                                        }}
                                        style={styles.accountImage}
                                    />
                                </SquircleMask>
                            </View>
                            <Text style={[styles.accountName, { color: textColor }, item.did === "new" ? styles.newAccountText : null]}>{item.name}</Text>
                        </TouchableOpacity>
                    )}
                    contentContainerStyle={styles.accountsGrid}
                />
            </View>

            {/* Test screen */}
            <TouchableOpacity style={styles.adminDashboardButton} onPress={() => router.push("/test/test")}>
                <Ionicons name="cube-outline" size={24} color={textColor} />
                <Text style={[styles.addAccountText, { color: textColor }]}>Admin Dashboard</Text>
            </TouchableOpacity>

            {/* Add New Account Button */}
            <TouchableOpacity style={styles.addAccountButton} onPress={handleCreateNewAccount}>
                <Ionicons name="add" size={24} color={textColor} />
                <Text style={[styles.addAccountText, { color: textColor }]}>Add New Account</Text>
            </TouchableOpacity>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        paddingHorizontal: 16,
        paddingTop: 64,
    },
    header: {
        justifyContent: "center",
        alignItems: "center",
        marginBottom: 46,
    },
    title: {
        fontSize: 30,
        // fontWeight: "bold",
    },
    themeToggle: {
        position: "absolute",
        top: 16,
        right: 16,
    },
    accountListContainer: {
        flex: 1,
        marginBottom: 96 + 32 + 32, // Space for buttons at bottom
    },
    accountsGrid: {
        alignItems: "center",
        justifyContent: "center",
        paddingBottom: 20,
    },
    accountButton: {
        alignItems: "center",
        marginBottom: 16,
        width: (width - 84) / 2, // Adjusted for three items per row
    },
    accountImageContainer: {
        width: 120,
        height: 120,
        justifyContent: "center",
        alignItems: "center",
        marginBottom: 8,
    },
    accountImage: {
        width: "100%",
        height: "100%",
        resizeMode: "cover",
    },
    newAccountContainer: {
        borderWidth: 2,
        borderStyle: "dashed",
        borderColor: "#7C3AED",
    },
    newAccountText: {
        opacity: 0.7,
    },
    accountName: {
        fontSize: 12,
        textAlign: "center",
    },
    adminDashboardButton: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        position: "absolute",
        bottom: 96,
        left: 20,
        right: 20,
        padding: 16,
        backgroundColor: "rgba(58, 112, 237, 0.05)", // Subtle background
        borderRadius: 12,
    },
    addAccountButton: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        position: "absolute",
        bottom: 32,
        left: 20,
        right: 20,
        padding: 16,
        backgroundColor: "rgba(58, 112, 237, 0.05)", // Subtle background
        borderRadius: 12,
    },
    addAccountText: {
        fontSize: 16,
        marginLeft: 8,
        fontWeight: "normal",
    },
});
