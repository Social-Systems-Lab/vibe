// create-account-wizard.tsx
import React, { useState, useEffect } from "react";
import { View, Button, Text, TextInput, Image, StyleSheet, Alert, ScrollView, TouchableOpacity, Switch, FlatList } from "react-native";
import { useRouter } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import * as Contacts from "expo-contacts";
import { MaterialIcons, Ionicons } from "@expo/vector-icons";
import { useAuth } from "@/components/auth/auth-context";
import { useDb } from "@/components/db/db-context";
import { InstalledApp } from "@/types/types";

// Step definitions
type WizardStep = "intro-welcome" | "intro-privacy" | "intro-data" | "profile-setup" | "app-selection" | "import-contacts" | "complete";

// Force showing welcome screens during development
const FORCE_ALWAYS_SHOW_WELCOME = __DEV__;

export default function CreateAccountWizard() {
    const router = useRouter();
    const { createAccount, accounts, addOrUpdateApp } = useAuth();
    const { write } = useDb();

    // State variables
    const [initialStep, setInitialStep] = useState<WizardStep>("intro-welcome");
    const [currentStep, setCurrentStep] = useState<WizardStep | null>(null);
    const [alias, setAlias] = useState("");
    const [profilePicture, setProfilePicture] = useState<string | undefined>(undefined);
    const [loading, setLoading] = useState(false);
    const [selectedApps, setSelectedApps] = useState<string[]>(["dev.vibeapp.contacts"]);
    const [hasContactsPermission, setHasContactsPermission] = useState(false);
    const [phoneContacts, setPhoneContacts] = useState<Contacts.Contact[]>([]);
    const [selectedContacts, setSelectedContacts] = useState<string[]>([]);
    const [importingContacts, setImportingContacts] = useState(false);

    // Predefined apps (for now just contacts)
    const availableApps: InstalledApp[] = [
        {
            appId: "dev.vibeapp.contacts",
            name: "Contacts",
            description: "Manage your contacts with self-sovereign storage",
            pictureUrl: "https://vibeapp.dev/apps/contacts/icon.png",
            url: "https://vibeapp.dev/apps/contacts",
            permissions: {
                "read.contacts": "always",
                "write.contacts": "always",
            },
            hidden: false,
        },
    ];

    // Request contacts permission
    const requestContactsPermission = async () => {
        console.log("Requesting contacts permission...");
        const { status } = await Contacts.requestPermissionsAsync();
        console.log("Permission status:", status);
        setHasContactsPermission(status === "granted");
        if (status === "granted") {
            loadPhoneContacts();
        } else {
            console.log("Permission denied");
        }
    };

    // Load phone contacts
    const loadPhoneContacts = async () => {
        try {
            const { data } = await Contacts.getContactsAsync({
                fields: [Contacts.Fields.Name, Contacts.Fields.PhoneNumbers, Contacts.Fields.Emails],
            });

            if (data.length > 0) {
                // Filter out contacts without names
                const validContacts = data.filter((contact) => contact.name);
                setPhoneContacts(validContacts);
            }
        } catch (error) {
            console.error("Error loading contacts:", error);
            Alert.alert("Error", "Failed to load contacts");
        }
    };

    // Image picker function
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

    // Go to next step
    const handleNext = () => {
        const allSteps: WizardStep[] = ["intro-welcome", "intro-privacy", "intro-data", "profile-setup", "app-selection", "import-contacts", "complete"];
        // For non-first accounts or when not in dev mode, skip the intro steps
        const steps = FORCE_ALWAYS_SHOW_WELCOME || accounts.length === 0 ? allSteps : allSteps.filter((step) => !step.startsWith("intro-"));

        if (!currentStep) return;
        const currentIndex = steps.indexOf(currentStep);
        if (currentIndex < steps.length - 1) {
            setCurrentStep(steps[currentIndex + 1]);
        }
    };

    // Go to previous step
    const handleBack = () => {
        const allSteps: WizardStep[] = ["intro-welcome", "intro-privacy", "intro-data", "profile-setup", "app-selection", "import-contacts", "complete"];
        // For non-first accounts or when not in dev mode, skip the intro steps
        const steps = FORCE_ALWAYS_SHOW_WELCOME || accounts.length === 0 ? allSteps : allSteps.filter((step) => !step.startsWith("intro-"));

        if (!currentStep) return;
        const currentIndex = steps.indexOf(currentStep);
        if (currentIndex > 0) {
            setCurrentStep(steps[currentIndex - 1]);
        }
    };

    // Handle app selection toggle
    const toggleApp = (appId: string) => {
        if (selectedApps.includes(appId)) {
            setSelectedApps(selectedApps.filter((id) => id !== appId));
        } else {
            setSelectedApps([...selectedApps, appId]);
        }
    };

    // Handle contact selection toggle
    const toggleContact = (contactId: string) => {
        if (selectedContacts.includes(contactId)) {
            setSelectedContacts(selectedContacts.filter((id) => id !== contactId));
        } else {
            setSelectedContacts([...selectedContacts, contactId]);
        }
    };

    // Create account and handle final steps
    const handleFinish = async () => {
        setLoading(true);

        try {
            // 1. Create the account
            const finalAlias = alias.trim() !== "" ? alias.trim() : `User${Math.floor(Math.random() * 10000)}`;
            const account = await createAccount(finalAlias, "BIOMETRIC", profilePicture);

            console.log("Account created:", account);

            // Database and apps are already set up by createAccount

            // 3. Install selected apps after account is created
            for (const appId of selectedApps) {
                const app = availableApps.find((a) => a.appId === appId);
                if (app) {
                    try {
                        console.log("Installing app:", app.appId);
                        await addOrUpdateApp(app, account);
                    } catch (appError) {
                        console.error(`Error installing app ${app.appId}:`, appError);
                        // Continue with other apps
                    }
                }
            }

            // 4. Import selected contacts if any
            if (selectedContacts.length > 0) {
                setImportingContacts(true);
                try {
                    // Convert phone contacts to vibe contacts
                    const vibeContacts = selectedContacts
                        .map((contactId) => {
                            const phoneContact = phoneContacts.find((c) => c.id === contactId);
                            if (!phoneContact) return null;

                            // Create a simplified contact structure
                            return {
                                name: phoneContact.name || "Unknown",
                                email: phoneContact.emails && phoneContact.emails.length > 0 ? phoneContact.emails[0].email : undefined,
                                phone: phoneContact.phoneNumbers && phoneContact.phoneNumbers.length > 0 ? phoneContact.phoneNumbers[0].number : undefined,
                            };
                        })
                        .filter(Boolean);

                    console.log("Importing contacts:", vibeContacts.length);

                    if (vibeContacts.length > 0) {
                        // Import all selected contacts at once
                        await write("contacts", vibeContacts);
                    }
                } catch (contactsError) {
                    console.error("Error importing contacts:", contactsError);
                    Alert.alert("Warning", "Some contacts may not have been imported correctly.");
                } finally {
                    setImportingContacts(false);
                }
            }

            // 5. Navigate to the main app
            router.replace("/main");
        } catch (error) {
            console.error("Account creation failed:", error);
            Alert.alert("Error", "Account creation failed. Please try again.");
        } finally {
            setLoading(false);
        }
    };

    // Determine initial step based on whether this is the first account
    useEffect(() => {
        const shouldShowIntro = FORCE_ALWAYS_SHOW_WELCOME || accounts.length === 0;
        const startingStep = shouldShowIntro ? "intro-welcome" : "profile-setup";
        setInitialStep(startingStep);
        setCurrentStep(startingStep);
    }, [accounts]);

    // Request contacts permission when reaching the import contacts step
    useEffect(() => {
        if (currentStep === "import-contacts") {
            requestContactsPermission();
        }
    }, [currentStep]);

    // Render the current step
    const renderStep = () => {
        switch (currentStep) {
            case "intro-welcome":
                return (
                    <View style={styles.stepContainer}>
                        <View style={styles.iconContainer}>
                            <MaterialIcons name="waving-hand" size={50} color="#3498db" />
                        </View>
                        <Text style={styles.title}>Welcome to Vibe</Text>
                        <Text style={styles.description}>Vibe gives you full control over your digital identity and data. Let's get you set up with your own self-sovereign identity.</Text>
                    </View>
                );

            case "intro-privacy":
                return (
                    <View style={styles.stepContainer}>
                        <View style={styles.iconContainer}>
                            <MaterialIcons name="security" size={50} color="#3498db" />
                        </View>
                        <Text style={styles.title}>Your Privacy Matters</Text>
                        <Text style={styles.description}>
                            With Vibe, your data stays with you. No centralized storage or third-party intermediaries can access your information without your explicit permission.
                        </Text>
                    </View>
                );

            case "intro-data":
                return (
                    <View style={styles.stepContainer}>
                        <View style={styles.iconContainer}>
                            <MaterialIcons name="storage" size={50} color="#3498db" />
                        </View>
                        <Text style={styles.title}>Your Data, Your Rules</Text>
                        <Text style={styles.description}>You decide which apps can access your data and when. Revoke access at any time. It's your digital identity, on your terms.</Text>
                    </View>
                );

            case "profile-setup":
                return (
                    <View style={styles.stepContainer}>
                        <Text style={styles.title}>Create Your Profile</Text>
                        <TextInput style={styles.input} placeholder="Enter your name" value={alias} onChangeText={setAlias} />

                        <View style={styles.profileImageContainer}>
                            {profilePicture ? (
                                <Image source={{ uri: profilePicture }} style={styles.profileImage} />
                            ) : (
                                <View style={[styles.profileImage, styles.placeholderImage]}>
                                    <MaterialIcons name="person" size={60} color="#ccc" />
                                </View>
                            )}
                            <TouchableOpacity style={styles.imagePickerButton} onPress={pickImage}>
                                <Text style={styles.imagePickerButtonText}>{profilePicture ? "Change Photo" : "Add Photo"}</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                );

            case "app-selection":
                return (
                    <View style={styles.stepContainer}>
                        <Text style={styles.title}>Select Base Apps</Text>
                        <Text style={styles.description}>Choose the apps you want to install to get started with Vibe.</Text>

                        <View style={styles.appListContainer}>
                            <Text style={styles.sectionTitle}>Base Apps</Text>

                            {availableApps.map((app) => (
                                <View key={app.appId} style={styles.appItem}>
                                    <View style={styles.appInfoContainer}>
                                        <Text style={styles.appName}>{app.name}</Text>
                                        <Text style={styles.appDescription}>{app.description}</Text>
                                    </View>
                                    <Switch value={selectedApps.includes(app.appId)} onValueChange={() => toggleApp(app.appId)} />
                                </View>
                            ))}
                        </View>
                    </View>
                );

            case "import-contacts":
                return (
                    <View style={styles.stepContainer}>
                        <Text style={styles.title}>Import Contacts</Text>
                        <Text style={styles.description}>Import your existing contacts to get started quickly.</Text>

                        {!hasContactsPermission ? (
                            <View style={styles.permissionContainer}>
                                <Text style={styles.permissionText}>Vibe needs permission to access your contacts.</Text>
                                <Button title="Grant Permission" onPress={requestContactsPermission} />
                            </View>
                        ) : phoneContacts.length === 0 ? (
                            <View style={styles.emptyStateContainer}>
                                <Text style={styles.emptyStateText}>No contacts found on your device</Text>
                            </View>
                        ) : (
                            <View style={styles.contactListContainer}>
                                <View style={styles.contactHeader}>
                                    <Text>Select contacts to import</Text>
                                    <TouchableOpacity onPress={() => setSelectedContacts(selectedContacts.length === phoneContacts.length ? [] : phoneContacts.map((c) => c.id))}>
                                        <Text style={styles.selectAllText}>{selectedContacts.length === phoneContacts.length ? "Deselect All" : "Select All"}</Text>
                                    </TouchableOpacity>
                                </View>

                                {/* Contacts list needs to be in its own View, not inside ScrollView */}
                                <View style={styles.contactListWrapper}>
                                    <FlatList
                                        data={phoneContacts}
                                        keyExtractor={(item) => item.id}
                                        renderItem={({ item }) => (
                                            <TouchableOpacity style={styles.contactItem} onPress={() => toggleContact(item.id)}>
                                                <View style={styles.contactInitials}>
                                                    <Text style={styles.initialsText}>{item.name?.charAt(0) || "?"}</Text>
                                                </View>
                                                <View style={styles.contactInfo}>
                                                    <Text style={styles.contactName}>{item.name}</Text>
                                                    <Text style={styles.contactDetails}>{item.phoneNumbers?.[0]?.number || item.emails?.[0]?.email || "No contact info"}</Text>
                                                </View>
                                                <View style={styles.checkbox}>{selectedContacts.includes(item.id) && <Ionicons name="checkmark" size={24} color="#3498db" />}</View>
                                            </TouchableOpacity>
                                        )}
                                        style={styles.contactList}
                                    />
                                </View>

                                <View style={styles.selectedCountContainer}>
                                    <Text style={styles.selectedCount}>{selectedContacts.length} contacts selected</Text>
                                </View>
                            </View>
                        )}
                    </View>
                );

            case "complete":
                return (
                    <View style={styles.stepContainer}>
                        <View style={styles.iconContainer}>
                            <MaterialIcons name="check-circle" size={60} color="#2ecc71" />
                        </View>
                        <Text style={styles.title}>All Set!</Text>
                        <Text style={styles.description}>Your Vibe account is ready to use. Tap Finish to start using your self-sovereign identity and take control of your digital life.</Text>
                    </View>
                );

            default:
                return <View />;
        }
    };

    return (
        <View style={styles.container}>
            {/* Progress indicator */}
            <View style={styles.progressContainer}>
                {["intro-welcome", "intro-privacy", "intro-data", "profile-setup", "app-selection", "import-contacts", "complete"].map((step, index) => (
                    <View key={step} style={[styles.progressDot, currentStep === step ? styles.progressDotActive : null]} />
                ))}
            </View>

            {/* Content area - Not using ScrollView for steps with FlatList */}
            {currentStep === "import-contacts" ? (
                <View style={styles.content}>{renderStep()}</View>
            ) : (
                <ScrollView style={styles.content} contentContainerStyle={styles.contentContainer}>
                    {renderStep()}
                </ScrollView>
            )}

            {/* Navigation buttons */}
            <View style={styles.navigationContainer}>
                {currentStep !== "intro-welcome" && (
                    <TouchableOpacity style={styles.navigationButton} onPress={handleBack} disabled={loading || importingContacts}>
                        <Text style={styles.navigationButtonText}>Back</Text>
                    </TouchableOpacity>
                )}

                <TouchableOpacity style={[styles.navigationButton, styles.primaryButton]} onPress={currentStep === "complete" ? handleFinish : handleNext} disabled={loading || importingContacts}>
                    <Text style={styles.primaryButtonText}>{loading ? "Processing..." : importingContacts ? "Importing..." : currentStep === "complete" ? "Finish" : "Next"}</Text>
                </TouchableOpacity>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: "#fff",
    },
    progressContainer: {
        flexDirection: "row",
        justifyContent: "center",
        paddingVertical: 20,
    },
    progressDot: {
        width: 8,
        height: 8,
        borderRadius: 4,
        backgroundColor: "#e0e0e0",
        marginHorizontal: 4,
    },
    progressDotActive: {
        backgroundColor: "#3498db",
        width: 12,
        height: 12,
        borderRadius: 6,
    },
    content: {
        flex: 1,
    },
    contentContainer: {
        padding: 20,
    },
    stepContainer: {
        minHeight: 400,
        justifyContent: "center",
    },
    navigationContainer: {
        flexDirection: "row",
        justifyContent: "space-between",
        padding: 20,
        borderTopWidth: 1,
        borderTopColor: "#f0f0f0",
    },
    navigationButton: {
        paddingVertical: 12,
        paddingHorizontal: 20,
        borderRadius: 6,
        backgroundColor: "#f0f0f0",
    },
    navigationButtonText: {
        fontSize: 16,
        color: "#333",
    },
    primaryButton: {
        backgroundColor: "#3498db",
        flex: 1,
        marginLeft: 10,
        alignItems: "center",
    },
    primaryButtonText: {
        fontSize: 16,
        color: "#fff",
        fontWeight: "500",
    },
    title: {
        fontSize: 24,
        fontWeight: "600",
        marginBottom: 20,
        textAlign: "center",
    },
    description: {
        fontSize: 16,
        color: "#666",
        textAlign: "center",
        marginBottom: 30,
        lineHeight: 24,
    },
    iconContainer: {
        alignItems: "center",
        marginBottom: 30,
    },
    input: {
        borderWidth: 1,
        borderColor: "#ddd",
        padding: 15,
        borderRadius: 8,
        fontSize: 16,
        marginBottom: 20,
    },
    profileImageContainer: {
        alignItems: "center",
        marginVertical: 20,
    },
    profileImage: {
        width: 120,
        height: 120,
        borderRadius: 60,
    },
    placeholderImage: {
        backgroundColor: "#f5f5f5",
        justifyContent: "center",
        alignItems: "center",
    },
    imagePickerButton: {
        marginTop: 15,
    },
    imagePickerButtonText: {
        color: "#3498db",
        fontSize: 16,
    },
    // App selection styles
    appListContainer: {
        marginTop: 10,
    },
    sectionTitle: {
        fontSize: 18,
        fontWeight: "500",
        marginBottom: 10,
    },
    appItem: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        paddingVertical: 12,
        borderBottomWidth: 1,
        borderBottomColor: "#f0f0f0",
    },
    appInfoContainer: {
        flex: 1,
    },
    appName: {
        fontSize: 16,
        fontWeight: "500",
    },
    appDescription: {
        fontSize: 14,
        color: "#666",
        marginTop: 4,
    },
    // Contact import styles
    permissionContainer: {
        alignItems: "center",
        padding: 20,
    },
    permissionText: {
        marginBottom: 15,
        textAlign: "center",
    },
    contactListContainer: {
        flex: 1,
        height: 420, // Increased height to show more contacts
    },
    contactListWrapper: {
        height: 350, // Fixed height for FlatList container
        width: "100%",
    },
    contactHeader: {
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
        marginBottom: 10,
    },
    selectAllText: {
        color: "#3498db",
        fontWeight: "500",
    },
    contactList: {
        flex: 1,
    },
    contactItem: {
        flexDirection: "row",
        alignItems: "center",
        paddingVertical: 10,
        borderBottomWidth: 1,
        borderBottomColor: "#f0f0f0",
    },
    contactInitials: {
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: "#3498db",
        justifyContent: "center",
        alignItems: "center",
        marginRight: 10,
    },
    initialsText: {
        color: "#fff",
        fontSize: 16,
        fontWeight: "600",
    },
    contactInfo: {
        flex: 1,
    },
    contactName: {
        fontSize: 16,
    },
    contactDetails: {
        fontSize: 14,
        color: "#666",
    },
    checkbox: {
        width: 30,
        height: 30,
        justifyContent: "center",
        alignItems: "center",
    },
    selectedCountContainer: {
        padding: 10,
        alignItems: "center",
    },
    selectedCount: {
        fontSize: 14,
        color: "#666",
    },
    emptyStateContainer: {
        alignItems: "center",
        justifyContent: "center",
        padding: 40,
    },
    emptyStateText: {
        fontSize: 16,
        color: "#666",
    },
});
