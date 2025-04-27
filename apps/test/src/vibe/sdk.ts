// apps/test/src/vibe/sdk.ts

// apps/test/src/vibe/sdk.ts
// Defines the interface for the `window.vibe` object provided by the agent.

// Import necessary types
import type {
    Account, // Keep type imports needed for the interface
    AppManifest,
    PermissionSetting,
    ReadParams,
    ReadResult,
    Unsubscribe,
    VibeAgent,
    VibeState,
    WriteResult,
    Identity, // Added
    ActionRequest, // Added (Potentially needed if SDK orchestrates prompts)
    // ActionRequest, // No longer needed here
    // ActionResponse, // No longer needed here
} from "./types";

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

// No longer exporting a singleton instance or the agent instance from here.
// The AgentProvider in agent.tsx is now responsible for creating the agent
// and defining the `window.vibe` object based on the IVibeSDK interface.

/* eslint-enable @typescript-eslint/no-explicit-any */
