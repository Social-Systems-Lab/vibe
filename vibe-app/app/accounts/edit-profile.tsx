import React, { useState } from "react";
import { View, Text, StyleSheet, Alert, Image, TouchableOpacity, Modal, TextInput, Button } from "react-native";
import * as ImagePicker from "expo-image-picker";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "@/components/auth/auth-context";
import { SquircleMask } from "@/components/ui/squircle";

export default function EditProfileScreen() {
    const router = useRouter();
    const { currentAccount, updateAccount } = useAuth();

    const [displayName, setDisplayName] = useState(currentAccount?.name || "");
    const [pictureUri, setPictureUri] = useState(currentAccount?.pictureUrl ? `${currentAccount?.pictureUrl}?v=${currentAccount?.updatedAt}` : "");
    const [loading, setLoading] = useState(false);

    // For editing name in a modal
    const [editNameVisible, setEditNameVisible] = useState(false);
    const [tempName, setTempName] = useState(displayName);

    if (!currentAccount) {
        return (
            <View style={styles.noAccountContainer}>
                <Text>No account selected.</Text>
            </View>
        );
    }

    // Immediately update the account when a new image is picked
    const pickImage = async () => {
        const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (status !== "granted") {
            Alert.alert("Permission required", "Camera roll permissions are needed to select a profile picture.");
            return;
        }
        const result = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ["images"],
            allowsEditing: true,
            aspect: [1, 1],
            quality: 0.5,
        });
        if (!result.canceled && result.assets[0].uri) {
            const newUri = result.assets[0].uri;
            setPictureUri(newUri);
            setLoading(true);
            try {
                await updateAccount(currentAccount.did, undefined, newUri);
            } catch (err) {
                console.error(err);
                Alert.alert("Error", "Failed to update profile picture.");
            } finally {
                setLoading(false);
            }
        }
    };

    // Name editing: open the modal, set a temp name
    const handleEditName = () => {
        setTempName(displayName);
        setEditNameVisible(true);
    };

    // Save name from modal
    const handleSaveName = async () => {
        setEditNameVisible(false);
        setDisplayName(tempName);
        setLoading(true);
        try {
            await updateAccount(currentAccount.did, tempName, undefined);
        } catch (err) {
            console.error(err);
            Alert.alert("Error", "Failed to update name.");
        } finally {
            setLoading(false);
        }
    };

    // Cancel name editing
    const handleCancelName = () => {
        setEditNameVisible(false);
    };

    return (
        <View style={styles.container}>
            {/* Profile Image with camera icon at bottom-right */}
            <View style={styles.imageContainer}>
                <TouchableOpacity onPress={pickImage}>
                    <SquircleMask size={120}>
                        <Image source={pictureUri ? { uri: pictureUri } : require("@/assets/images/default-picture.png")} style={styles.profileImage} />
                    </SquircleMask>
                    <View style={styles.cameraIconContainer}>
                        <Ionicons name="camera-outline" size={20} color="#fff" />
                    </View>
                </TouchableOpacity>
            </View>

            {/* Display Name */}
            <TouchableOpacity onPress={handleEditName}>
                <View style={styles.fieldRow}>
                    <Ionicons name="person-outline" size={20} color="#000" style={styles.fieldIcon} />
                    <Text style={styles.fieldLabel}>Name</Text>
                    <Text style={styles.fieldValue}>{displayName}</Text>
                </View>
            </TouchableOpacity>

            {/* Additional fields can go here (About, Phone, etc.) in the same style */}

            {/* Modal for editing name */}
            <Modal visible={editNameVisible} transparent animationType="fade">
                <View style={styles.modalBackground}>
                    <View style={styles.modalContainer}>
                        <Text style={styles.modalTitle}>Edit Name</Text>
                        <TextInput style={styles.modalInput} value={tempName} onChangeText={setTempName} />
                        <View style={styles.modalButtons}>
                            <Button title="Cancel" onPress={handleCancelName} />
                            <Button title="Save" onPress={handleSaveName} />
                        </View>
                    </View>
                </View>
            </Modal>
        </View>
    );
}

const styles = StyleSheet.create({
    noAccountContainer: {
        flex: 1,
        justifyContent: "center",
        alignItems: "center",
    },
    container: {
        flex: 1,
        backgroundColor: "#fff",
        padding: 20,
    },
    imageContainer: {
        alignItems: "center",
        marginBottom: 30,
        marginTop: 30,
    },
    profileImage: {
        width: 120,
        height: 120,
    },
    cameraIconContainer: {
        position: "absolute",
        bottom: 0,
        right: 0,
        backgroundColor: "#007AFF",
        borderRadius: 15,
        padding: 4,
    },
    fieldRow: {
        flexDirection: "row",
        alignItems: "center",
        paddingVertical: 16,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: "#ccc",
    },
    fieldIcon: {
        marginRight: 8,
    },
    fieldLabel: {
        fontSize: 16,
        fontWeight: "500",
        width: 80,
        color: "#333",
    },
    fieldValue: {
        flex: 1,
        fontSize: 16,
        color: "#666",
    },
    modalBackground: {
        flex: 1,
        backgroundColor: "rgba(0, 0, 0, 0.5)",
        justifyContent: "center",
        alignItems: "center",
    },
    modalContainer: {
        width: "80%",
        backgroundColor: "#fff",
        borderRadius: 8,
        padding: 16,
        alignItems: "center",
    },
    modalTitle: {
        fontSize: 18,
        fontWeight: "600",
        marginBottom: 10,
    },
    modalInput: {
        width: "100%",
        borderWidth: 1,
        borderColor: "#ccc",
        borderRadius: 4,
        padding: 10,
        marginBottom: 16,
    },
    modalButtons: {
        flexDirection: "row",
        justifyContent: "space-between",
        width: "100%",
    },
});
