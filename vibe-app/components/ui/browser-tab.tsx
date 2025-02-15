// browser-tab.tsx - Shows a WebView + permission handling for apps/pages

import React, { useCallback, useEffect, useRef, useState } from "react";
import { View, StyleSheet, Modal, Text, TouchableOpacity, Image, InteractionManager } from "react-native";
import WebView, { WebViewMessageEvent } from "react-native-webview";
import { useAuth } from "@/components/auth/auth-context";
import { MessageType } from "@/sdk";
import { TabInfo, useTabs } from "./tab-context";
import { useAppRegistry } from "../app/app-registry-context";
import { captureRef, captureScreen } from "react-native-view-shot";

interface AppPermissions {
    appId: string;
    name: string;
    description: string;
    pictureUrl: string;
    permissions: { [key: string]: "always" | "ask" | "never" };
}

interface Props {
    tab: TabInfo; // { id: string, title: string, url: string, type: 'webview' }
}

export default function BrowserTab({ tab }: Props) {
    const { currentAccount, initialized } = useAuth();
    const { installedApps, addOrUpdateApp } = useAppRegistry();
    const { updateTabScreenshot } = useTabs();
    const webViewRef = useRef<WebView>(null);
    const wrapperRef = useRef<View>(null);

    const [webViewUrl, setWebViewUrl] = useState<string>(tab.url);
    const [jsCode, setJsCode] = useState<string>();

    // Permission & manifest states
    const [activeManifest, setActiveManifest] = useState<any>();
    const [modalVisible, setModalVisible] = useState(false);
    const [writeModalVisible, setWriteModalVisible] = useState(false);
    const [permissionsIndicator, setPermissionsIndicator] = useState(false);
    const [writeRequest, setWriteRequest] = useState<any>(null);
    const [showJson, setShowJson] = useState<boolean>(false);

    useEffect(() => {
        // Whenever parent changes tab.url, update our local webViewUrl
        setWebViewUrl(tab.url);
    }, [tab.url]);

    useEffect(() => {
        if (!initialized) return;

        const code = `
      (function() {
          window._VIBE_ENABLED = true;
          window.addEventListener('message', (event) => {
              if (window.vibe) {
                  window.vibe.handleNativeResponse(event.data);
              }
          });

          function checkReadyState() {
              if (document.readyState === 'complete') {
                  window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'PageLoaded' }));
              } else {
                  setTimeout(checkReadyState, 500);
              }
          }

          checkReadyState(); // Start checking immediately
      })();
    `;
        setJsCode(code);
    }, [initialized]);

    // Handle messages coming from the WebView
    const handleWebViewMessage = (event: WebViewMessageEvent) => {
        try {
            if (!event.nativeEvent.data) return;
            const data = JSON.parse(event.nativeEvent.data);
            const { type, requestId } = data;
            console.log("========== ", type);
            if (type === MessageType.INIT_REQUEST) {
                handleInitRequest(data, requestId);
            } else if (type === MessageType.WRITE_REQUEST) {
                handleWriteRequest(data, requestId);
            } else if (type === MessageType.LOG_REQUEST) {
                console.log("WebView Log:", data.message);
            } else if (type === MessageType.PAGE_LOADED) {
                InteractionManager.runAfterInteractions(() => {
                    captureScreenshot();
                });
            }
        } catch (error) {
            console.error("Error parsing WebView message:", error);
        }
    };

    // Init (permission) requests from the page
    const handleInitRequest = (data: any, requestId: string) => {
        const { manifest } = data;
        const existingApp = installedApps.find((app) => app.appId === manifest.id);

        if (existingApp) {
            // TODO check if app manifest has changed and if so ask for permissions again (for new permissions)
            const newApp = {
                appId: manifest.id,
                name: manifest.name,
                description: manifest.description,
                iconUrl: manifest.pictureUrl,
                url: tab.url,
                permissions: existingApp.permissions,
            };
            addOrUpdateApp(newApp);

            sendNativeResponse({ stateUpdate: { account: currentAccount, permissions: existingApp.permissions } });
            setPermissionsIndicator(false);
        } else {
            // If new app, build a default permission state
            const permissionsState = Object.fromEntries(manifest.permissions.map((perm: string) => [perm, perm.startsWith("Read") ? "always" : "ask"]));
            setActiveManifest({ ...manifest, permissionsState });
            setPermissionsIndicator(true);
        }
    };

    // Write requests (e.g. “please write data to user’s profile”)
    const handleWriteRequest = (data: any, requestId: string) => {
        const { object } = data.data;
        const writePermission = activeManifest?.permissionsState[object.type];
        if (writePermission === "always") {
            console.log("Writing data automatically:", object);
            sendNativeResponse({ requestId, result: "Data written successfully" });
        } else if (writePermission === "ask") {
            setWriteRequest({ ...data, requestId });
            setWriteModalVisible(true);
        } else {
            sendNativeResponse({ requestId, error: "Permission denied" });
        }
    };

    // Helper to send responses back into the WebView
    const sendNativeResponse = (response: any) => {
        if (webViewRef.current) {
            webViewRef.current.injectJavaScript(`
        window.dispatchEvent(new MessageEvent('message', {
          data: ${JSON.stringify(response)}
        }));
      `);
        }
    };

    // Accept or reject the entire permission set
    const handleAccept = (permissions: { [key: string]: "always" | "ask" | "never" }) => {
        if (!activeManifest) return;

        const newApp = {
            appId: activeManifest.id,
            name: activeManifest.name,
            description: activeManifest.description,
            iconUrl: activeManifest.pictureUrl,
            url: tab.url,
            permissions,
            pinned: true,
            hidden: false,
        };
        addOrUpdateApp(newApp);

        setModalVisible(false);
        setPermissionsIndicator(false);
        sendNativeResponse({ stateUpdate: { account: currentAccount, permissions } });
    };

    const handleReject = () => {
        setModalVisible(false);
        setPermissionsIndicator(false);
        setActiveManifest(null);
        sendNativeResponse({ error: "Manifest request denied" });
    };

    // Changing individual permission levels
    const handlePermissionChange = (permissionKey: string, level: "always" | "ask" | "never") => {
        setActiveManifest((prev: any) => {
            if (!prev) return prev;
            const updatedPermissionsState = {
                ...prev.permissionsState,
                [permissionKey]: level,
            };
            return { ...prev, permissionsState: updatedPermissionsState };
        });
    };

    // Accept or reject “write” requests
    const handleWriteAccept = () => {
        if (!writeRequest) return;
        const { requestId } = writeRequest;
        sendNativeResponse({ requestId, result: "Data written successfully" });
        setWriteModalVisible(false);
    };

    const handleWriteReject = () => {
        if (!writeRequest) return;
        const { requestId } = writeRequest;
        sendNativeResponse({ requestId, error: "Permission denied" });
        setWriteModalVisible(false);
    };

    const captureScreenshot = useCallback(async () => {
        try {
            console.log("Capturing screenshot for tab:", tab.id);
            const uri = await captureScreen({
                format: "png",
                quality: 0.8,
            });
            updateTabScreenshot(tab.id, uri);
        } catch (error) {
            console.error("Screenshot failed:", error);
        }
    }, [tab.id, updateTabScreenshot]);

    return (
        <View style={{ flex: 1 }} ref={wrapperRef}>
            {/* If site is requesting permissions, show a banner. */}
            {permissionsIndicator && (
                <TouchableOpacity style={styles.permissionsIndicator} onPress={() => setModalVisible(true)}>
                    <Image source={{ uri: activeManifest?.pictureUrl }} style={styles.permissionsIndicatorIcon} />
                    <View style={{ flex: 1, flexDirection: "column" }}>
                        <Text style={styles.permissionsIndicatorHeader}>{activeManifest?.name}</Text>
                        <Text style={styles.permissionsIndicatorText}>wants access to your data</Text>
                    </View>
                </TouchableOpacity>
            )}

            {/* The main WebView */}
            {jsCode && (
                <WebView
                    ref={webViewRef}
                    source={{ uri: webViewUrl }}
                    style={{ flex: 1 }}
                    onMessage={handleWebViewMessage}
                    injectedJavaScript={jsCode}
                    javaScriptEnabled
                />
            )}

            {/* Modal for initial permission request */}
            <Modal visible={modalVisible} transparent animationType="fade">
                <View style={styles.modalOverlay}>
                    <View style={styles.modalCard}>
                        <View style={styles.modalHeader}>
                            {activeManifest?.pictureUrl && <Image source={{ uri: activeManifest.pictureUrl }} style={styles.appIcon} />}
                            <Text style={styles.appName}>{activeManifest?.name}</Text>
                        </View>

                        <Text style={styles.appDescription}>{activeManifest?.description}</Text>

                        <View style={styles.permissionsList}>
                            <Text style={styles.permissionsHeader}>{activeManifest?.name} would like to:</Text>
                            {Object.entries(activeManifest?.permissionsState || {}).map(([perm, level]) => (
                                <View key={perm} style={styles.permissionItem}>
                                    <Text style={styles.permissionText}>{perm}</Text>
                                    <View style={styles.permissionOptions}>
                                        {(["always", "ask", "never"] as const).map((val) => (
                                            <TouchableOpacity
                                                key={val}
                                                style={[styles.permissionButton, level === val && styles.permissionButtonSelected]}
                                                onPress={() => handlePermissionChange(perm, val)}
                                            >
                                                <Text style={level === val ? styles.permissionButtonSelectedText : styles.permissionButtonText}>
                                                    {val.charAt(0).toUpperCase() + val.slice(1)}
                                                </Text>
                                            </TouchableOpacity>
                                        ))}
                                    </View>
                                </View>
                            ))}
                        </View>

                        <View style={styles.actionButtons}>
                            <TouchableOpacity style={[styles.actionButton, styles.cancelButton]} onPress={handleReject}>
                                <Text style={styles.actionButtonText}>Cancel</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={[styles.actionButton, styles.allowButton]}
                                onPress={() => handleAccept(Object.fromEntries(activeManifest.permissions.map((p: string) => [p, "always"])))}
                            >
                                <Text style={styles.actionButtonText}>Allow Access</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            </Modal>

            {/* Modal for “ask” write requests */}
            <Modal visible={writeModalVisible} transparent animationType="fade">
                <View style={styles.modalOverlay}>
                    <View style={styles.modalCard}>
                        <View style={styles.modalHeader}>
                            {activeManifest?.pictureUrl && <Image source={{ uri: activeManifest.pictureUrl }} style={styles.appIcon} />}
                            <Text style={styles.appName}>{activeManifest?.name}</Text>
                        </View>

                        <Text style={styles.appDescription}>This website wants to {writeRequest?.action?.toLowerCase()} the following data:</Text>

                        <TouchableOpacity onPress={() => setShowJson(!showJson)}>
                            <Text style={styles.viewJsonButton}>{showJson ? "Hide JSON Object" : "View JSON Object"}</Text>
                        </TouchableOpacity>
                        {showJson && <Text style={styles.jsonText}>{JSON.stringify(writeRequest?.object, null, 2)}</Text>}

                        <View style={styles.actionButtons}>
                            <TouchableOpacity style={[styles.actionButton, styles.cancelButton]} onPress={handleWriteReject}>
                                <Text style={styles.actionButtonText}>Reject</Text>
                            </TouchableOpacity>
                            <TouchableOpacity style={[styles.actionButton, styles.allowButton]} onPress={handleWriteAccept}>
                                <Text style={styles.actionButtonText}>Accept</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            </Modal>
        </View>
    );
}

const styles = StyleSheet.create({
    // We no longer have a top bar here, so remove the old address bar styles.

    permissionsIndicator: {
        position: "absolute",
        top: 10,
        left: "5%",
        right: "5%",
        backgroundColor: "#fffcda",
        flexDirection: "row",
        alignItems: "center",
        padding: 10,
        borderRadius: 45,
        shadowColor: "#000",
        shadowOpacity: 0.1,
        shadowOffset: { width: 0, height: 2 },
        shadowRadius: 4,
        elevation: 4,
        zIndex: 10,
    },
    permissionsIndicatorIcon: {
        width: 30,
        height: 30,
        borderRadius: 15,
        marginRight: 10,
    },
    permissionsIndicatorHeader: {
        fontSize: 12,
        color: "#333",
        fontWeight: "700",
    },
    permissionsIndicatorText: {
        fontSize: 12,
        color: "#333",
        fontWeight: "400",
    },

    modalOverlay: {
        flex: 1,
        backgroundColor: "rgba(0,0,0,0.5)",
        justifyContent: "center",
        alignItems: "center",
    },
    modalCard: {
        width: "90%",
        backgroundColor: "#fff",
        borderRadius: 10,
        padding: 20,
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 8,
        elevation: 5,
    },
    modalHeader: {
        flexDirection: "row",
        alignItems: "center",
        marginBottom: 20,
    },
    appIcon: {
        width: 50,
        height: 50,
        borderRadius: 8,
        marginRight: 10,
    },
    appName: {
        fontSize: 18,
        fontWeight: "bold",
        color: "#333",
    },
    appDescription: {
        fontSize: 14,
        color: "#666",
        marginBottom: 20,
    },

    permissionsList: {
        marginBottom: 20,
    },
    permissionsHeader: {
        fontSize: 16,
        fontWeight: "bold",
        marginBottom: 10,
    },
    permissionItem: {
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
        marginBottom: 10,
    },
    permissionText: {
        fontSize: 14,
        color: "#333",
    },
    permissionOptions: {
        flexDirection: "row",
        gap: 10,
    },
    permissionButton: {
        backgroundColor: "#f0f0f0",
        paddingVertical: 5,
        paddingHorizontal: 10,
        borderRadius: 5,
        borderWidth: 1,
        borderColor: "#ccc",
    },
    permissionButtonSelected: {
        backgroundColor: "#007bff",
        borderColor: "#0056b3",
    },
    permissionButtonText: {
        fontSize: 12,
        color: "#333",
    },
    permissionButtonSelectedText: {
        fontSize: 12,
        color: "#fff",
        fontWeight: "bold",
    },
    viewJsonButton: {
        color: "#007bff",
        marginBottom: 10,
    },
    jsonText: {
        fontFamily: "monospace",
        backgroundColor: "#f8f9fa",
        padding: 10,
        borderRadius: 5,
        marginBottom: 10,
    },
    actionButtons: {
        flexDirection: "row",
        justifyContent: "space-between",
    },
    actionButton: {
        paddingVertical: 10,
        paddingHorizontal: 20,
        borderRadius: 5,
    },
    cancelButton: {
        backgroundColor: "#e0e0e0",
    },
    allowButton: {
        backgroundColor: "#007bff",
    },
    actionButtonText: {
        fontSize: 14,
        color: "#fff",
        fontWeight: "bold",
    },
});
