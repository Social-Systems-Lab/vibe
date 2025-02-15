// main/index.tsx - The main app screen with tabs and browser functionality
import React, { useState, useEffect, useRef, useCallback } from "react";
import { View, StyleSheet, Alert, findNodeHandle } from "react-native";
import { useTabs } from "../../components/ui/tab-context";
import { useRouter } from "expo-router";
import { useCameraPermissions } from "expo-camera";
import { captureScreen } from "react-native-view-shot";

import TopBar from "../../components/ui/top-bar";
import TabBar from "../../components/ui/tab-bar";
import HomeScreen from "../../components/ui/home-screen";
import BrowserTab from "../../components/ui/browser-tab";
import { Text } from "react-native";

export default function MainApp() {
    const router = useRouter();
    const [permission, requestPermission] = useCameraPermissions();

    const { tabs, setTabs, activeTabId, addTab, updateTabScreenshot } = useTabs();
    const activeTab = tabs.find((t) => t.id === activeTabId);

    // For the address bar input
    const [urlInput, setUrlInput] = useState(activeTab?.url ?? "");

    // On "Enter" in the address bar
    const handleSubmitUrl = () => {
        if (!urlInput) return;

        if (!activeTab) {
            // If no active tab at all (edge case), create a new web tab
            addTab({ title: urlInput, type: "webview", url: urlInput });
            return;
        }

        if (activeTab.type === "home") {
            // If we're on the home tab, open a brand new web tab with the given URL
            addTab({ title: urlInput, type: "webview", url: urlInput });
        } else {
            // Update the existing web tab's URL
            const updatedTabs = tabs.map((t) => (t.id === activeTabId ? { ...t, title: urlInput, url: urlInput } : t));
            setTabs(updatedTabs);
        }
    };

    // QR code scanner
    const handleScanQr = async () => {
        if (!permission?.granted) {
            const res = await requestPermission();
            if (!res.granted) {
                Alert.alert("Permission denied", "Cannot scan QR without camera permission.");
                return;
            }
        }
        // Navigate to your scanner screen
        router.push("/main/qr-scanner");
    };

    // Profile icon press
    const handleProfilePress = () => {
        router.push("/accounts/profile");
    };

    // Sync the address bar whenever the active tab changes
    useEffect(() => {
        if (activeTab?.type === "webview") {
            setUrlInput(activeTab.url);
        } else {
            setUrlInput("Home");
        }
    }, [activeTab]);

    const captureActiveTabScreenshot = useCallback(async () => {
        if (!activeTab) return;

        try {
            // const uri = await captureScreen({
            //     format: "png",
            //     quality: 0.5,
            // });
            // store in tab context
            //updateTabScreenshot(activeTab.id, uri);
        } catch (error) {
            console.error("Screenshot failed:", error);
        }
    }, [activeTab, updateTabScreenshot]);

    return (
        <View style={styles.container}>
            {/* Always-on top bar with address input & icons */}
            <TopBar urlInput={urlInput} onChangeUrl={setUrlInput} onSubmitUrl={handleSubmitUrl} onScanQr={handleScanQr} onProfilePress={handleProfilePress} />

            {/* Here we render ALL tabs but only show the active one */}
            <View style={{ flex: 1 }}>
                {tabs.map((tab) => {
                    const isActive = tab.id === activeTabId;
                    return (
                        <View
                            key={tab.id}
                            style={{
                                flex: 1,
                                display: isActive ? "flex" : "none",
                            }}
                        >
                            {tab.type === "home" ? <HomeScreen /> : <BrowserTab tab={tab} />}
                        </View>
                    );
                })}
            </View>

            {/* Bottom bar with tab switching, etc. */}
            <TabBar captureActiveTabScreenshot={captureActiveTabScreenshot} />
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: "white",
    },
});
