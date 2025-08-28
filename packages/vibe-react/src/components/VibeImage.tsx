"use client";

import React from "react";
import { useVibe } from "./VibeProvider";
import { getStreamUrl, UrlStrategy } from "../lib/storage";

export type VibeImageProps = Omit<React.ImgHTMLAttributes<HTMLImageElement>, "src"> & {
  storageKey?: string | null;
  src?: string; // optional fallback src when no storageKey is provided
  strategy?: UrlStrategy; // default "stream"/"auto" for first-party
};

/**
 * VibeImage renders an <img> for a storage object.
 * - For first-party UI: pass storageKey; it will build a /storage/stream URL.
 * - For third-party/cross-origin cases: use strategy="presigned" (to be wired via SDK as needed).
 * - If storageKey is not provided, falls back to "src" prop.
 */
export function VibeImage({ storageKey, src, strategy = "auto", alt = "", ...rest }: VibeImageProps) {
  const { apiBase } = useVibe();

  const resolved =
    storageKey ? getStreamUrl(apiBase, storageKey) : src;

  if (!resolved) {
    // Render nothing if we have neither storageKey nor src
    return null;
  }

  // Note: For future presigned support, a hook can resolve and refresh URLs here.
  return <img src={resolved} alt={alt} {...rest} />;
}

export default VibeImage;
