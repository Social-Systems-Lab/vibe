"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { cn } from "../lib/utils";
import { useVibe } from "../components/VibeProvider";
import { LayoutGrid } from "lucide-react";

type AppGridMenuProps = {
    /**
     * Optional override for the full iframe URL. If not set, uses `${config.apiUrl}/app-grid`.
     */
    src?: string;
    /**
     * Optional className overrides
     */
    className?: string;
    /**
     * Optional style overrides for popover panel
     */
    panelClassName?: string;
    /**
     * Width x Height of iframe
     */
    width?: number;
    height?: number;
};

export function AppGridMenu({ src, className, panelClassName, width = 360, height = 560 }: AppGridMenuProps) {
    const { sdk } = useVibe();
    const [open, setOpen] = useState(false);
    const panelRef = useRef<HTMLDivElement>(null);
    const iframeRef = useRef<HTMLIFrameElement>(null);

    // Build default src from manifest config.apiUrl when not provided
    const resolvedSrc = useMemo(() => {
        try {
            const apiUrl = (sdk as any)?.config?.apiUrl || (sdk as any)?.config?.apiBaseUrl || "";
            const base = apiUrl?.replace(/\/+$/, "");
            const path = "/app-grid";
            return src || (base ? `${base}${path}` : path);
        } catch {
            return src || "/app-grid";
        }
    }, [sdk, src]);

    useEffect(() => {
        const onDocClick = (e: MouseEvent) => {
            if (!panelRef.current) return;
            if (panelRef.current.contains(e.target as Node)) return;
            setOpen(false);
        };
        document.addEventListener("mousedown", onDocClick);
        return () => document.removeEventListener("mousedown", onDocClick);
    }, []);

    useEffect(() => {
        const onMessage = (e: MessageEvent) => {
            // Minimal contract: appGridReady and optional close commands in future
            if (e?.data?.type === "appGridReady") {
                // could perform actions like resize in the future
            }
            if (e?.data?.type === "closeAppGrid") {
                setOpen(false);
            }
        };
        window.addEventListener("message", onMessage);
        return () => window.removeEventListener("message", onMessage);
    }, []);

    const button = useMemo(
        () => (
            <button
                type="button"
                className={cn("inline-flex items-center justify-center rounded-md p-2 hover:bg-gray-100", className)}
                onClick={() => setOpen((v) => !v)}
                aria-expanded={open}
                aria-haspopup="dialog"
            >
                <LayoutGrid className="h-5 w-5" />
            </button>
        ),
        [className, open]
    );

    return (
        <div className="relative inline-block">
            {button}
            {open && (
                <div
                    ref={panelRef}
                    className={cn("absolute right-0 mt-2 rounded-lg border border-gray-200 bg-white shadow-xl z-[1000] overflow-hidden", panelClassName)}
                    style={{ width, height }}
                    role="dialog"
                    aria-modal="false"
                >
                    <iframe
                        ref={iframeRef}
                        src={resolvedSrc}
                        title="Your Apps"
                        style={{ width: "100%", height: "100%", border: "none", background: "transparent" }}
                        sandbox="allow-scripts allow-same-origin allow-popups allow-forms"
                    />
                </div>
            )}
        </div>
    );
}
