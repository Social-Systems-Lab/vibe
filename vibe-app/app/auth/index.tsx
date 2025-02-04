import React, { useEffect } from "react";
import { useRouter, useSearchParams } from "expo-router";
import { View, Text, Button, Alert, Linking } from "react-native";

export default function AuthScreen() {
    const router = useRouter();
    const { callback, appId } = useSearchParams();

    useEffect(() => {
        if (!callback || !appId) {
            Alert.alert("Error", "Invalid deep link parameters.");
            router.replace("/");
        }
    }, [callback, appId]);

    const handleSignIn = () => {
        // Simulate sign-in process
        console.log(`Signing in with appId: ${appId}`);

        // Redirect back to the callback URL with a success status
        const successUrl = `${callback}?status=success&appId=${appId}`;
        Linking.openURL(successUrl);
    };

    return (
        <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
            <Text>Signing into {appId}...</Text>
            <Button title="Sign In" onPress={handleSignIn} />
        </View>
    );
}
