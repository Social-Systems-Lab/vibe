// top-bar.tsx - Shows address bar, profile icon, etc.
import React, { useRef } from "react";
import { View, TextInput, TouchableOpacity, Image, StyleSheet } from "react-native";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { useAuth } from "../auth/auth-context";
import { SquircleIcon, SquircleMask } from "./squircle";

interface TopBarProps {
    urlInput: string;
    onChangeUrl: (value: string) => void;
    onSubmitUrl: () => void;
    onScanQr: () => void;
    onProfilePress: () => void;
}

export default function TopBar({ urlInput, onChangeUrl, onSubmitUrl, onScanQr, onProfilePress }: TopBarProps) {
    const { currentAccount } = useAuth();
    const inputRef = useRef<TextInput>(null);

    return (
        <View style={styles.header}>
            <TextInput
                ref={inputRef}
                style={styles.urlInput}
                value={urlInput}
                onChangeText={onChangeUrl}
                onSubmitEditing={onSubmitUrl}
                placeholder="Enter URL"
                keyboardType="url"
                autoCapitalize="none"
                onFocus={() => inputRef.current?.setSelection(0, urlInput.length)}
            />
            <TouchableOpacity onPress={onScanQr}>
                <View style={styles.qrCodeIcon}>
                    <MaterialCommunityIcons name="qrcode-scan" size={20} color="black" />
                </View>
            </TouchableOpacity>

            <TouchableOpacity onPress={onProfilePress}>
                <SquircleMask size={36}>
                    <Image
                        source={
                            currentAccount
                                ? {
                                      uri: `${currentAccount?.pictureUrl}?v=${currentAccount?.updatedAt}`,
                                  }
                                : require("@/assets/images/default-picture.png")
                        }
                        style={styles.profileIcon}
                    />
                </SquircleMask>
            </TouchableOpacity>
        </View>
    );
}

const styles = StyleSheet.create({
    header: {
        height: 50,
        flexDirection: "row",
        alignItems: "center",
        paddingHorizontal: 10,
        backgroundColor: "#fff",
        justifyContent: "space-between",
    },
    urlInput: {
        flex: 1,
        height: 40,
        marginRight: 10,
        paddingHorizontal: 14,
        borderRadius: 38,
        backgroundColor: "#f3f4f6",
    },
    qrCodeIcon: {
        width: 36,
        height: 36,
        borderRadius: 26,
        marginRight: 10,
        backgroundColor: "#f1f1f1",
        justifyContent: "center",
        alignItems: "center",
    },
    profileIcon: {
        width: 36,
        height: 36,
    },
});
