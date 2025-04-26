import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"; // Assuming Select is added/available
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"; // Assuming Table is added/available
import { Trash2, Edit } from "lucide-react"; // Example icons
import type { Identity, PermissionSetting } from "@/vibe/types"; // Adjust path as needed

// Type for the permissions data structure expected by this component
// Example: { "https://example.com": { "read:notes": "always", "write:tasks": "ask" }, ... }
type OriginPermissions = Record<string, Record<string, PermissionSetting>>;

interface PermissionManagerProps {
    identities: Identity[];
    selectedIdentityDid: string | null;
    permissionsData: OriginPermissions; // Permissions for the selected identity
    onSelectIdentity: (did: string) => void;
    onUpdatePermission: (origin: string, scope: string, setting: PermissionSetting) => void;
    onRevokeOrigin: (origin: string) => void;
    // TODO: Add callback for closing/navigating away
}

export function PermissionManager({
    identities = [],
    selectedIdentityDid,
    permissionsData = {},
    onSelectIdentity,
    onUpdatePermission,
    onRevokeOrigin,
}: PermissionManagerProps) {
    const selectedIdentity = identities.find((id) => id.did === selectedIdentityDid);

    // TODO: Implement inline editing logic for permission settings if needed,
    // or trigger a separate modal for editing. For now, just display.

    return (
        <Card>
            <CardHeader>
                <CardTitle>Permission Management</CardTitle>
                <CardDescription>View and manage permissions granted to applications for your identities.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
                {/* Identity Selector */}
                <div>
                    <label htmlFor="identity-select" className="text-sm font-medium mb-1 block">
                        Select Identity
                    </label>
                    <Select value={selectedIdentityDid ?? ""} onValueChange={onSelectIdentity}>
                        <SelectTrigger id="identity-select" className="w-[280px]">
                            <SelectValue placeholder="Select an identity..." />
                        </SelectTrigger>
                        <SelectContent>
                            {identities.map((id) => (
                                <SelectItem key={id.did} value={id.did}>
                                    {id.label} ({id.did.substring(0, 12)}...)
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>

                {/* Permissions Table/List */}
                {selectedIdentityDid && Object.keys(permissionsData).length > 0 && (
                    <div className="border rounded-md">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Application (Origin)</TableHead>
                                    <TableHead>Permission Scope</TableHead>
                                    <TableHead>Setting</TableHead>
                                    <TableHead className="text-right">Actions</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {Object.entries(permissionsData).map(([origin, scopes]) =>
                                    Object.entries(scopes).map(([scope, setting], index) => (
                                        <TableRow key={`${origin}-${scope}`}>
                                            {index === 0 && ( // Show origin only for the first scope of that origin
                                                <TableCell rowSpan={Object.keys(scopes).length} className="font-medium align-top pt-3">
                                                    {origin}
                                                </TableCell>
                                            )}
                                            <TableCell>{scope}</TableCell>
                                            <TableCell>
                                                {/* TODO: Replace with editable component (e.g., Select or RadioGroup) */}
                                                <span
                                                    className={`px-2 py-0.5 rounded-full text-xs ${
                                                        setting === "always"
                                                            ? "bg-green-100 text-green-800"
                                                            : setting === "ask"
                                                            ? "bg-yellow-100 text-yellow-800"
                                                            : "bg-red-100 text-red-800"
                                                    }`}
                                                >
                                                    {setting}
                                                </span>
                                            </TableCell>
                                            {index === 0 && ( // Show revoke button only for the first scope
                                                <TableCell rowSpan={Object.keys(scopes).length} className="text-right align-top pt-2">
                                                    <Button
                                                        variant="ghost"
                                                        size="icon"
                                                        onClick={() => onRevokeOrigin(origin)}
                                                        title={`Revoke all permissions for ${origin}`}
                                                    >
                                                        <Trash2 className="h-4 w-4" />
                                                    </Button>
                                                    {/* Add Edit button if inline editing is implemented */}
                                                    {/* <Button variant="ghost" size="icon" title="Edit permissions"><Edit className="h-4 w-4" /></Button> */}
                                                </TableCell>
                                            )}
                                        </TableRow>
                                    ))
                                )}
                            </TableBody>
                        </Table>
                    </div>
                )}
                {selectedIdentityDid && Object.keys(permissionsData).length === 0 && (
                    <p className="text-sm text-muted-foreground text-center py-4">No permissions granted for this identity yet.</p>
                )}
                {!selectedIdentityDid && <p className="text-sm text-muted-foreground text-center py-4">Please select an identity to view permissions.</p>}
            </CardContent>
        </Card>
    );
}
