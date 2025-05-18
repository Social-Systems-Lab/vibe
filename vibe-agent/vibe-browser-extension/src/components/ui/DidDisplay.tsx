import React, { useState, useCallback } from "react";
import { Copy, Check, Key, KeyRound } from "lucide-react";
import { cn } from "@/lib/utils";

interface DidDisplayProps {
    did: string | null | undefined;
    className?: string;
    prefix?: string; // e.g., "did:vibe" or allow full customization
    truncateLength?: number;
}

export const DidDisplay: React.FC<DidDisplayProps> = ({
    did,
    className,
    prefix = "did:vibe", // Default prefix
    truncateLength = 7, // Default to last 7 characters
}) => {
    const [copied, setCopied] = useState(false);

    const handleCopy = useCallback(
        async (event: React.MouseEvent) => {
            event.stopPropagation(); // Prevent any parent onClick events
            if (!did) return;
            try {
                await navigator.clipboard.writeText(did);
                setCopied(true);
                setTimeout(() => setCopied(false), 2000); // Reset after 2 seconds
            } catch (err) {
                console.error("Failed to copy DID:", err);
                // TODO: Consider user feedback for copy failure
            }
        },
        [did]
    );

    if (!did) {
        return <span className={cn("text-xs text-muted-foreground", className)}>(No DID)</span>;
    }

    const shortDid = did.slice(-truncateLength); //`${prefix}...${did.slice(-truncateLength)}`;

    return (
        <span
            className={cn(
                "text-xs text-muted-foreground font-mono cursor-pointer inline-flex items-center gap-1 hover:text-foreground transition-colors",
                className
            )}
            title={`${did} (click to copy)`}
            onClick={handleCopy}
        >
            {/* <KeyRound className="h-3 w-3" /> */}
            {shortDid}

            {/* {copied ? <Check className="h-3 w-3 text-green-500" /> : <Copy className="h-3 w-3" />} */}
        </span>
    );
};
