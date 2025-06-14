// packages/vibe-sdk/src/index.ts
// Defines the interface for the `window.vibe` object provided by the agent.

// Import necessary types
export * from "./types";
import type { AppManifest, ReadResult, Unsubscribe, VibeState, WriteResult } from "./types";

/* eslint-disable @typescript-eslint/no-explicit-any */

// Interface defining the `window.vibe` object structure
// This is what the AgentProvider now provides.
export interface IVibeSDK {
    init(manifest: AppManifest, onStateChange: (state: VibeState) => void): Promise<Unsubscribe>;
    readOnce(collection: string, filter?: any): Promise<ReadResult<any>>;
    read(collection: string, filter?: any, callback?: (result: ReadResult<any>) => void): Promise<Unsubscribe>;
    write(collection: string, data: any | any[]): Promise<WriteResult>;
    // No other methods should be exposed directly via the SDK interface.
    // Identity management, etc., happens via the Agent's own UI/context.
}

/* eslint-enable @typescript-eslint/no-explicit-any */
