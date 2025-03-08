// cloud-context.tsx
import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from "react";
import WebView, { WebViewMessageEvent } from "react-native-webview";
import { Asset } from "expo-asset";
import { StyleSheet, View } from "react-native";

// Message type definitions
// interface Message {
//     peerId: string;
//     content: string;
//     incoming: boolean;
//     timestamp: Date;
// }

interface CloudContextType {
    // connections: Map<string, boolean>; // Map of connected peer IDs -> connection status
    // messages: Message[];
    // connectToPeer: (peerId: string) => Promise<void>;
    // disconnectFromPeer: (peerId: string) => void;
    // sendMessage: (peerId: string, content: string) => Promise<void>;
    // localPeerId: string | null;
    // webViewRef: React.RefObject<WebView>;
    // isReady: boolean;
    // serverUrl: string | null;
    // serverStatus: "disconnected" | "connecting" | "connected";
    // setServerUrl: (url: string) => void;
    // checkServerConnection: () => Promise<boolean>;
}

export const CloudContext = createContext<CloudContextType | null>(null);

export const CloudProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const contextValue: CloudContextType = {};
    return <CloudContext.Provider value={contextValue}>{children}</CloudContext.Provider>;
    // const webrtcHtmlUri = Asset.fromModule(require("@/assets/p2p/webrtc.html")).uri;
    // const [connections, setConnections] = useState<Map<string, boolean>>(new Map());
    // const [messages, setMessages] = useState<Message[]>([]);
    // const [localPeerId, setLocalPeerId] = useState<string | null>(null);
    // const [isReady, setIsReady] = useState<boolean>(false);
    // const [serverUrl, setServerUrl] = useState<string | null>("http://localhost:5000"); // Default to local server
    // const [serverStatus, setServerStatus] = useState<"disconnected" | "connecting" | "connected">("disconnected");
    // const webViewRef = useRef<WebView>(null);
    // const pendingActionsRef = useRef<{ action: string; args: any[] }[]>([]);

    // // Process pending actions once WebView is ready
    // useEffect(() => {
    //     if (isReady && pendingActionsRef.current.length > 0) {
    //         pendingActionsRef.current.forEach(({ action, args }) => {
    //             executeAction(action, ...args);
    //         });
    //         pendingActionsRef.current = [];
    //     }
    // }, [isReady]);

    // // Send a message to the WebView
    // const sendToWebView = (action: string, data: any = {}) => {
    //     if (!isReady || !webViewRef.current) {
    //         pendingActionsRef.current.push({
    //             action,
    //             args: [data],
    //         });
    //         return;
    //     }

    //     webViewRef.current.postMessage(
    //         JSON.stringify({
    //             action,
    //             ...data,
    //         })
    //     );
    // };

    // // Execute an action by sending to WebView
    // const executeAction = (action: string, ...args: any[]) => {
    //     sendToWebView(action, args[0]);
    // };

    // // Handle messages from the WebView
    // const handleWebViewMessage = useCallback((event: WebViewMessageEvent) => {
    //     try {
    //         const data = JSON.parse(event.nativeEvent.data);

    //         switch (data.action) {
    //             case "initialized":
    //                 setLocalPeerId(data.localPeerId);
    //                 setIsReady(true);
    //                 break;

    //             case "connected":
    //                 setConnections((prev) => {
    //                     const newConnections = new Map(prev);
    //                     newConnections.set(data.peerId, true);
    //                     return newConnections;
    //                 });
    //                 break;

    //             case "disconnected":
    //                 setConnections((prev) => {
    //                     const newConnections = new Map(prev);
    //                     newConnections.delete(data.peerId);
    //                     return newConnections;
    //                 });
    //                 break;

    //             case "message":
    //                 setMessages((prev) => [
    //                     ...prev,
    //                     {
    //                         peerId: data.peerId,
    //                         content: data.content,
    //                         incoming: true,
    //                         timestamp: new Date(),
    //                     },
    //                 ]);
    //                 break;

    //             case "offer":
    //                 // Relay the offer to the remote peer
    //                 // In a real app, this would go through a signaling server
    //                 console.log("Received offer from WebRTC layer", data);
    //                 break;

    //             case "answer":
    //                 // Relay the answer to the remote peer
    //                 // In a real app, this would go through a signaling server
    //                 console.log("Received answer from WebRTC layer", data);
    //                 break;

    //             case "iceCandidate":
    //                 // Relay the ICE candidate to the remote peer
    //                 // In a real app, this would go through a signaling server
    //                 console.log("Received ICE candidate from WebRTC layer", data);
    //                 break;

    //             case "serverStatus":
    //                 // Update server connection status
    //                 setServerStatus(data.status);
    //                 if (data.error) {
    //                     console.error("Server connection error:", data.error);
    //                 }
    //                 break;

    //             case "error":
    //                 console.error("WebRTC error:", data.error);
    //                 break;
    //         }
    //     } catch (err) {
    //         console.error("Error handling WebView message:", err);
    //     }
    // }, []);

    // // Connect to a peer
    // const connectToPeer = async (peerId: string): Promise<void> => {
    //     if (peerId === localPeerId) {
    //         throw new Error("Cannot connect to your own peer ID");
    //     }

    //     // In our test environment, we'll just send directly to the WebView
    //     sendToWebView("connect", { peerId });
    // };

    // // Disconnect from a peer
    // const disconnectFromPeer = (peerId: string): void => {
    //     sendToWebView("disconnect", { peerId });
    // };

    // // Send a message to a peer
    // const sendMessage = async (peerId: string, content: string): Promise<void> => {
    //     sendToWebView("sendMessage", { peerId, content });

    //     // Add to local messages
    //     setMessages((prev) => [
    //         ...prev,
    //         {
    //             peerId,
    //             content,
    //             incoming: false,
    //             timestamp: new Date(),
    //         },
    //     ]);
    // };

    // // Handle an offer from a remote peer
    // const handleOffer = (peerId: string, offer: string): void => {
    //     sendToWebView("handleOffer", { peerId, offer });
    // };

    // // Handle an answer from a remote peer
    // const handleAnswer = (peerId: string, answer: string): void => {
    //     sendToWebView("handleAnswer", { peerId, answer });
    // };

    // // Handle an ICE candidate from a remote peer
    // const handleIceCandidate = (peerId: string, candidate: string): void => {
    //     sendToWebView("handleIceCandidate", { peerId, candidate });
    // };

    // // Check if the server is reachable
    // const checkServerConnection = async (): Promise<boolean> => {
    //     if (!serverUrl) {
    //         setServerStatus("disconnected");
    //         return false;
    //     }

    //     try {
    //         setServerStatus("connecting");

    //         // Send a request to the server's health endpoint
    //         // We'll use WebView to fetch since we can't use XMLHttpRequest directly
    //         const checkScript = `
    //             fetch('${serverUrl}/health')
    //                 .then(response => response.json())
    //                 .then(data => {
    //                     window.ReactNativeWebView.postMessage(JSON.stringify({
    //                         action: 'serverStatus',
    //                         status: data.status === 'healthy' ? 'connected' : 'disconnected'
    //                     }));
    //                     return data.status === 'healthy';
    //                 })
    //                 .catch(error => {
    //                     window.ReactNativeWebView.postMessage(JSON.stringify({
    //                         action: 'serverStatus',
    //                         status: 'disconnected',
    //                         error: error.message
    //                     }));
    //                     return false;
    //                 });
    //             true;
    //         `;

    //         if (webViewRef.current && isReady) {
    //             webViewRef.current.injectJavaScript(checkScript);
    //             // The result will be handled in the onMessage handler
    //             return serverStatus === "connected";
    //         } else {
    //             setServerStatus("disconnected");
    //             return false;
    //         }
    //     } catch (error) {
    //         console.error("Error checking server connection:", error);
    //         setServerStatus("disconnected");
    //         return false;
    //     }
    // };

    // // Effect to check connection when server URL changes
    // useEffect(() => {
    //     if (isReady && serverUrl) {
    //         checkServerConnection();
    //     }
    // }, [isReady, serverUrl]);

    // // We'll use a different approach for context communication in React Native

    // const contextValue: CloudContextType = {
    //     connections,
    //     messages,
    //     connectToPeer,
    //     disconnectFromPeer,
    //     sendMessage,
    //     localPeerId,
    //     webViewRef,
    //     isReady,
    //     serverUrl,
    //     serverStatus,
    //     setServerUrl,
    //     checkServerConnection,
    // };

    // return (
    //     <CloudContext.Provider value={contextValue}>
    //         <View style={styles.hidden}>
    //             <WebView ref={webViewRef} source={{ uri: webrtcHtmlUri }} javaScriptEnabled onMessage={handleWebViewMessage} />
    //         </View>
    //         {children}
    //     </CloudContext.Provider>
    // );
};

export const useCloud = () => {
    const context = useContext(CloudContext);
    if (!context) {
        throw new Error("useCloud must be used within a CloudProvider");
    }
    return context;
};

const styles = StyleSheet.create({
    hidden: {
        height: 0,
        width: 0,
        position: "absolute",
        top: -10000, // hide webview off-screen
    },
});
