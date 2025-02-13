import React from "react";
import { View, Text, Image, StyleSheet, Dimensions, TouchableOpacity, FlatList, Platform, Linking } from "react-native";

// Sample app data - in a real app this would come from the device
const apps = [
    {
        id: "1",
        name: "Shortcuts",
        icon: "https://hebbkx1anhila5yf.public.blob.vercel-storage.com/image-ucKXpMoy4zW6TkA4oos6avt5UjgiOM.png", // Replace with actual icon URL
        scheme: "shortcuts://",
    },
    {
        id: "2",
        name: "1Password",
        icon: "https://hebbkx1anhila5yf.public.blob.vercel-storage.com/image-ucKXpMoy4zW6TkA4oos6avt5UjgiOM.png", // Replace with actual icon URL
        scheme: "1password://",
    },
    // Add more apps as needed
];

const { width } = Dimensions.get("window");
const numColumns = 4;
const tileSize = (width - 48) / numColumns; // 48 = padding (16) * 2 + gap between items (8) * 2

export default function AppGrid() {
    const handleAppPress = async (scheme: string) => {
        try {
            const canOpen = await Linking.canOpenURL(scheme);
            if (canOpen) {
                await Linking.openURL(scheme);
            }
        } catch (error) {
            console.log("Error opening app:", error);
        }
    };

    const renderApp = ({ item }: { item: (typeof apps)[0] }) => (
        <TouchableOpacity style={styles.appTile} onPress={() => handleAppPress(item.scheme)} activeOpacity={0.7}>
            <View style={styles.iconContainer}>
                <Image source={{ uri: item.icon }} style={styles.icon} />
            </View>
            <Text style={styles.appName} numberOfLines={1}>
                {item.name}
            </Text>
        </TouchableOpacity>
    );

    return (
        <View style={styles.container}>
            <FlatList data={apps} renderItem={renderApp} keyExtractor={(item) => item.id} numColumns={numColumns} contentContainerStyle={styles.grid} />
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: "transparent",
    },
    grid: {
        padding: 16,
    },
    appTile: {
        width: tileSize,
        aspectRatio: 1,
        alignItems: "center",
        marginBottom: 16,
    },
    iconContainer: {
        width: tileSize * 0.8,
        height: tileSize * 0.8,
        borderRadius: 16,
        overflow: "hidden",
        ...Platform.select({
            ios: {
                shadowColor: "#000",
                shadowOffset: { width: 0, height: 2 },
                shadowOpacity: 0.1,
                shadowRadius: 4,
            },
            android: {
                elevation: 4,
            },
        }),
    },
    icon: {
        width: "100%",
        height: "100%",
        resizeMode: "cover",
    },
    appName: {
        marginTop: 4,
        fontSize: 12,
        textAlign: "center",
        color: "#000",
        width: "100%",
    },
});
