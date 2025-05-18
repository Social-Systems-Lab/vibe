import React, { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

interface PasswordPromptModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSubmit: (password: string) => Promise<void>;
    title?: string;
    description?: string;
    operationInProgress?: boolean;
    errorMessage?: string;
}

export const PasswordPromptModal: React.FC<PasswordPromptModalProps> = ({
    isOpen,
    onClose,
    onSubmit,
    title = "Unlock Vault",
    description = "Please enter your vault password to continue.",
    operationInProgress = false,
    errorMessage,
}) => {
    const [password, setPassword] = useState("");
    const [currentErrorMessage, setCurrentErrorMessage] = useState(errorMessage);

    useEffect(() => {
        setCurrentErrorMessage(errorMessage);
    }, [errorMessage]);

    useEffect(() => {
        if (isOpen) {
            setPassword(""); // Clear password when modal opens
            // setCurrentErrorMessage(''); // Clear previous error messages if not passed in as a prop
        }
    }, [isOpen]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!password.trim()) {
            setCurrentErrorMessage("Password cannot be empty.");
            return;
        }
        setCurrentErrorMessage(""); // Clear local error
        try {
            await onSubmit(password);
            // If onSubmit resolves, the parent should handle closing the modal
            // or re-rendering with a new state.
            // If onSubmit throws, it will be caught below.
        } catch (error: any) {
            setCurrentErrorMessage(error.message || "An unexpected error occurred during unlock.");
        }
    };

    const handleClose = () => {
        if (!operationInProgress) {
            onClose();
        }
    };

    return (
        <Dialog open={isOpen} onOpenChange={(openState) => !openState && handleClose()}>
            <DialogContent className="sm:max-w-[425px]" onPointerDownOutside={(e) => operationInProgress && e.preventDefault()}>
                <DialogHeader>
                    <DialogTitle>{title}</DialogTitle>
                    {description && <DialogDescription>{description}</DialogDescription>}
                </DialogHeader>
                <form onSubmit={handleSubmit}>
                    <div className="grid gap-4 py-4">
                        <div className="grid grid-cols-4 items-center gap-4">
                            <Label htmlFor="password-prompt-input" className="text-right">
                                Password
                            </Label>
                            <Input
                                id="password-prompt-input"
                                type="password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                className="col-span-3"
                                disabled={operationInProgress}
                            />
                        </div>
                        {currentErrorMessage && <p className="text-sm text-red-500 col-span-4 text-center px-2">{currentErrorMessage}</p>}
                    </div>
                    <DialogFooter>
                        <Button type="button" variant="outline" onClick={handleClose} disabled={operationInProgress}>
                            Cancel
                        </Button>
                        <Button type="submit" disabled={!password.trim() || operationInProgress}>
                            {operationInProgress ? "Unlocking..." : "Unlock"}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
};
