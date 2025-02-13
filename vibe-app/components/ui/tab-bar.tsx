// TabBar.tsx
import React from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useTabs } from "./tab-context";

export default function TabBar() {
    const { tabs, addTab, closeTab, activeTabId, setActiveTabId } = useTabs();
    const router = useRouter();

    const tabCount = tabs.length;

    const goHome = () => {
        // If Home tab is already present, just activate it
        const homeTab = tabs.find((t) => t.type === "home");
        if (homeTab) {
            setActiveTabId(homeTab.id);
        } else {
            addTab({ title: "Home", type: "home", url: "Home" });
        }
    };

    return (
        <View style={styles.bar}>
            <TouchableOpacity onPress={goHome}>
                <Ionicons name="home-outline" size={26} color="#333" />
            </TouchableOpacity>
            <TouchableOpacity
                style={styles.tabCount}
                onPress={() => {
                    // Go to the screen that shows all tabs in a grid
                    router.push("/main/tab-select");
                }}
            >
                <Text>{tabCount}</Text>
            </TouchableOpacity>
        </View>
    );
}

const styles = StyleSheet.create({
    bar: {
        height: 50,
        backgroundColor: "#f1f1f1",
        flexDirection: "row",
        justifyContent: "space-around",
        alignItems: "center",
    },
    tabCount: {
        width: 36,
        height: 36,
        borderRadius: 18,
        backgroundColor: "#ddd",
        justifyContent: "center",
        alignItems: "center",
    },
});
