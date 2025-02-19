import React, { useState, useRef } from "react";
import { View, Text, TouchableOpacity, StyleSheet, FlatList, Dimensions, Animated } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useTabs } from "./tab-context";
import { useAppService } from "../app/app-service-context";
import { InstalledApp } from "@/types/types";
import { SquircleIcon } from "./squircle";
import { PanGestureHandler, State } from "react-native-gesture-handler";

const { width, height } = Dimensions.get("window");
const SWIPE_THRESHOLD = width / 5;

export default function HomeScreen() {
    const { addTab } = useTabs();
    const { installedApps } = useAppService();
    const [currentPage, setCurrentPage] = useState(0);
    const translateX = useRef(new Animated.Value(0)).current;
    const lastOffset = useRef(0);
    const startX = useRef(0);
    const appsPerPage = 12;
    const totalPages = 3; // Ensure there are always 3 pages
    const pages = Array.from({ length: totalPages }, (_, i) => installedApps.slice(i * appsPerPage, (i + 1) * appsPerPage));

    const openApp = (appUrl: string, appName: string) => {
        addTab({ title: appName, type: "webview", url: appUrl });
    };

    const onPanGestureEvent = Animated.event([{ nativeEvent: { translationX: translateX } }], {
        useNativeDriver: false,
        listener: (event: any) => {
            translateX.setValue(lastOffset.current + event.nativeEvent.translationX);
        },
    });

    const onPanStateChange = (event: any) => {
        if (event.nativeEvent.state === State.BEGAN) {
            startX.current = event.nativeEvent.translationX;
        }

        if (event.nativeEvent.state === State.END) {
            const { translationX } = event.nativeEvent;
            const movedDistance = translationX;
            let newOffset = lastOffset.current;
            let newPage = currentPage;

            if (movedDistance < -SWIPE_THRESHOLD && currentPage < totalPages - 1) {
                newOffset -= width;
                newPage++;
            } else if (movedDistance > SWIPE_THRESHOLD && currentPage > 0) {
                newOffset += width;
                newPage--;
            }

            lastOffset.current = newOffset;
            setCurrentPage(newPage);
            Animated.timing(translateX, {
                toValue: newOffset,
                duration: 300,
                useNativeDriver: true,
            }).start();
        }
    };

    return (
        <LinearGradient colors={["#7038e4", "#c86dd7", "#ffafbd"]} style={styles.container}>
            <PanGestureHandler onGestureEvent={onPanGestureEvent} onHandlerStateChange={onPanStateChange}>
                <Animated.View style={[styles.pagesContainer, { transform: [{ translateX }] }]}>
                    {pages.map((apps, pageIndex) => (
                        <View key={pageIndex} style={styles.page}>
                            <FlatList
                                data={apps}
                                renderItem={({ item }) => (
                                    <TouchableOpacity style={styles.appTile} onPress={() => openApp(item.url, item.name)}>
                                        <SquircleIcon uri={item.iconUrl} size={56} />
                                        <Text style={styles.label} numberOfLines={1}>
                                            {item.name}
                                        </Text>
                                    </TouchableOpacity>
                                )}
                                keyExtractor={(item) => item.appId}
                                numColumns={4}
                                contentContainerStyle={styles.gridContent}
                            />
                        </View>
                    ))}
                </Animated.View>
            </PanGestureHandler>
            <View style={styles.paginationContainer}>
                {Array.from({ length: totalPages }).map((_, index) => (
                    <View key={index} style={[styles.dot, currentPage === index && styles.activeDot]} />
                ))}
            </View>
        </LinearGradient>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    pagesContainer: {
        flexDirection: "row",
        width: width * 3,
        flex: 1,
    },
    page: {
        width,
        height,
        alignItems: "flex-start", // Align items to the top-left
        justifyContent: "flex-start",
        padding: 0,
    },
    gridContent: {
        paddingHorizontal: 16,
        paddingTop: 20,
        paddingBottom: 16,
    },
    appTile: {
        alignItems: "center",
        justifyContent: "center",
        width: 80,
        margin: 8,
    },
    label: {
        marginTop: 4,
        color: "#fff",
        fontSize: 12,
        textAlign: "center",
    },
    paginationContainer: {
        flexDirection: "row",
        justifyContent: "center",
        paddingVertical: 10,
    },
    dot: {
        width: 8,
        height: 8,
        borderRadius: 4,
        backgroundColor: "rgba(255, 255, 255, 0.5)",
        marginHorizontal: 5,
    },
    activeDot: {
        backgroundColor: "#fff",
    },
});
