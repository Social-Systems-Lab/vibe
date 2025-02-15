// tab-select.tsx - Shows all tabs in a grid and allows the user to select a tab.
import React from "react";
import { View, Text, FlatList, TouchableOpacity, StyleSheet, Image, Dimensions } from "react-native";
import { useRouter } from "expo-router";
import { TabInfo, useTabs } from "../../components/ui/tab-context";
import { Ionicons } from "@expo/vector-icons";

export default function TabSelect() {
    const router = useRouter();
    const { tabs, activeTabId, closeTab, setActiveTabId, addTab } = useTabs();

    const screenWidth = Dimensions.get("window").width;
    const screenHeight = Dimensions.get("window").height;
    const numColumns = 2;
    const gap = 10;

    const availableSpace = screenWidth - (numColumns - 1) * gap - 2 * gap;
    const itemWidth = availableSpace / numColumns;

    const selectTab = (id: string) => {
        setActiveTabId(id);
        router.back();
    };

    const newTab = () => {
        addTab({ title: "Home", type: "home", url: "Home" });
        router.back();
    };

    const renderTab = ({ item }: { item: TabInfo }) => {
        const isActive = item.id === activeTabId;

        return (
            <TouchableOpacity
                style={[
                    styles.tabCard,
                    isActive && styles.activeTab,
                    {
                        width: itemWidth,
                    },
                ]}
                onPress={() => selectTab(item.id)}
            >
                <View style={[styles.cardHeader, isActive && styles.activeCardHeader]}>
                    <Text style={[styles.tabTitle, isActive && styles.activeTabTitle]} numberOfLines={1} ellipsizeMode="tail">
                        {item.title}
                    </Text>
                    <TouchableOpacity
                        onPress={(event) => {
                            event.stopPropagation();
                            closeTab(item.id);
                        }}
                    >
                        <Ionicons name="close" size={20} color={isActive ? "white" : "#333"} />
                    </TouchableOpacity>
                </View>
                <View style={styles.preview}>
                    {item.screenshotUri ? (
                        <View style={styles.screenshotContainer}>
                            <Image
                                source={{ uri: item.screenshotUri }}
                                style={{
                                    transform: [{ translateY: -(itemWidth * (50 / screenWidth)) }],
                                }}
                                width={itemWidth}
                                height={itemWidth * (screenHeight / screenWidth)}
                                resizeMode="stretch"
                            />
                        </View>
                    ) : (
                        <View style={styles.noScreenshot}>
                            <Text style={{ color: "#888" }}>No preview</Text>
                        </View>
                    )}
                </View>
            </TouchableOpacity>
        );
    };

    return (
        <View style={[styles.container, { padding: gap }]}>
            <FlatList
                data={tabs}
                keyExtractor={(item) => item.id}
                renderItem={renderTab}
                numColumns={2}
                columnWrapperStyle={{ gap }}
                contentContainerStyle={{ gap }}
            />
            <TouchableOpacity style={styles.newTabButton} onPress={newTab}>
                <Text style={styles.newTabText}>+</Text>
            </TouchableOpacity>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: "#fff" },
    tabCard: {
        backgroundColor: "#f7f7f7",
        borderRadius: 10,
        overflow: "hidden",
        borderWidth: 2,
        borderColor: "white",
    },
    activeTab: {
        borderColor: "#007AFF",
    },
    cardHeader: {
        flexDirection: "row",
        justifyContent: "space-between",
        padding: 8,
        backgroundColor: "#ddd",
    },
    activeCardHeader: {
        backgroundColor: "#007AFF",
        color: "white",
    },
    tabTitle: {
        flex: 1,
        marginRight: 6,
    },
    activeTabTitle: {
        color: "white",
    },
    closeButton: {
        color: "red",
        fontWeight: "bold",
    },
    preview: {
        width: "100%",
        height: 120,
        backgroundColor: "#eee",
    },
    screenshotContainer: {
        flex: 1,
        overflow: "hidden",
        justifyContent: "flex-start",
    },
    noScreenshot: {
        flex: 1,
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
