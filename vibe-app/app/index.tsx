// index.tsx - The main entry point of the app
import React from "react";
import { useAuth } from "@/components/auth/auth-context";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, Linking, View } from "react-native";

export default function Index() {
    const router = useRouter();
    const { accounts, login } = useAuth();
    const [isReady, setIsReady] = useState(false);

    useEffect(() => {
        const timer = setTimeout(() => {
            setIsReady(true);
        }, 0);

        return () => {
            clearTimeout(timer);
        };
    }, []);

    useEffect(() => {
        if (!isReady) return;

        const handleNavigation = async () => {
            console.log("accounts", JSON.stringify(accounts, null, 2));
            if (accounts.length === 0) {
                router.replace("/accounts/create-account-wizard");
            } else if (accounts.length === 1) {
                // First await the login
                await login(accounts[0].did);
                // Then navigate
                router.replace("/main");
            } else {
                router.replace("/accounts/account-select");
            }
        };

        handleNavigation();
    }, [accounts, isReady]);

    if (!isReady) {
        return (
            <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
                <ActivityIndicator size="large" />
            </View>
        );
    }

    return null;
}
