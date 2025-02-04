//_layout.tsx
import React, { useEffect } from "react";
import { AuthProvider } from "@/components/auth/auth-context";
import { Stack, useRouter } from "expo-router";
import { WebViewProvider } from "@/components/ui/web-view-context";
import { Linking, StatusBar, useColorScheme } from "react-native";

export default function RootLayout() {
    const colorScheme = useColorScheme();
    const router = useRouter();

    useEffect(() => {
        // handle deep links
        Linking.getInitialURL().then((url) => {
            if (url) {
                handleDeepLink(url);
            }
        });

        // listen for deep links while the app is running
        const subscription = Linking.addEventListener("url", (event) => {
            handleDeepLink(event.url);
        });

        return () => {
            subscription.remove();
        };
    }, []);

    const handleDeepLink = (url: string) => {
        const parsed = Linking.parse(url);

        if (parsed.path === "auth") {
            const { callback, appId } = parsed.queryParams || {};
            if (callback && appId) {
                // Navigate to a specific screen with deep link parameters
                router.replace(`/auth?callback=${callback}&appId=${appId}`);
            }
        }
    };

    return (
        <WebViewProvider>
            <AuthProvider>
                <StatusBar
                    backgroundColor={colorScheme === "light" ? "#FFFFFF" : "#1E293B"}
                    barStyle={colorScheme === "light" ? "dark-content" : "light-content"}
                    translucent={false}
                />
                <Stack screenOptions={{ headerShown: false }}>
                    <Stack.Screen name="index" />
                </Stack>
            </AuthProvider>
        </WebViewProvider>
    );
}
