import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Checkbox } from "@/components/ui/checkbox"; // Assuming Checkbox is added/available
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area"; // Assuming ScrollArea is added/available
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"; // Assuming Tabs is added/available
import type { ActionRequest, ActionResponse } from "@/vibe/types"; // Adjust path as needed

interface ActionPromptModalProps {
    isOpen: boolean;
    request: ActionRequest | null;
    onDecision: (response: ActionResponse) => void;
}

// Fields to exclude from structured view (can be customized)
const EXCLUDED_FIELDS = ["_id", "_rev", "$collection"];

// Helper to render structured data fields
function renderStructuredFields(doc: any) {
    if (!doc || typeof doc !== "object") {
        return <p className="text-xs text-muted-foreground">Invalid data format.</p>;
    }
    return Object.entries(doc)
        .filter(([k]) => !EXCLUDED_FIELDS.includes(k))
        .map(([key, value]) => {
            const displayValue = typeof value === "object" ? JSON.stringify(value, null, 2) : String(value);
            return (
                <div className="mb-2 text-xs" key={key}>
                    <span className="font-semibold text-muted-foreground">{key}: </span>
                    <span className="font-mono break-all">{displayValue}</span>
                </div>
            );
        });
}

export function ActionPromptModal({ isOpen, request, onDecision }: ActionPromptModalProps) {
    const [rememberChoice, setRememberChoice] = useState(false);
    const [showData, setShowData] = useState(false); // State to toggle data visibility

    // Reset state when the request changes or modal closes
    useEffect(() => {
        if (!isOpen) {
            setRememberChoice(false);
            setShowData(false);
        }
    }, [isOpen]);

    const handleAllow = () => {
        onDecision({ allowed: true, rememberChoice });
    };

    const handleDeny = () => {
        onDecision({ allowed: false, rememberChoice }); // Still pass rememberChoice for 'never' update
    };

    if (!request) {
        return null;
    }

    const { actionType, collection, identity, appInfo, data, filter } = request;
    const isWrite = actionType === "write";
    const docCount = isWrite ? (Array.isArray(data) ? data.length : 1) : undefined; // Count for write actions

    const actionDescription = isWrite ? `write ${docCount} document${docCount !== 1 ? "s" : ""} to` : `read data from`;

    const dataToPreview = isWrite ? data : filter; // Preview write data or read filter

    return (
        <Dialog open={isOpen} onOpenChange={(open) => !open && handleDeny()}>
            {" "}
            {/* Deny if closed */}
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle className="flex items-center space-x-2">
                        <Avatar className="h-6 w-6">
                            <AvatarImage src={appInfo.pictureUrl} alt={appInfo.name} />
                            <AvatarFallback>{appInfo.name.charAt(0).toUpperCase()}</AvatarFallback>
                        </Avatar>
                        <span>Action Required</span>
                    </DialogTitle>
                    <DialogDescription>
                        <span className="font-semibold">{appInfo.name}</span> wants to <span className="font-semibold">{actionDescription}</span> the{" "}
                        <span className="font-semibold">{collection}</span> collection using identity <span className="font-semibold">{identity.label}</span>.
                    </DialogDescription>
                </DialogHeader>

                <div className="py-2 space-y-3">
                    {/* Data Preview Section */}
                    <Button variant="outline" size="sm" onClick={() => setShowData(!showData)}>
                        {showData ? "Hide" : "View"} {isWrite ? "Data" : "Filter"} Details
                    </Button>

                    {showData && dataToPreview && (
                        <Tabs defaultValue="structured" className="w-full">
                            <TabsList className="grid w-full grid-cols-2">
                                <TabsTrigger value="structured">Structured</TabsTrigger>
                                <TabsTrigger value="raw">Raw JSON</TabsTrigger>
                            </TabsList>
                            <ScrollArea className="h-40 w-full rounded-md border p-2 mt-2">
                                <TabsContent value="structured">
                                    {isWrite
                                        ? Array.isArray(dataToPreview)
                                            ? dataToPreview.map((doc, index) => (
                                                  <div key={index} className="mb-2 border-b pb-2">
                                                      <p className="text-xs font-semibold mb-1">Document {index + 1}</p>
                                                      {renderStructuredFields(doc)}
                                                  </div>
                                              ))
                                            : renderStructuredFields(dataToPreview)
                                        : renderStructuredFields(
                                              dataToPreview
                                          ) // Render filter structured
                                    }
                                </TabsContent>
                                <TabsContent value="raw">
                                    <pre className="text-xs font-mono break-all whitespace-pre-wrap">{JSON.stringify(dataToPreview, null, 2)}</pre>
                                </TabsContent>
                            </ScrollArea>
                        </Tabs>
                    )}
                    {showData && !dataToPreview && (
                        <p className="text-xs text-muted-foreground p-2 border rounded-md">No {isWrite ? "data" : "filter"} provided.</p>
                    )}

                    {/* Remember Choice Checkbox */}
                    <div className="flex items-center space-x-2 pt-2">
                        <Checkbox id="remember-choice" checked={rememberChoice} onCheckedChange={(checked) => setRememberChoice(Boolean(checked))} />
                        <Label htmlFor="remember-choice" className="text-sm">
                            Remember my choice for this action
                        </Label>
                    </div>
                </div>

                <DialogFooter className="sm:justify-between">
                    <Button variant="outline" onClick={handleDeny}>
                        Deny
                    </Button>
                    <Button onClick={handleAllow}>Allow</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
