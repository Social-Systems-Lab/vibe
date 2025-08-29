"use client";

import React, { useEffect, useState } from "react";
import { useVibe } from "./VibeProvider";
import { getStreamUrl, UrlStrategy } from "../lib/storage";
import { FileDoc } from "vibe-sdk";

export type VibeImageProps = Omit<React.ImgHTMLAttributes<HTMLImageElement>, "src"> & {
    src?: FileDoc | string; // optional fallback src when no storageKey is provided
    strategy?: UrlStrategy; // default "stream"/"auto" for first-party
};

/**
 * VibeImage renders an <img> for a storage object.
 * - For first-party UI: pass storageKey; it will build a /storage/stream URL.
 * - For third-party/cross-origin cases: use strategy="presigned" (to be wired via SDK as needed).
 * - If storageKey is not provided, falls back to "src" prop.
 */
export function VibeImage({ src, strategy = "auto", alt = "", ...rest }: VibeImageProps) {
    const { apiBase } = useVibe();
    const [imgUrl, setImgUrl] = useState<string | null>(null);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            if ((file.mimeType || "").startsWith("image/") && file.storageKey) {
                const u = getStreamUrl(apiBase, file.storageKey);
                if (!cancelled) setImgUrl(u || null);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [apiBase, file.storageKey, file.mimeType]);

    const resolved = src?.storageKey ? getStreamUrl(apiBase, src.storageKey) : src;

    if (!resolved) {
        // Render nothing if we have neither storageKey nor src
        return null;
    }

    // Note: For future presigned support, a hook can resolve and refresh URLs here.
    return <img src={resolved} alt={alt} {...rest} />;
}

export default VibeImage;
