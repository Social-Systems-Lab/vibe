"use client";

import { VibeProvider as VibeProviderReact } from "vibe-react";
import type { ReactNode } from "react";

import { appManifest } from "../lib/manifest";

export function VibeProvider({ children }: { children: ReactNode }) {
    return <VibeProviderReact config={appManifest}>{children}</VibeProviderReact>;
}
