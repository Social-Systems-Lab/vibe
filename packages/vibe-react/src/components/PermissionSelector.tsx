"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { UsersIcon } from "lucide-react";
import { PermissionPickerDialog } from "./PermissionPickerDialog";
import { Acl } from "vibe-sdk";
import { useVibe } from "@/index";

interface PermissionSelectorProps {
    acl: Acl;
    onAclChange: (acl: Acl) => void;
}

export function PermissionSelector({ acl, onAclChange }: PermissionSelectorProps) {
    const { user } = useVibe();
    const [dialogOpen, setDialogOpen] = useState(false);
    if (!user) {
        return null;
    }

    const handleSelectPermission = (permission: string) => {
        let newAcl: Acl;
        switch (permission) {
            case "admins":
                newAcl = { read: { allow: [{ issuer: user.did, type: "admin-of" }] } };
                break;
            case "moderators":
                newAcl = { read: { allow: [{ issuer: user.did, type: "moderator-of" }] } };
                break;
            case "friends":
                newAcl = { read: { allow: [{ issuer: user.did, type: "friend-of" }] } };
                break;
            case "members":
                newAcl = { read: { allow: [{ issuer: user.did, type: "member-of" }] } };
                break;
            case "followers":
                newAcl = { read: { allow: [{ issuer: user.did, type: "follower-of" }] } };
                break;
            case "me":
                newAcl = {};
                break;
            default:
                newAcl = { read: { allow: ["*"] } };
        }
        onAclChange(newAcl);
        setDialogOpen(false);
    };

    const getPermissionFromAcl = (currentAcl: Acl): string => {
        const allowRule = currentAcl.read?.allow?.[0];
        if (!allowRule) {
            return "me";
        }
        if (Array.isArray(allowRule)) {
            return "custom";
        }
        if (typeof allowRule === "object" && allowRule.issuer === user.did) {
            switch (allowRule.type) {
                case "admin-of":
                    return "admins";
                case "moderator-of":
                    return "moderators";
                case "friend-of":
                    return "friends";
                case "member-of":
                    return "members";
                case "follower-of":
                    return "followers";
            }
        }
        return "everyone";
    };

    const selectedPermission = getPermissionFromAcl(acl);

    return (
        <>
            <Button variant="outline" size="sm" className="mt-1" onClick={() => setDialogOpen(true)}>
                <UsersIcon className="w-4 h-4 mr-2" />
                {selectedPermission.charAt(0).toUpperCase() + selectedPermission.slice(1)}
            </Button>
            <PermissionPickerDialog open={dialogOpen} onOpenChange={setDialogOpen} onSelect={handleSelectPermission} />
        </>
    );
}
