// tab-select.tsx
import React from "react";
import { View, Text, FlatList, TouchableOpacity, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import { TabInfo, useTabs } from "../../components/ui/tab-context";

export default function TabSelect() {
    const router = useRouter();
    const { tabs, activeTabId, closeTab, setActiveTabId, addTab } = useTabs();

    const selectTab = (id: string) => {
        setActiveTabId(id);
        router.back(); // go back to main screen
    };

    const newTab = () => {
        addTab({ title: "Home", type: "home", url: "Home" });
        router.back();
    };

    const renderTab = ({ item }: { item: TabInfo }) => {
        return (
            <TouchableOpacity style={styles.tabCard} onPress={() => selectTab(item.id)}>
                <View style={styles.cardHeader}>
                    <Text>{item.title}</Text>
                    <TouchableOpacity onPress={() => closeTab(item.id)}>
                        <Text style={styles.closeButton}>X</Text>
                    </TouchableOpacity>
                </View>
                {/* You could show a screenshot or preview here */}
                <View style={styles.preview}>
                    <Text>{item.type === "home" ? "Home Screen" : "WebView"}</Text>
                </View>
            </TouchableOpacity>
        );
    };

    return (
        <View style={{ flex: 1, backgroundColor: "#fff" }}>
            <FlatList
                data={tabs}
                keyExtractor={(item) => item.id}
                renderItem={renderTab}
                numColumns={2}
                columnWrapperStyle={{ justifyContent: "space-around" }}
                contentContainerStyle={{ paddingTop: 40 }}
            />
            <TouchableOpacity style={styles.newTabButton} onPress={newTab}>
                <Text style={styles.newTabText}>+</Text>
            </TouchableOpacity>
        </View>
    );
}

const styles = StyleSheet.create({
    tabCard: {
        backgroundColor: "#f7f7f7",
        width: "42%",
        marginBottom: 20,
        borderRadius: 8,
        overflow: "hidden",
    },
    cardHeader: {
        flexDirection: "row",
        justifyContent: "space-between",
        padding: 8,
        backgroundColor: "#ddd",
    },
    closeButton: {
        color: "red",
        fontWeight: "bold",
    },
    preview: {
        height: 80,
        justifyContent: "center",
        alignItems: "center",
    },
    newTabButton: {
        position: "absolute",
        right: 20,
        bottom: 30,
        width: 50,
        height: 50,
        backgroundColor: "#007bff",
        borderRadius: 25,
        justifyContent: "center",
        alignItems: "center",
    },
    newTabText: {
        fontSize: 28,
        color: "#fff",
    },
});
