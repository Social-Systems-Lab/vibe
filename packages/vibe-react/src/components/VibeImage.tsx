"use client";

import React, { useEffect, useState } from "react";
import { useVibe } from "./VibeProvider";
import { getStreamUrl, UrlStrategy } from "../lib/storage";
import { FileDoc } from "vibe-sdk";

export type VibeImageProps = Omit<React.ImgHTMLAttributes<HTMLImageElement>, "src"> & {
    src?: FileDoc | string | null;
    strategy?: UrlStrategy;
};

/**
 * VibeImage renders an <img> for a storage object.
 * - It automatically uses the session token from VibeProvider for authenticated requests.
 * - It will only attempt to render files with an "image/*" mime type.
 */
export function VibeImage({ src, strategy = "auto", alt = "", ...rest }: VibeImageProps) {
    const { apiBase, getToken } = useVibe();
    const [objectUrl, setObjectUrl] = useState<string | undefined>(undefined);

    const fileDoc = typeof src === "object" && src !== null ? src : null;
    const isRenderableImage = fileDoc ? fileDoc.mimeType?.startsWith("image/") : typeof src === "string";

    useEffect(() => {
        if (!isRenderableImage) {
            setObjectUrl(undefined);
            return;
        }

        let isMounted = true;
        let currentObjectUrl: string | null = null;

        const fetchAndSetImage = async () => {
            const storageKey = fileDoc?.storageKey;
            const token = getToken();

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
    }, [src, getToken, apiBase, isRenderableImage, fileDoc]);

    if (!isRenderableImage || !objectUrl) {
        return null;
    }

    return <img src={objectUrl} alt={alt} {...rest} />;
}

export default VibeImage;
