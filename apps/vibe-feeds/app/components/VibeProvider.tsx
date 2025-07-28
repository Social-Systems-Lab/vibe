"use client";

import { VibeProvider as VibeProviderReact } from "vibe-react";
import type { ReactNode } from "react";

import { sdkConfig } from "../lib/sdkConfig";

export function VibeProvider({ children }: { children: ReactNode }) {
    return <VibeProviderReact config={sdkConfig}>{children}</VibeProviderReact>;
}
