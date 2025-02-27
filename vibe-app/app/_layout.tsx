//_layout.tsx - The main layout of the app with the router and context providers
import React, { useEffect } from "react";
import { AuthProvider } from "@/components/auth/auth-context";
import { Stack, useRouter } from "expo-router";
import { WebViewProvider } from "@/components/ui/web-view-context";
import { Linking, StatusBar, useColorScheme } from "react-native";
import { TabsProvider } from "@/components/ui/tab-context";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { DbProvider } from "@/components/db/db-context";

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
        const parsedUrl = new URL(url);
        const path = parsedUrl.pathname.replace(/^\//, ""); // Remove leading "/"
        const queryParams = Object.fromEntries(parsedUrl.searchParams.entries());

        if (path === "auth") {
            const { callback, appId } = queryParams || {};
            if (callback && appId) {
                // Navigate to a specific screen with deep link parameters
                router.replace(`/auth?callback=${callback}&appId=${appId}`);
            }
        }
    };

    return (
        <WebViewProvider>
            <TabsProvider>
                <DbProvider>
                    <AuthProvider>
                        <GestureHandlerRootView>
                            <StatusBar
                                backgroundColor={colorScheme === "light" ? "#FFFFFF" : "#1E293B"}
                                barStyle={colorScheme === "light" ? "dark-content" : "light-content"}
                                translucent={false}
                            />
                            <Stack screenOptions={{ headerShown: false }}>
                                <Stack.Screen name="index" />
                            </Stack>
                        </GestureHandlerRootView>
                    </AuthProvider>
                </DbProvider>
            </TabsProvider>
        </WebViewProvider>
    );
}
