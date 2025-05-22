import React, { useState, useCallback } from "react";
import { useAtom } from "jotai";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ArrowLeft, Loader2 } from "lucide-react"; // Added ArrowLeft and Loader2
import {
    appStatusAtom,
    isLoadingIdentityAtom,
    unlockErrorAtom, // Can be used for general errors on this page too
} from "../store/appAtoms";
// Define ChromeMessage type, consider moving to a shared types file
interface ChromeMessage {
    type: string;
    payload?: any;
    error?: { message?: string; [key: string]: any };
    [key: string]: any;
}

export const ImportIdentityPage: React.FC = () => {
    const [mnemonic, setMnemonic] = useState("");
    const [password, setPassword] = useState("");
    const [isImporting, setIsImporting] = useAtom(isLoadingIdentityAtom); // Use global loading state
    const [, setAppStatus] = useAtom(appStatusAtom);
    const [localError, setLocalError] = useAtom(unlockErrorAtom); // Use global error atom or a local one
    const [, setLocation] = useLocation();

    const handleSubmit = useCallback(async () => {
        if (!mnemonic.trim()) {
            setLocalError("Please enter your master seed phrase.");
            return;
        }
        setLocalError(null);
        setIsImporting(true);

        try {
            const response = (await chrome.runtime.sendMessage({
                type: "VIBE_AGENT_REQUEST",
                action: "SETUP_IMPORT_SEED_AND_RECOVER_IDENTITIES",
                payload: {
                    importedMnemonic: mnemonic.trim(),
                    password: password.trim() || undefined,
                },
                requestId: crypto.randomUUID().toString(),
            })) as ChromeMessage;

            if (response?.type === "VIBE_AGENT_RESPONSE" && response.payload?.success) {
                alert(`Identity import process completed: ${response.payload.message || "Success!"}`);
                // Successfully imported. App state should reflect this.
                // The useAppInitializer's storage listener should ideally pick up changes and navigate.
                // Or, we can set status and navigate.
                setAppStatus("INITIALIZED_UNLOCKED"); // Assuming import means vault is now set up and unlocked
                setLocation("/");
                // DashboardPage will then load all identities.
            } else if (response?.type === "VIBE_AGENT_RESPONSE_ERROR") {
                setLocalError(response.error?.message || "Failed to import identity.");
            } else {
                setLocalError("Unexpected response during import operation.");
            }
        } catch (error: any) {
            console.error("Error during import submission:", error);
            setLocalError(error.message || "An error occurred during import.");
        } finally {
            setIsImporting(false);
        }
    }, [mnemonic, password, setIsImporting, setAppStatus, setLocalError, setLocation]);

    const handleCancel = () => {
        setLocation("/"); // Or to settings, depending on where user came from
    };

    return (
        <div className="p-6 bg-background text-foreground flex flex-col gap-4 h-full">
            <div className="flex items-center mb-2">
                <Button onClick={handleCancel} variant="ghost" size="icon" className="mr-2">
                    <ArrowLeft className="h-5 w-5" />
                </Button>
                <h2 className="text-xl font-semibold">Import Identity</h2>
            </div>
            <p className="text-sm text-muted-foreground text-center">
                Enter your master seed phrase (mnemonic) to import your Vibe identities. If your previous vault was encrypted, also provide the password.
            </p>

            <div className="flex flex-col gap-2">
                <Label htmlFor="mnemonic">Master Seed Phrase (Mnemonic)</Label>
                <Input
                    id="mnemonic"
                    type="text"
                    value={mnemonic}
                    onChange={(e) => setMnemonic(e.target.value)}
                    placeholder="Enter your 12 or 24 word seed phrase"
                    disabled={isImporting}
                    className="bg-input border-border placeholder:text-muted-foreground/70"
                />
            </div>

            <div className="flex flex-col gap-2">
                <Label htmlFor="password">Vault Password (if any)</Label>
                <Input
                    id="password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Optional: if vault was encrypted"
                    disabled={isImporting}
                    className="bg-input border-border placeholder:text-muted-foreground/70"
                />
            </div>

            {localError && <p className="text-sm text-red-500 text-center">{localError}</p>}

            <div className="flex gap-2 mt-auto pt-4">
                {" "}
                {/* Pushes buttons to bottom */}
                <Button variant="outline" onClick={handleCancel} className="w-full" disabled={isImporting}>
                    Cancel
                </Button>
                <Button onClick={handleSubmit} className="w-full" disabled={isImporting || !mnemonic.trim()}>
                    {isImporting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                    {isImporting ? "Importing..." : "Import"}
                </Button>
            </div>
        </div>
    );
};

export default ImportIdentityPage;
