// index.tsx - The main entry point of the app
import React from "react";
import { useAuth } from "@/components/auth/auth-context";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, View } from "react-native";

export default function Index() {
    const router = useRouter();
    const { accounts } = useAuth();
    const [isReady, setIsReady] = useState(false);

    useEffect(() => {
        const timer = setTimeout(() => {
            setIsReady(true);
        }, 0);

        return () => clearTimeout(timer);
    }, []);

    useEffect(() => {
        if (isReady) {
            // navigate to test screen for now
            router.replace("/accounts/test");

            // TODO main account flow will look something like this
            // if (accounts.length === 0) {
            //     // show account creation wizard
            //     router.replace("/accounts/test");
            //     //router.replace("/accounts/create-account-wizard");
            // } else if (accounts.length === 1) {
            //     // log into the only account
            //     router.replace("/main");
            // } else {
            //     // show account selection screen
            //     router.replace("/accounts/account-select");
            // }
        }
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
