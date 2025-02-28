// browser-tab.tsx - Shows a WebView + permission handling for apps/pages

import React, { useCallback, useEffect, useRef, useState } from "react";
import { View, StyleSheet, Modal, Text, TouchableOpacity, Image, InteractionManager, ScrollView } from "react-native";
import WebView, { WebViewMessageEvent } from "react-native-webview";
import { captureScreen } from "react-native-view-shot";

// Import icons from Expo Vector Icons
import { MaterialCommunityIcons } from "@expo/vector-icons";

import { useAuth } from "@/components/auth/auth-context";
import { MessageType } from "@/sdk";
import { TabInfo, useTabs } from "./tab-context";
import { InstalledApp, PermissionSetting, ReadResult } from "@/types/types";
import { useDb } from "../db/db-context";

const FORCE_ALWAYS_ASK_PERMISSIONS = false; //__DEV__;

interface Props {
    tab: TabInfo;
}

// Fields to exclude from "structured" view
const EXCLUDED_FIELDS = ["_id", "_rev", "$collection"];

export default function BrowserTab({ tab }: Props) {
    const { currentAccount, initialized, installedApps, addOrUpdateApp, checkPermission } = useAuth();
    const { readOnce, read, write } = useDb();
    const { updateTabScreenshot } = useTabs();

    const webViewRef = useRef<WebView>(null);
    const wrapperRef = useRef<View>(null);

    const [webViewUrl, setWebViewUrl] = useState<string>(tab.url);
    const [jsCode, setJsCode] = useState<string>();
    const [currentApp, setCurrentApp] = useState<InstalledApp | undefined>();

    // Manifest & permission states
    const [activeManifest, setActiveManifest] = useState<any>();
    const [modalVisible, setModalVisible] = useState(false);
    const [permissionsIndicator, setPermissionsIndicator] = useState(false);

    // Read request states
    const [readModalVisible, setReadModalVisible] = useState(false);
    const [readPromptData, setReadPromptData] = useState<{
        requestId: string;
        collection: string;
        filter: any;
        results: ReadResult;
        isSubscription?: boolean;
    } | null>(null);

    // Write request states
    const [writeModalVisible, setWriteModalVisible] = useState(false);
    const [writePromptData, setWritePromptData] = useState<{
        requestId: string;
        collection: string;
        doc: any;
    } | null>(null);

    // For collapsible docs in Read modal
    const [expandedDocs, setExpandedDocs] = useState<boolean[]>([]);
    const [allExpanded, setAllExpanded] = useState(false);

    // Toggle raw JSON vs. structured for the Read modal
    const [showRawJson, setShowRawJson] = useState(false);

    // Toggle raw JSON vs. structured for the Write modal’s single doc
    const [showWriteRawJson, setShowWriteRawJson] = useState(false);
    // Toggle whether the single doc is displayed at all in the Write modal
    const [writeDocVisible, setWriteDocVisible] = useState(false);

    const [dontAskAgain, setDontAskAgain] = useState(false);
    const [showMultipleDocs, setShowMultipleDocs] = useState(false);

    // For handling multiple documents in write requests
    const [isMultipleDocuments, setIsMultipleDocuments] = useState(false);
    const [docCount, setDocCount] = useState(0);

    const activeSubscriptions = useRef<Record<string, () => void>>({});

    useEffect(() => {
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

        checkReadyState();
      })();
    `;
        setJsCode(code);
    }, [initialized]);

    // Handle messages from WebView
    const handleWebViewMessage = async (event: WebViewMessageEvent) => {
        try {
            if (!event.nativeEvent.data) return;
            const data = JSON.parse(event.nativeEvent.data);
            const { type, requestId } = data;

            if (type === MessageType.INIT_REQUEST) {
                handleInitRequest(data, requestId);
            } else if (type === MessageType.READ_ONCE_REQUEST) {
                await handleReadOnceRequest(data, requestId);
            } else if (type === MessageType.READ_REQUEST) {
                await handleReadRequest(data, requestId);
            } else if (type === MessageType.UNSUBSCRIBE_REQUEST) {
                handleUnsubscribeRequest(data);
            } else if (type === MessageType.WRITE_REQUEST) {
                await handleWriteRequest(data, requestId);
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

    /** Permission helpers */
    function buildNewPermissions(newPermsArray: string[], oldPermsObj: Record<string, PermissionSetting>) {
        const newPermsObj: Record<string, PermissionSetting> = {};
        for (const perm of newPermsArray) {
            if (oldPermsObj.hasOwnProperty(perm)) {
                newPermsObj[perm] = oldPermsObj[perm];
            } else {
                // brand new => default
                const isRead = perm.toLowerCase().startsWith("read");
                newPermsObj[perm] = isRead ? "always" : "ask";
            }
        }
        return newPermsObj;
    }

    function permissionsChanged(oldPerms: Record<string, PermissionSetting>, newPerms: Record<string, PermissionSetting>): boolean {
        const oldKeys = Object.keys(oldPerms).sort();
        const newKeys = Object.keys(newPerms).sort();
        if (oldKeys.length !== newKeys.length) return true;

        for (let i = 0; i < oldKeys.length; i++) {
            if (oldKeys[i] !== newKeys[i]) return true;
            const key = oldKeys[i];
            if (oldPerms[key] !== newPerms[key]) return true;
        }
        return false;
    }

    /** Init request handler */
    const handleInitRequest = (data: any, requestId: string) => {
        const { manifest } = data;
        const existingApp = installedApps.find((app) => app.appId === manifest.id);

        if (existingApp) {
            const updatedPerms = buildNewPermissions(manifest.permissions, existingApp.permissions);
            const hasChanges = permissionsChanged(existingApp.permissions, updatedPerms);

            if (FORCE_ALWAYS_ASK_PERMISSIONS || hasChanges) {
                setActiveManifest({
                    ...manifest,
                    permissionsState: updatedPerms,
                });
                setPermissionsIndicator(true);
            } else {
                // No changes => no re-prompt
                const newApp: Partial<InstalledApp> = {
                    appId: manifest.id,
                    name: manifest.name,
                    description: manifest.description,
                    pictureUrl: manifest.pictureUrl,
                    url: tab.url,
                    permissions: existingApp.permissions,
                };
                addOrUpdateApp(newApp);
                setCurrentApp(existingApp);

                sendNativeResponse({
                    stateUpdate: { account: currentAccount, permissions: existingApp.permissions },
                });
                setPermissionsIndicator(false);
            }
        } else {
            // If new app, build a default state
            const permissionsState = Object.fromEntries(manifest.permissions.map((perm: string) => [perm, perm.startsWith("read") ? "always" : "ask"]));
            setActiveManifest({ ...manifest, permissionsState });
            setPermissionsIndicator(true);
        }
    };

    /** Read request handler */
    const handleReadOnceRequest = async (data: any, requestId: string) => {
        if (!currentApp) {
            sendNativeResponse({
                requestId,
                error: "readOnce failed, no active app.",
            });
            return;
        }

        const { collection, filter } = data;
        const permission = await checkPermission(currentApp.appId, "read", collection);
        if (permission === "never") {
            sendNativeResponse({ requestId, error: "Permission denied" });
            return;
        }

        try {
            const results = await readOnce(collection, filter);
            if (!results.doc) {
                // empty => just return
                sendNativeResponse({ requestId, result: results });
            } else if (permission === "always") {
                sendNativeResponse({ requestId, result: results });
            } else if (permission === "ask") {
                setReadPromptData({ requestId, collection, filter, results });
                if (results.docs && results.docs.length > 1) {
                    setExpandedDocs(Array(results.docs.length).fill(false));
                    setAllExpanded(false);
                }
                setReadModalVisible(true);
            }
        } catch (error: any) {
            sendNativeResponse({ requestId, error: error.message });
        }
    };

    // Handle read subscription request
    const handleReadRequest = async (data: any, requestId: string) => {
        if (!currentApp) {
            sendNativeResponse({
                requestId,
                error: "read failed, no active app.",
            });
            return;
        }

        const { collection, filter } = data;
        const permission = await checkPermission(currentApp.appId, "read", collection);

        if (permission === "never") {
            sendNativeResponse({ requestId, error: "Permission denied" });
            return;
        }

        try {
            if (permission === "always") {
                // Start subscription directly for "always" permission
                setupSubscription(requestId, collection, filter);
            } else if (permission === "ask") {
                // For "ask" permission, we'll handle this similar to readOnce
                // but we'll need to remember to set up subscription if allowed
                const results = await readOnce(collection, filter);

                setReadPromptData({
                    requestId,
                    collection,
                    filter,
                    results,
                    isSubscription: true, // Mark this as a subscription request
                });

                if (results.docs && results.docs.length > 1) {
                    setExpandedDocs(Array(results.docs.length).fill(false));
                    setAllExpanded(false);
                }

                setReadModalVisible(true);
            }
        } catch (error: any) {
            sendNativeResponse({ requestId, error: error.message });
        }
    };

    // Set up a PouchDB subscription
    const setupSubscription = (requestId: string, collection: string, filter: any) => {
        // Start the subscription
        read(collection, filter, (results) => {
            // Send results to WebView
            sendNativeResponse({ requestId, result: results });
        })
            .then((unsubscribe) => {
                // Store the unsubscribe function
                activeSubscriptions.current[requestId] = unsubscribe;
            })
            .catch((error) => {
                console.error("Error setting up subscription:", error);
                sendNativeResponse({ requestId, error: error.message });
            });
    };

    // Handle unsubscribe request
    const handleUnsubscribeRequest = (data: any) => {
        const subRequestId = data.requestId;
        if (activeSubscriptions.current[subRequestId]) {
            // Call the unsubscribe function
            activeSubscriptions.current[subRequestId]();
            delete activeSubscriptions.current[subRequestId];
        }
    };

    /** Write request handler */
    const handleWriteRequest = async (data: any, requestId: string) => {
        if (!currentApp) {
            sendNativeResponse({ requestId, error: "write failed, no active app." });
            return;
        }

        const { collection, doc } = data;
        const permission = await checkPermission(currentApp.appId, "write", collection);
        if (permission === "never") {
            sendNativeResponse({ requestId, error: "Permission denied" });
            return;
        }

        try {
            if (permission === "always") {
                const results = await write(collection, doc);
                sendNativeResponse({ requestId, result: results });
            } else if (permission === "ask") {
                setWritePromptData({ requestId, collection, doc });
                // Reset single doc UI
                setShowWriteRawJson(false);
                setWriteDocVisible(false);

                // If it's an array of documents, update UI state to show that
                if (Array.isArray(doc)) {
                    setIsMultipleDocuments(true);
                    setDocCount(doc.length);
                } else {
                    setIsMultipleDocuments(false);
                }

                setWriteModalVisible(true);
            }
        } catch (error: any) {
            sendNativeResponse({ requestId, error: error.message });
        }
    };

    /** Send message back to WebView */
    const sendNativeResponse = (response: any) => {
        if (webViewRef.current) {
            webViewRef.current.injectJavaScript(`
        window.dispatchEvent(new MessageEvent('message', {
          data: ${JSON.stringify(response)}
        }));
      `);
        }
    };

    /** Accept or reject the permission set */
    const handleAccept = (permissions: { [key: string]: PermissionSetting }) => {
        if (!activeManifest) return;
        const newApp: InstalledApp = {
            appId: activeManifest.id,
            name: activeManifest.name,
            description: activeManifest.description,
            pictureUrl: activeManifest.pictureUrl,
            url: tab.url,
            permissions,
            hidden: false,
        };
        addOrUpdateApp(newApp);
        setCurrentApp(newApp);

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

    const handlePermissionChange = (permissionKey: string, level: "always" | "ask" | "never") => {
        setActiveManifest((prev: any) => {
            if (!prev) return prev;
            const updated = { ...prev.permissionsState, [permissionKey]: level };
            return { ...prev, permissionsState: updated };
        });
    };

    /** Read modal decisions */
    function handleReadReject() {
        if (!readPromptData) return;
        if (dontAskAgain && currentApp) {
            const permKey = `read.${readPromptData.collection}`;
            const updatedPermissions = {
                ...currentApp.permissions,
                [permKey]: "never" as PermissionSetting,
            };
            addOrUpdateApp({ ...currentApp, permissions: updatedPermissions });
        }

        const { requestId } = readPromptData;
        sendNativeResponse({ requestId, error: "Permission denied" });
        setReadPromptData(null);
        setReadModalVisible(false);
        setDontAskAgain(false);
    }

    async function handleReadAllow() {
        if (!readPromptData) return;

        if (dontAskAgain && currentApp) {
            const permKey = `read.${readPromptData.collection}`;
            const updatedPermissions = {
                ...currentApp.permissions,
                [permKey]: "always" as PermissionSetting,
            };
            addOrUpdateApp({ ...currentApp, permissions: updatedPermissions });
        }

        const { requestId, collection, filter, results, isSubscription } = readPromptData;

        // First send the immediate results
        sendNativeResponse({ requestId, result: results });

        // If this is a subscription request, set up the subscription
        if (isSubscription) {
            setupSubscription(requestId, collection, filter);
        }

        setReadPromptData(null);
        setReadModalVisible(false);
        setDontAskAgain(false);
    }

    /** Write modal decisions */
    function handleWriteReject() {
        if (!writePromptData) return;
        if (dontAskAgain && currentApp) {
            const permKey = `write.${writePromptData.collection}`;
            const updatedPermissions = {
                ...currentApp.permissions,
                [permKey]: "never" as PermissionSetting,
            };
            addOrUpdateApp({ ...currentApp, permissions: updatedPermissions });
        }

        const { requestId } = writePromptData;
        sendNativeResponse({ requestId, error: "Permission denied" });
        setWritePromptData(null);
        setWriteModalVisible(false);
        setDontAskAgain(false);
    }

    async function handleWriteAllow() {
        if (!writePromptData) return;
        if (dontAskAgain && currentApp) {
            const permKey = `write.${writePromptData.collection}`;
            const updatedPermissions = {
                ...currentApp.permissions,
                [permKey]: "always" as PermissionSetting,
            };
            addOrUpdateApp({ ...currentApp, permissions: updatedPermissions });
        }

        const { requestId, collection, doc } = writePromptData;
        const results = await write(collection, doc);
        sendNativeResponse({ requestId, result: results });
        setWritePromptData(null);
        setWriteModalVisible(false);
        setDontAskAgain(false);
    }

    /** Collapsible doc toggles */
    function toggleDoc(index: number) {
        setExpandedDocs((prev) => {
            const newState = [...prev];
            newState[index] = !newState[index];
            return newState;
        });
    }

    function toggleAllDocs() {
        const shouldExpandAll = expandedDocs.some((isExpanded) => !isExpanded);
        setExpandedDocs(expandedDocs.map(() => shouldExpandAll));
        setAllExpanded(shouldExpandAll);
    }

    /** Screenshot for tab preview */
    const captureScreenshot = useCallback(async () => {
        try {
            const uri = await captureScreen({
                format: "png",
                quality: 0.8,
            });
            updateTabScreenshot(tab.id, uri);
        } catch (error) {
            console.error("Screenshot failed:", error);
        }
    }, [tab.id, updateTabScreenshot]);

    useEffect(() => {
        if (tab.reload) {
            webViewRef.current?.reload();
        }
    }, [tab.reload]);

    /** Helpers */
    const multipleReadDocs = readPromptData?.results?.docs && readPromptData.results.docs.length > 1;

    function renderStructuredFields(doc: any) {
        return Object.entries(doc)
            .filter(([k]) => !EXCLUDED_FIELDS.includes(k))
            .map(([key, value]) => {
                const displayValue = typeof value === "object" ? JSON.stringify(value, null, 2) : String(value);
                return (
                    <View style={styles.fieldRow} key={key}>
                        <Text style={styles.fieldLabel}>{key}</Text>
                        <Text style={styles.fieldValue}>{displayValue}</Text>
                    </View>
                );
            });
    }

    function CollapsedDocRow({ doc, index, isExpanded, onPress }: { doc: any; index: number; isExpanded: boolean; onPress: () => void }) {
        const title = doc.name ? doc.name : doc.title ? doc.title : `Document #${index + 1}`;

        return (
            <TouchableOpacity onPress={onPress} style={styles.collapsedDocRow}>
                <Text style={styles.collapsedDocTitle}>{title}</Text>
                <MaterialCommunityIcons name={isExpanded ? "chevron-up" : "chevron-down"} size={20} color="#666" />
            </TouchableOpacity>
        );
    }

    return (
        <View style={{ flex: 1 }} ref={wrapperRef}>
            {/* Banner if site is requesting permissions */}
            {permissionsIndicator && (
                <TouchableOpacity style={styles.permissionsIndicator} onPress={() => setModalVisible(true)}>
                    {activeManifest?.pictureUrl && <Image source={{ uri: activeManifest.pictureUrl }} style={styles.permissionsIndicatorIcon} />}
                    <View style={{ flex: 1, flexDirection: "column" }}>
                        <Text style={styles.permissionsIndicatorHeader}>{activeManifest?.name}</Text>
                        <Text style={styles.permissionsIndicatorText}>wants access to your data</Text>
                    </View>
                </TouchableOpacity>
            )}

            {/* Main WebView */}
            {jsCode && <WebView ref={webViewRef} source={{ uri: webViewUrl }} style={{ flex: 1 }} onMessage={handleWebViewMessage} injectedJavaScript={jsCode} javaScriptEnabled />}

            {/* Modal: initial permission request */}
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
                                                <Text style={level === val ? styles.permissionButtonSelectedText : styles.permissionButtonText}>{val.charAt(0).toUpperCase() + val.slice(1)}</Text>
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
                            <TouchableOpacity style={[styles.actionButton, styles.allowButton]} onPress={() => handleAccept(activeManifest.permissionsState)}>
                                <Text style={styles.actionButtonText}>Allow Access</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            </Modal>

            {/* Modal: Read requests */}
            <Modal visible={readModalVisible} transparent animationType="fade">
                <View style={styles.modalOverlay}>
                    <View style={styles.modalCard}>
                        {readPromptData && (
                            <>
                                <View style={styles.modalHeader}>
                                    {currentApp?.pictureUrl && <Image source={{ uri: currentApp.pictureUrl }} style={styles.appIcon} />}
                                    <Text style={styles.appName}>{currentApp?.name}</Text>
                                </View>

                                <Text style={styles.appDescription}>
                                    This app wants to read {readPromptData?.results.docs.length ?? 0} document
                                    {readPromptData?.results.docs.length !== 1 ? "s" : ""} from your <Text style={{ fontWeight: "600" }}>{readPromptData?.collection}</Text> collection.
                                </Text>

                                {/* If multiple docs */}
                                {multipleReadDocs ? (
                                    <>
                                        <View style={styles.docListHeader}>
                                            <TouchableOpacity
                                                onPress={() => {
                                                    const newShow = !showMultipleDocs;
                                                    setShowMultipleDocs(newShow);
                                                    if (newShow && readPromptData?.results?.docs) {
                                                        // When showing, expand all rows by default.
                                                        setExpandedDocs(Array(readPromptData.results.docs.length).fill(true));
                                                        setAllExpanded(true);
                                                    }
                                                }}
                                                style={styles.iconButton}
                                            >
                                                <Text style={styles.iconButtonText}>{showMultipleDocs ? "Hide Documents" : "Show Documents"}</Text>
                                            </TouchableOpacity>
                                            {showMultipleDocs && (
                                                <>
                                                    {/* Expand/Collapse All */}
                                                    <TouchableOpacity onPress={toggleAllDocs} style={styles.iconButton}>
                                                        <MaterialCommunityIcons name={allExpanded ? "collapse-all-outline" : "expand-all-outline"} size={20} color="#007bff" />
                                                    </TouchableOpacity>

                                                    {/* Toggle raw vs structured */}
                                                    <TouchableOpacity onPress={() => setShowRawJson(!showRawJson)} style={styles.iconButton}>
                                                        {showRawJson ? (
                                                            <MaterialCommunityIcons name="file-document-outline" size={20} color="#007bff" />
                                                        ) : (
                                                            <MaterialCommunityIcons name="code-json" size={20} color="#007bff" />
                                                        )}
                                                    </TouchableOpacity>
                                                </>
                                            )}
                                        </View>

                                        {showMultipleDocs && (
                                            <>
                                                <View style={styles.scrollArea}>
                                                    <ScrollView>
                                                        {readPromptData?.results.docs.map((doc, idx) => {
                                                            const isExpanded = expandedDocs[idx];
                                                            return (
                                                                <View key={idx} style={{ marginBottom: 10 }}>
                                                                    <CollapsedDocRow doc={doc} index={idx} isExpanded={isExpanded} onPress={() => toggleDoc(idx)} />
                                                                    {isExpanded && (
                                                                        <View style={styles.expandedContent}>
                                                                            {showRawJson ? <Text style={styles.jsonText}>{JSON.stringify(doc, null, 2)}</Text> : renderStructuredFields(doc)}
                                                                        </View>
                                                                    )}
                                                                </View>
                                                            );
                                                        })}
                                                    </ScrollView>
                                                </View>
                                            </>
                                        )}
                                    </>
                                ) : (
                                    // Single doc
                                    <SingleDocView doc={readPromptData?.results.docs[0]} />
                                )}

                                <View style={styles.checkboxContainer}>
                                    <TouchableOpacity onPress={() => setDontAskAgain(!dontAskAgain)} style={styles.checkbox}>
                                        <MaterialCommunityIcons name={dontAskAgain ? "checkbox-marked" : "checkbox-blank-outline"} size={24} color={dontAskAgain ? "#28a745" : "#ccc"} />
                                    </TouchableOpacity>
                                    <Text style={styles.checkboxLabel}>Don't ask me again</Text>
                                </View>

                                <View style={styles.actionButtons}>
                                    <TouchableOpacity style={[styles.actionButton, styles.cancelButton]} onPress={handleReadReject}>
                                        <Text style={styles.actionButtonText}>Deny</Text>
                                    </TouchableOpacity>
                                    <TouchableOpacity style={[styles.actionButton, styles.allowButton]} onPress={handleReadAllow}>
                                        <Text style={styles.actionButtonText}>Allow</Text>
                                    </TouchableOpacity>
                                </View>
                            </>
                        )}
                    </View>
                </View>
            </Modal>

            {/* Modal: Write requests */}
            <Modal visible={writeModalVisible} transparent animationType="fade">
                <View style={styles.modalOverlay}>
                    <View style={styles.modalCard}>
                        {writePromptData && (
                            <>
                                <View style={styles.modalHeader}>
                                    {currentApp?.pictureUrl && <Image source={{ uri: currentApp.pictureUrl }} style={styles.appIcon} />}
                                    <Text style={styles.appName}>{currentApp?.name}</Text>
                                </View>

                                <Text style={styles.appDescription}>
                                    This app wants to write {isMultipleDocuments ? `${docCount} documents` : "a document"} to your{" "}
                                    <Text style={{ fontWeight: "600" }}>{writePromptData?.collection}</Text> collection.
                                </Text>

                                <View style={styles.docListHeader}>
                                    {/* Show/hide doc button */}
                                    <TouchableOpacity onPress={() => setWriteDocVisible(!writeDocVisible)} style={styles.iconButton}>
                                        <Text style={styles.iconButtonText}>{writeDocVisible ? "Hide Document" : "View Document"}</Text>
                                    </TouchableOpacity>

                                    {writeDocVisible && (
                                        <TouchableOpacity onPress={() => setShowWriteRawJson(!showWriteRawJson)} style={styles.iconButton}>
                                            {showWriteRawJson ? (
                                                <MaterialCommunityIcons name="file-document-outline" size={20} color="#007bff" />
                                            ) : (
                                                <MaterialCommunityIcons name="code-json" size={20} color="#007bff" />
                                            )}
                                        </TouchableOpacity>
                                    )}
                                </View>

                                {writeDocVisible && (
                                    <View style={styles.scrollArea}>
                                        <ScrollView>
                                            {showWriteRawJson ? <Text style={styles.jsonText}>{JSON.stringify(writePromptData?.doc, null, 2)}</Text> : renderStructuredFields(writePromptData?.doc)}
                                        </ScrollView>
                                    </View>
                                )}

                                <View style={styles.checkboxContainer}>
                                    <TouchableOpacity onPress={() => setDontAskAgain(!dontAskAgain)} style={styles.checkbox}>
                                        <MaterialCommunityIcons name={dontAskAgain ? "checkbox-marked" : "checkbox-blank-outline"} size={24} color={dontAskAgain ? "#28a745" : "#ccc"} />
                                    </TouchableOpacity>
                                    <Text style={styles.checkboxLabel}>Don't ask me again</Text>
                                </View>

                                <View style={styles.actionButtons}>
                                    <TouchableOpacity style={[styles.actionButton, styles.cancelButton]} onPress={handleWriteReject}>
                                        <Text style={styles.actionButtonText}>Deny</Text>
                                    </TouchableOpacity>
                                    <TouchableOpacity style={[styles.actionButton, styles.allowButton]} onPress={handleWriteAllow}>
                                        <Text style={styles.actionButtonText}>Allow</Text>
                                    </TouchableOpacity>
                                </View>
                            </>
                        )}
                    </View>
                </View>
            </Modal>
        </View>
    );
}

/**
 * SingleDocView:
 * Used only for the Read modal when there's exactly one doc.
 * Toggles doc visibility and raw/structured display.
 */
function SingleDocView({ doc }: { doc: any }) {
    const [visible, setVisible] = useState(false);
    const [showRaw, setShowRaw] = useState(false);

    if (!doc) return null;

    return (
        <>
            <View style={styles.docListHeader}>
                <TouchableOpacity onPress={() => setVisible(!visible)} style={styles.iconButton}>
                    <Text style={styles.iconButtonText}>{visible ? "Hide Document" : "View Document"}</Text>
                </TouchableOpacity>

                {visible && (
                    <TouchableOpacity onPress={() => setShowRaw(!showRaw)} style={styles.iconButton}>
                        {showRaw ? <MaterialCommunityIcons name="file-document-outline" size={20} color="#007bff" /> : <MaterialCommunityIcons name="code-json" size={20} color="#007bff" />}
                    </TouchableOpacity>
                )}
            </View>

            {visible && (
                <View style={styles.scrollArea}>
                    <ScrollView>
                        {showRaw ? (
                            <Text style={styles.jsonText}>{JSON.stringify(doc, null, 2)}</Text>
                        ) : (
                            Object.entries(doc)
                                .filter(([k]) => !EXCLUDED_FIELDS.includes(k))
                                .map(([k, v]) => {
                                    const val = typeof v === "object" ? JSON.stringify(v, null, 2) : String(v);
                                    return (
                                        <View style={styles.fieldRow} key={k}>
                                            <Text style={styles.fieldLabel}>{k}</Text>
                                            <Text style={styles.fieldValue}>{val}</Text>
                                        </View>
                                    );
                                })
                        )}
                    </ScrollView>
                </View>
            )}
        </>
    );
}

const styles = StyleSheet.create({
    // Banner if site is requesting permissions
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
        marginBottom: 15,
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
        marginBottom: 10,
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
    },
    permissionButton: {
        backgroundColor: "#f0f0f0",
        paddingVertical: 5,
        paddingHorizontal: 10,
        borderRadius: 5,
        borderWidth: 1,
        borderColor: "#ccc",
        marginLeft: 5,
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

    // Doc list header for toggles
    docListHeader: {
        flexDirection: "row",
        marginBottom: 8, // slightly less spacing
    },
    iconButton: {
        flexDirection: "row",
        paddingHorizontal: 8,
        paddingVertical: 5,
        backgroundColor: "#eee",
        borderRadius: 5,
        marginRight: 8,
        alignItems: "center",
    },
    iconButtonText: {
        color: "#007bff",
        fontWeight: "600",
    },

    // Collapsed doc row, more compact
    collapsedDocRow: {
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
        backgroundColor: "#f2f2f2",
        borderRadius: 6,
        paddingVertical: 8,
        paddingHorizontal: 10,
    },
    collapsedDocTitle: {
        fontSize: 14,
        fontWeight: "500",
        color: "#333",
    },

    expandedContent: {
        padding: 8,
        backgroundColor: "#fafafa",
        borderRadius: 6,
        marginTop: 5,
    },

    // Structured field display
    fieldRow: {
        marginBottom: 10,
    },
    fieldLabel: {
        color: "#555",
        fontSize: 12,
        fontWeight: "600",
        marginBottom: 2,
    },
    fieldValue: {
        fontSize: 14,
        color: "#333",
    },

    // JSON block
    jsonText: {
        fontFamily: "monospace",
        backgroundColor: "#f8f9fa",
        padding: 10,
        borderRadius: 5,
        marginBottom: 5,
    },
    scrollArea: {
        maxHeight: 250,
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

    checkboxContainer: {
        flexDirection: "row",
        alignItems: "center",
        marginBottom: 10,
    },
    checkbox: {
        marginRight: 8,
    },
    checkboxLabel: {
        fontSize: 14,
        color: "#333",
    },
});
