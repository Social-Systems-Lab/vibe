"use client";

import React, { useEffect, useState } from "react";
import { useVibe } from "./VibeProvider";
import { getStreamUrl, UrlStrategy } from "../lib/storage";
import { FileDoc } from "vibe-sdk";

export type VibeImageProps = Omit<React.ImgHTMLAttributes<HTMLImageElement>, "src"> & {
    src?: FileDoc | string;
    strategy?: UrlStrategy;
    token?: string | null;
};

/**
 * VibeImage renders an <img> for a storage object.
 * - If a token is provided, it will fetch the image via an authenticated request.
 * - Otherwise, it will fall back to a direct stream URL.
 */
export function VibeImage({ src, strategy = "auto", token, alt = "", ...rest }: VibeImageProps) {
    const { apiBase } = useVibe();
    const [objectUrl, setObjectUrl] = useState<string | undefined>(undefined);

    useEffect(() => {
        let isMounted = true;
        let currentObjectUrl: string | null = null;

        const fetchAndSetImage = async () => {
            const storageKey = typeof src === "object" ? src?.storageKey : null;

            if (storageKey && token) {
                try {
                    const url = getStreamUrl(apiBase, storageKey);
                    const res = await fetch(url, {
                        headers: { Authorization: `Bearer ${token}` },
                    });
                    if (!res.ok) {
                        console.error("Failed to fetch image:", res.status, res.statusText);
                        if (isMounted) setObjectUrl(undefined);
                        return;
                    }
                    const blob = await res.blob();
                    currentObjectUrl = URL.createObjectURL(blob);
                    if (isMounted) {
                        setObjectUrl(currentObjectUrl);
                    }
                } catch (error) {
                    console.error("Error fetching image:", error);
                    if (isMounted) setObjectUrl(undefined);
                }
            } else {
                const resolved =
                    typeof src === "string" ? src : storageKey ? getStreamUrl(apiBase, storageKey) : undefined;
                if (isMounted) {
                    setObjectUrl(resolved);
                }
            }
        };

        void fetchAndSetImage();

        return () => {
            isMounted = false;
            if (currentObjectUrl) {
                URL.revokeObjectURL(currentObjectUrl);
            }
        };
    }, [src, token, apiBase]);

    if (!objectUrl) {
        return null;
    }

    return <img src={objectUrl} alt={alt} {...rest} />;
}

export default VibeImage;
