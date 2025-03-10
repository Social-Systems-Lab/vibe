// main/index.tsx - The main app screen with tabs and browser functionality
import React, { useState, useEffect } from "react";
import { View, StyleSheet, Alert } from "react-native";
import { useTabs } from "../../components/ui/tab-context";
import { useRouter } from "expo-router";
import { useCameraPermissions } from "expo-camera";

import TopBar from "../../components/ui/top-bar";
import TabBar from "../../components/ui/tab-bar";
import HomeScreen from "../../components/ui/home-screen";
import BrowserTab from "../../components/ui/browser-tab";

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
            if (activeTab.url === urlInput) {
                // if URL is the same, force a reload
                const reloadTab = tabs.map((t) => (t.id === activeTabId ? { ...t, reload: Date.now() } : t));
                setTabs(reloadTab);
            }

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
            <TabBar />
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: "white",
    },
});
