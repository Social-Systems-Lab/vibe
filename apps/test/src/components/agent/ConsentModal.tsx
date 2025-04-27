import React, { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import type { AppManifest, ConsentRequest, PermissionSetting } from "@/vibe/types"; // Adjust path as needed

interface ConsentModalProps {
    isOpen: boolean;
    request: ConsentRequest | null;
    onDecision: (grantedPermissions: Record<string, PermissionSetting> | null) => void; // null if denied
}

// Helper to get a user-friendly description for a permission scope
const getPermissionDescription = (scope: string): string => {
    const parts = scope.split(":");
    const action = parts[0];
    const target = parts.slice(1).join(":"); // Handle potential colons in target

    switch (action) {
        case "read":
            return `Read data from your "${target}" collection.`;
        case "write":
            return `Write data to your "${target}" collection.`;
        // Add more cases for other actions as needed
        default:
            return `Perform action "${action}" on "${target}".`;
    }
};

export function ConsentModal({ isOpen, request, onDecision }: ConsentModalProps) {
    const [permissionSettings, setPermissionSettings] = useState<Record<string, PermissionSetting>>({});

    // Initialize local state when the request changes
    React.useEffect(() => {
        if (request) {
            const initialSettings: Record<string, PermissionSetting> = {};
            request.requestedPermissions.forEach((scope) => {
                // Use existing permission if available, otherwise default (read=always, other=ask)
                initialSettings[scope] = request.existingPermissions[scope] ?? (scope.startsWith("read:") ? "always" : "ask");
            });
            setPermissionSettings(initialSettings);
        } else {
            setPermissionSettings({}); // Reset if no request
        }
    }, [request]);

    const handlePermissionChange = (scope: string, value: PermissionSetting) => {
        setPermissionSettings((prev) => ({ ...prev, [scope]: value }));
    };

    const handleAllow = () => {
        onDecision(permissionSettings);
    };

    const handleDeny = () => {
        onDecision(null); // Signal denial
    };

    if (!request) {
        return null; // Don't render if no request
    }

    const { manifest, newPermissions = [] } = request; // Destructure newPermissions with default

    // Separate permissions into new and existing
    const newPermissionsSet = new Set(newPermissions);
    const newPermissionsToDisplay = request.requestedPermissions.filter((scope) => newPermissionsSet.has(scope));
    const existingPermissionsToDisplay = request.requestedPermissions.filter((scope) => !newPermissionsSet.has(scope));

    // Helper function to render a permission item
    const renderPermissionItem = (scope: string) => (
        <div key={scope} className="border p-3 rounded-md">
            <p className="text-sm font-semibold mb-2">{getPermissionDescription(scope)}</p>
            <RadioGroup
                value={permissionSettings[scope]}
                onValueChange={(value) => handlePermissionChange(scope, value as PermissionSetting)}
                className="flex space-x-4"
            >
                <div className="flex items-center space-x-2">
                    <RadioGroupItem value="always" id={`${scope}-always`} />
                    <Label htmlFor={`${scope}-always`}>Always</Label>
                </div>
                <div className="flex items-center space-x-2">
                    <RadioGroupItem value="ask" id={`${scope}-ask`} />
                    <Label htmlFor={`${scope}-ask`}>Ask</Label>
                </div>
                <div className="flex items-center space-x-2">
                    <RadioGroupItem value="never" id={`${scope}-never`} />
                    <Label htmlFor={`${scope}-never`}>Never</Label>
                </div>
            </RadioGroup>
        </div>
    );

    return (
        <Dialog open={isOpen} onOpenChange={(open) => !open && handleDeny()}>
            {" "}
            {/* Consider denying if closed */}
            <DialogContent className="sm:max-w-[425px]">
                <DialogHeader>
                    <DialogTitle className="flex items-center space-x-2">
                        <Avatar className="h-6 w-6">
                            <AvatarImage src={manifest.pictureUrl} alt={manifest.name} />
                            <AvatarFallback>{manifest.name.charAt(0).toUpperCase()}</AvatarFallback>
                        </Avatar>
                        <span>Permission Request</span>
                    </DialogTitle>
                    <DialogDescription>
                        The application <span className="font-semibold">{manifest.name}</span> ({request.origin}) wants access to your Vibe data.
                        {manifest.description && <p className="text-sm mt-1">{manifest.description}</p>}
                    </DialogDescription>
                </DialogHeader>

                <div className="py-4 space-y-6 max-h-[60vh] overflow-y-auto px-1">
                    {/* New Permissions Section */}
                    {newPermissionsToDisplay.length > 0 && (
                        <div className="space-y-4">
                            <p className="text-sm font-medium text-primary">New Permissions Requested:</p>
                            {newPermissionsToDisplay.map(renderPermissionItem)}
                        </div>
                    )}

                    {/* Existing Permissions Section */}
                    {existingPermissionsToDisplay.length > 0 && (
                        <div className="space-y-4">
                            <p className="text-sm font-medium text-muted-foreground">
                                {newPermissionsToDisplay.length > 0 ? "Previously Granted Permissions:" : "Requested Permissions:"}
                            </p>
                            {existingPermissionsToDisplay.map(renderPermissionItem)}
                        </div>
                    )}
                </div>

                <DialogFooter>
                    <Button variant="outline" onClick={handleDeny}>
                        Deny
                    </Button>
                    <Button onClick={handleAllow}>Allow</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
