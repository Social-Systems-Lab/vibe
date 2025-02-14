//qr-scanner.tsx
import { useAuth } from "@/components/auth/auth-context";
import { Overlay } from "@/components/ui/overlay";
import { CameraView } from "expo-camera";
import { useRouter } from "expo-router";
import React from "react";
import { View, StyleSheet, Platform } from "react-native";

export default function QRScanner() {
    const { accounts, currentAccount, createAccount, signChallenge, initialized } = useAuth();
    const router = useRouter();

    return (
        <View style={styles.container}>
            <CameraView
                style={StyleSheet.absoluteFillObject}
                facing="back"
                onBarcodeScanned={async ({ data }) => {
                    console.log("data", data);
                    try {
                        const parsedData = JSON.parse(data);
                        console.log("parsedData", parsedData);

                        if (parsedData.challenge) {
                            await signChallenge(parsedData.challenge, []);
                            router.back();
                        }
                    } catch (error) {
                        console.error("Error parsing data", error);
                    }
                }}
            />
            <Overlay />
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        justifyContent: "center",
        alignItems: "center",
    },
});
