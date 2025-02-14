// create-account-wizard.tsx
import React, { useState } from "react";
import { View, Button, Text, TextInput, Image, StyleSheet, Alert } from "react-native";
import { useRouter } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import { useAuth } from "@/components/auth/auth-context";

export default function CreateAccountWizard() {
    const router = useRouter();
    const { createAccount } = useAuth();
    const [alias, setAlias] = useState("");
    const [profilePicture, setProfilePicture] = useState<string | undefined>(undefined);
    const [loading, setLoading] = useState(false);

    const pickImage = async () => {
        const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (status !== "granted") {
            Alert.alert("Permission required", "Camera roll permissions are needed to select a profile picture.");
            return;
        }
        let result = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ["images"],
            allowsEditing: true,
            aspect: [1, 1],
            quality: 0.5,
        });
        if (!result.canceled) {
            setProfilePicture(result.assets[0].uri);
        }
    };

    const handleFinish = async () => {
        setLoading(true);
        // Use provided alias or auto-generate one if empty
        const finalAlias = alias.trim() !== "" ? alias.trim() : `User${Math.floor(Math.random() * 10000)}`;
        try {
            // Pass the profilePicture URI (or null) to createAccount
            await createAccount(finalAlias, "BIOMETRIC", profilePicture);
            router.replace("/main");
        } catch (error) {
            console.error("Account creation failed:", error);
            Alert.alert("Error", "Account creation failed. Please try again.");
        } finally {
            setLoading(false);
        }
    };

    return (
        <View style={styles.container}>
            <Text style={styles.title}>Create New Account</Text>
            <TextInput style={styles.input} placeholder="Enter alias (optional)" value={alias} onChangeText={setAlias} />
            <Button title="Select Profile Picture" onPress={pickImage} />
            {profilePicture && <Image source={{ uri: profilePicture }} style={styles.profileImage} />}
            <Button title={loading ? "Creating Account..." : "Finish"} onPress={handleFinish} disabled={loading} />
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        padding: 20,
        justifyContent: "center",
        backgroundColor: "#fff",
    },
    title: {
        fontSize: 24,
        marginBottom: 20,
        textAlign: "center",
    },
    input: {
        borderWidth: 1,
        borderColor: "#ccc",
        padding: 10,
        marginBottom: 20,
        borderRadius: 5,
    },
    profileImage: {
        width: 100,
        height: 100,
        borderRadius: 50,
        alignSelf: "center",
        marginVertical: 20,
    },
});
