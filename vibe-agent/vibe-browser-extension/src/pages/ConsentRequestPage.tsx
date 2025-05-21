import React, { useEffect, useState } from "react";
import { useLocation } from "wouter"; // Import useLocation
import { X } from "lucide-react"; // Import X icon
import { PENDING_CONSENT_REQUEST_KEY } from "../background-modules/action-handlers/app-session.handler";
import type { PermissionSetting } from "../background-modules/types"; // For potential use with permission settings

// Define a type for the consent request data we expect from session storage
export const CONSENT_OUTCOME_TOAST_KEY = "consentOutcomeToast"; // Export for DashboardPage

interface ConsentRequestData {
    appName: string;
    appIconUrl?: string;
    origin: string;
    appId: string;
    requestedPermissions: string[];
    activeDid?: string; // The DID this request is for
    consentRequestId?: string; // Added to carry the ID for the pending promise
    currentPermissions?: Record<string, PermissionSetting>; // For re-consent flow
}

const ConsentRequestPage: React.FC = () => {
    const [consentRequest, setConsentRequest] = useState<ConsentRequestData | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [submissionStatus, setSubmissionStatus] = useState<"idle" | "submitting" | "success" | "error">("idle");
    const [submissionMessage, setSubmissionMessage] = useState<string | null>(null);
    const [, setLocation] = useLocation(); // For navigation

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

                    if (data.currentPermissions) {
                        setPermissionChoices(data.currentPermissions);
                        console.log("ConsentRequestPage: Initialized permissionChoices from currentPermissions", data.currentPermissions);
                    } else {
                        // Initialize permissionChoices based on requestedPermissions (default to 'ask' or a predefined default)
                        const initialChoices: Record<string, PermissionSetting> = {};
                        data.requestedPermissions.forEach((perm) => {
                            // Default to 'ask', or more sophisticated logic later
                            initialChoices[perm] = perm.startsWith("read:") ? "always" : "ask";
                        });
                        setPermissionChoices(initialChoices);
                        console.log("ConsentRequestPage: Initialized permissionChoices with defaults", initialChoices);
                    }
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

    const submitDecision = async (decisionType: "allow" | "deny") => {
        if (!consentRequest) {
            setSubmissionMessage("Error: Consent request data is missing.");
            setSubmissionStatus("error");
            return;
        }
        if (!consentRequest.activeDid) {
            setSubmissionMessage("Error: Active DID is missing from consent request.");
            setSubmissionStatus("error");
            return;
        }
        if (!consentRequest.consentRequestId) {
            setSubmissionMessage("Error: Consent Request ID is missing. Cannot submit decision.");
            setSubmissionStatus("error");
            return;
        }

        setSubmissionStatus("submitting");
        setSubmissionMessage(null);

        const payload = {
            appId: consentRequest.appId,
            origin: consentRequest.origin,
            activeDid: consentRequest.activeDid,
            grantedPermissions: decisionType === "allow" ? permissionChoices : {},
            decision: decisionType,
            consentRequestId: consentRequest.consentRequestId, // Include consentRequestId
        };

        try {
            const response = await chrome.runtime.sendMessage({
                type: "VIBE_AGENT_REQUEST",
                action: "SUBMIT_CONSENT_DECISION",
                requestId: payload.consentRequestId, // Added requestId
                payload: payload,
            });

            if (response?.payload?.success) {
                const toastMessage = decisionType === "allow" ? "Permissions granted successfully!" : "Permissions denied.";
                try {
                    await chrome.storage.session.set({ [CONSENT_OUTCOME_TOAST_KEY]: toastMessage });
                    // No longer setSubmissionStatus or submissionMessage here for success, as we navigate immediately.
                    // The PENDING_CONSENT_REQUEST_KEY is cleared by the background script.
                    setLocation("/"); // Immediate navigation
                } catch (storageError) {
                    console.error("Error setting toast message in session storage:", storageError);
                    // Fallback: show message on current page if storage fails, then navigate
                    setSubmissionStatus("success"); // Still show success locally if storage fails
                    setSubmissionMessage(toastMessage);
                    setTimeout(() => setLocation("/"), 2000); // Navigate after delay
                }
            } else {
                setSubmissionStatus("error");
                setSubmissionMessage(response?.payload?.error || response?.error || "Failed to submit consent decision.");
                console.error("Error submitting consent decision:", response?.payload?.error || response?.error);
            }
        } catch (e: any) {
            setSubmissionStatus("error");
            setSubmissionMessage(e.message || "An unexpected error occurred.");
            console.error("Exception submitting consent decision:", e);
        }
    };

    const handleAllow = () => {
        submitDecision("allow");
    };

    const handleDeny = () => {
        submitDecision("deny");
    };

    const handleCloseIconClick = () => {
        // This will also trigger navigation to "/" via submitDecision's logic for "deny"
        submitDecision("deny");
    };

    if (isLoading) {
        return <div style={{ padding: "20px" }}>Loading consent request...</div>;
    }

    if (error && submissionStatus === "idle") {
        // Show initial loading error only if not already in submission flow
        return <div style={{ padding: "20px", color: "red" }}>Error: {error}</div>;
    }

    if (submissionStatus === "submitting") {
        return <div style={{ padding: "20px" }}>Submitting your decision...</div>;
    }

    // This view will now only be shown for errors, as success leads to immediate navigation.
    if (submissionStatus === "error") {
        return (
            <div style={{ padding: "20px", color: "red" }}>
                {submissionMessage || "An error occurred."}
                {/* Optionally add a button to go back or try again */}
            </div>
        );
    }
    // The "success" state view is removed as navigation is immediate.

    if (!consentRequest) {
        // This case should ideally be covered by isLoading or error state,
        // but as a fallback if consentRequest becomes null after initial load without submission.
        return <div style={{ padding: "20px", color: "orange" }}>No active consent request. You can close this panel.</div>;
    }

    return (
        <div style={{ padding: "20px", fontFamily: "Arial, sans-serif", position: "relative" }}>
            <button
                onClick={handleCloseIconClick}
                style={{
                    position: "absolute",
                    top: "15px",
                    right: "15px",
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                    padding: "5px",
                    lineHeight: "1",
                }}
                disabled={submissionStatus === "submitting"}
                aria-label="Close and Deny"
            >
                <X size={20} color={submissionStatus === "submitting" ? "#ccc" : "#555"} />
            </button>
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
                <button
                    onClick={handleDeny}
                    style={{ padding: "10px 20px", borderRadius: "4px", border: "1px solid #ccc", cursor: "pointer", backgroundColor: "white" }}
                    disabled={submissionStatus === "submitting"}
                >
                    Deny
                </button>
                <button
                    onClick={handleAllow}
                    style={{ padding: "10px 20px", borderRadius: "4px", border: "none", backgroundColor: "#007bff", color: "white", cursor: "pointer" }}
                    disabled={submissionStatus === "submitting"}
                >
                    Allow
                </button>
            </div>
        </div>
    );
};

export default ConsentRequestPage;
