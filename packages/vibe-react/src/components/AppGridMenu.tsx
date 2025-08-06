"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { cn } from "../lib/utils";

type AppGridMenuProps = {
    /**
     * Path on the API origin that proxies to the cloud-ui grid page.
     * Using /auth/app-grid would be ideal if proxied; for now we use /app-grid which exists in cloud-ui and
     * will be reachable via the API proxy domain (same origin as cookies).
     */
    src?: string;
    /**
     * Button content override
     */
    buttonLabel?: React.ReactNode;
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

export function AppGridMenu({ src = "/app-grid", buttonLabel, className, panelClassName, width = 420, height = 480 }: AppGridMenuProps) {
    const [open, setOpen] = useState(false);
    const panelRef = useRef<HTMLDivElement>(null);
    const iframeRef = useRef<HTMLIFrameElement>(null);

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
                className={cn("inline-flex items-center justify-center rounded-md border border-gray-200 bg-white px-3 py-2 text-sm font-medium shadow-sm hover:bg-gray-50", className)}
                onClick={() => setOpen((v) => !v)}
                aria-expanded={open}
                aria-haspopup="dialog"
            >
                {buttonLabel ?? (
                    <span className="flex items-center gap-2">
                        <span style={{ fontSize: 16 }}>▦</span>
                        <span>Apps</span>
                    </span>
                )}
            </button>
        ),
        [buttonLabel, className, open]
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
                        src={src}
                        title="Your Apps"
                        style={{ width: "100%", height: "100%", border: "none", background: "transparent" }}
                        sandbox="allow-scripts allow-same-origin allow-popups"
                    />
                </div>
            )}
        </div>
    );
}
