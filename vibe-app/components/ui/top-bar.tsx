// top-bar.tsx - Shows address bar, profile icon, etc.
import React from "react";
import { View, TextInput, TouchableOpacity, Image, StyleSheet } from "react-native";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";

interface TopBarProps {
    urlInput: string;
    onChangeUrl: (value: string) => void;
    onSubmitUrl: () => void;
    onScanQr: () => void;
    onProfilePress: () => void;
}

export default function TopBar({ urlInput, onChangeUrl, onSubmitUrl, onScanQr, onProfilePress }: TopBarProps) {
    return (
        <View style={styles.header}>
            <TextInput
                style={styles.urlInput}
                value={urlInput}
                onChangeText={onChangeUrl}
                onSubmitEditing={onSubmitUrl}
                placeholder="Enter URL"
                keyboardType="url"
                autoCapitalize="none"
            />
            <TouchableOpacity onPress={onScanQr}>
                <View style={styles.qrCodeIcon}>
                    <MaterialCommunityIcons name="qrcode-scan" size={20} color="black" />
                </View>
            </TouchableOpacity>

            <TouchableOpacity onPress={onProfilePress}>
                <Image source={require("../../assets/images/picture3.jpg")} style={styles.profileIcon} />
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
        borderRadius: 26,
    },
});
