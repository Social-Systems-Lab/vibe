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

    const [hasError, setHasError] = useState(false);

    useEffect(() => {
        setHasError(false);
    }, [src]);

    if (hasError || !isRenderableImage || !objectUrl) {
        return (
            <div className="w-full h-full flex items-center justify-center bg-muted text-muted-foreground">
                <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="24"
                    height="24"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="size-1/2 max-w-8 max-h-8"
                >
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                    <polyline points="17 8 12 3 7 8" />
                    <line x1="12" x2="12" y1="3" y2="15" />
                </svg>
            </div>
        );
    }

    return <img src={objectUrl} alt={alt} {...rest} onError={() => setHasError(true)} />;
}

export default VibeImage;
