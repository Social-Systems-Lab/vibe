import React, { useEffect, useState } from "react";
import { PENDING_CONSENT_REQUEST_KEY } from "../background-modules/action-handlers/app-session.handler";
import type { PermissionSetting } from "../background-modules/types"; // For potential use with permission settings

// Define a type for the consent request data we expect from session storage
interface ConsentRequestData {
    appName: string;
    appIconUrl?: string;
    origin: string;
    appId: string;
    requestedPermissions: string[];
    activeDid?: string; // The DID this request is for
}

const ConsentRequestPage: React.FC = () => {
    const [consentRequest, setConsentRequest] = useState<ConsentRequestData | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(true);

    // Temporary state for permission choices - will be more complex later
    const [permissionChoices, setPermissionChoices] = useState<Record<string, PermissionSetting>>({});

    useEffect(() => {
        const fetchConsentRequest = async () => {
            setIsLoading(true);
            setError(null);
            try {
                const result = await chrome.storage.session.get(PENDING_CONSENT_REQUEST_KEY);
                if (result && result[PENDING_CONSENT_REQUEST_KEY]) {
                    const data = result[PENDING_CONSENT_REQUEST_KEY] as ConsentRequestData;
                    setConsentRequest(data);
                    // Initialize permissionChoices based on requestedPermissions (default to 'ask' or a predefined default)
                    const initialChoices: Record<string, PermissionSetting> = {};
                    data.requestedPermissions.forEach((perm) => {
                        // Default to 'ask', or more sophisticated logic later
                        initialChoices[perm] = perm.startsWith("read:") ? "always" : "ask";
                    });
                    setPermissionChoices(initialChoices);
                    console.log("Consent request data loaded:", data);
                } else {
                    setError("No pending consent request found.");
                    console.warn("No pending consent request found in session storage.");
                }
            } catch (e: any) {
                console.error("Error fetching consent request:", e);
                setError(e.message || "Failed to load consent request.");
            } finally {
                setIsLoading(false);
            }
        };

        fetchConsentRequest();
    }, []);

    const handlePermissionChange = (permission: string, setting: PermissionSetting) => {
        setPermissionChoices((prev) => ({ ...prev, [permission]: setting }));
    };

    const handleAllow = () => {
        // TODO: Send message to background script with allowed permissions
        // For now, just log and clear the request from session storage
        console.log("User clicked 'Allow'. Permissions chosen:", permissionChoices);
        chrome.storage.session.remove(PENDING_CONSENT_REQUEST_KEY);
        // TODO: Navigate away or close side panel? Or show success message.
        setError("Permissions granted (mocked). You can close this panel or navigate away.");
        setConsentRequest(null); // Clear the UI
    };

    const handleDeny = () => {
        // TODO: Send message to background script indicating denial
        console.log("User clicked 'Deny'.");
        chrome.storage.session.remove(PENDING_CONSENT_REQUEST_KEY);
        setError("Permissions denied (mocked). You can close this panel or navigate away.");
        setConsentRequest(null); // Clear the UI
    };

    if (isLoading) {
        return <div style={{ padding: "20px" }}>Loading consent request...</div>;
    }

    if (error || !consentRequest) {
        return <div style={{ padding: "20px", color: "red" }}>Error: {error || "Could not load consent data."}</div>;
    }

    return (
        <div style={{ padding: "20px", fontFamily: "Arial, sans-serif" }}>
            <div style={{ display: "flex", alignItems: "center", marginBottom: "20px" }}>
                {consentRequest.appIconUrl && (
                    <img
                        src={consentRequest.appIconUrl}
                        alt={`${consentRequest.appName} icon`}
                        style={{ width: "48px", height: "48px", marginRight: "15px", borderRadius: "8px" }}
                    />
                )}
                <div>
                    <h1 style={{ fontSize: "20px", margin: 0, fontWeight: "bold" }}>{consentRequest.appName}</h1>
                    <p style={{ fontSize: "12px", color: "#555", margin: "0" }}>({consentRequest.origin})</p>
                </div>
            </div>

            <p style={{ marginBottom: "15px" }}>
                <strong>{consentRequest.appName}</strong> wants to access the following permissions for your Vibe identity:
                <strong>{consentRequest.activeDid ? consentRequest.activeDid.substring(0, 20) + "..." : "Unknown DID"}</strong>.
            </p>

            <div style={{ marginBottom: "25px" }}>
                {consentRequest.requestedPermissions.map((permission) => (
                    <div key={permission} style={{ marginBottom: "15px", padding: "10px", border: "1px solid #eee", borderRadius: "4px" }}>
                        <p style={{ fontWeight: "500", margin: "0 0 8px 0" }}>{permission}</p>
                        <div>
                            {(["always", "ask", "never"] as PermissionSetting[]).map((setting) => (
                                <label key={setting} style={{ marginRight: "15px", fontSize: "14px" }}>
                                    <input
                                        type="radio"
                                        name={permission}
                                        value={setting}
                                        checked={permissionChoices[permission] === setting}
                                        onChange={() => handlePermissionChange(permission, setting)}
                                        style={{ marginRight: "5px" }}
                                    />
                                    {setting.charAt(0).toUpperCase() + setting.slice(1)}
                                </label>
                            ))}
                        </div>
                    </div>
                ))}
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px" }}>
                <button onClick={handleDeny} style={{ padding: "10px 20px", borderRadius: "4px", border: "1px solid #ccc", cursor: "pointer" }}>
                    Deny
                </button>
                <button
                    onClick={handleAllow}
                    style={{ padding: "10px 20px", borderRadius: "4px", border: "none", backgroundColor: "#007bff", color: "white", cursor: "pointer" }}
                >
                    Allow
                </button>
            </div>
        </div>
    );
};

export default ConsentRequestPage;
