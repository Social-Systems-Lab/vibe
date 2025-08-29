"use client";

export type UrlStrategy = "auto" | "stream" | "presigned";

/**
 * Derive a first-party stream URL for a storage object.
 * This requires the API to expose GET /storage/stream?key=...
 */
export function getStreamUrl(apiBase: string, storageKey: string): string {
    const base = (apiBase || "").replace(/\/+$/, "");
    return `${base}/storage/stream?key=${encodeURIComponent(storageKey)}`;
}

/**
 * Choose a URL for rendering/downloading a storage object.
 * For now, "auto" == "stream" (first-party UI).
 * If you need presigned behavior here, wire it via the SDK and return a short-lived URL.
 */
export function getUrl(opts: {
    apiBase: string;
    storageKey: string;
    strategy?: UrlStrategy;
    // expires?: number; // reserved for future presign usage
}): string {
    const { apiBase, storageKey, strategy = "auto" } = opts;
    switch (strategy) {
        case "stream":
        case "auto":
        default:
            return getStreamUrl(apiBase, storageKey)!;
    }
}
