import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface ImportIdentityWizardProps {
    onImportComplete: (mnemonic: string, password?: string) => void;
    onCancel: () => void;
}

export const ImportIdentityWizard: React.FC<ImportIdentityWizardProps> = ({ onImportComplete, onCancel }) => {
    const [mnemonic, setMnemonic] = useState("");
    const [password, setPassword] = useState(""); // Optional password for the existing vault/seed

    const handleSubmit = () => {
        // Basic validation
        if (!mnemonic.trim()) {
            alert("Please enter your master seed phrase.");
            return;
        }
        // Password might be optional depending on how the seed was originally secured
        onImportComplete(mnemonic.trim(), password.trim() || undefined);
    };

    return (
        <div className="p-4 bg-background text-foreground flex flex-col gap-4 rounded-lg shadow-xl">
            <h2 className="text-xl font-semibold text-center">Import Identity</h2>
            <p className="text-sm text-muted-foreground text-center">
                Enter your master seed phrase (mnemonic) to import your Vibe identity. If your previous vault was encrypted, you might also need to provide the
                password.
            </p>

            <div className="flex flex-col gap-2">
                <Label htmlFor="mnemonic">Master Seed Phrase (Mnemonic)</Label>
                <Input
                    id="mnemonic"
                    type="text"
                    value={mnemonic}
                    onChange={(e) => setMnemonic(e.target.value)}
                    placeholder="Enter your 12 or 24 word seed phrase"
                />
            </div>

            <div className="flex flex-col gap-2">
                <Label htmlFor="password">Vault Password (if any)</Label>
                <Input
                    id="password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Optional: Enter password if vault was encrypted"
                />
            </div>

            <div className="flex gap-2 mt-4">
                <Button variant="outline" onClick={onCancel} className="w-full">
                    Cancel
                </Button>
                <Button onClick={handleSubmit} className="w-full">
                    Import
                </Button>
            </div>
        </div>
    );
};
