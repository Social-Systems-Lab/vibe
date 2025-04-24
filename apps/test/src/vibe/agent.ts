// apps/test/src/vibe/agent.ts

import type { ReadResult, Unsubscribe, WriteResult } from "./types";

/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unused-vars */

// Interface defining the expected methods of a Vibe Agent
export interface VibeAgent {
    init(userDid: string): Promise<void>;
    readOnce(collection: string, filter?: any): Promise<ReadResult>;
    read(collection: string, filter?: any, callback?: (result: ReadResult) => void): Promise<Unsubscribe>;
    write(collection: string, data: any | any[]): Promise<WriteResult>;
}

// Mock implementation of the Vibe Agent for testing within the app
export class MockVibeAgent implements VibeAgent {
    private userDid: string | null = null;
    private mockData: Record<string, any[]> = {
        notes: [
            { _id: "note_1", text: "Mock Note 1", createdAt: new Date().toISOString() },
            { _id: "note_2", text: "Mock Note 2", createdAt: new Date().toISOString() },
        ],
        tasks: [
            { _id: "task_1", title: "Implement Mock Agent", completed: true },
            { _id: "task_2", title: "Implement Mock SDK", completed: false },
        ],
    };

    async init(userDid: string): Promise<void> {
        console.log(`[MockVibeAgent] Initializing with userDid: ${userDid}`);
        this.userDid = userDid;
        // In a real agent, this might involve authentication, key loading, etc.
        return Promise.resolve();
    }

    async readOnce(collection: string, filter?: any): Promise<ReadResult> {
        console.log(`[MockVibeAgent] readOnce called for collection: ${collection}`, { filter });
        if (!this.userDid) {
            throw new Error("Agent not initialized.");
        }

        // Simulate filtering (very basic)
        const data = this.mockData[collection] || [];
        // In a real scenario, filtering would be more complex
        const results = { docs: data };
        console.log(`[MockVibeAgent] Returning mock data for ${collection}:`, results);
        return Promise.resolve(results);
    }

    async read(collection: string, filter?: any, callback?: (result: ReadResult) => void): Promise<Unsubscribe> {
        console.log(`[MockVibeAgent] read (subscription) called for collection: ${collection}`, { filter });
        if (!this.userDid) {
            throw new Error("Agent not initialized.");
        }

        // Simulate initial data fetch and send via callback
        const initialData = this.mockData[collection] || [];
        const initialResult = { docs: initialData };

        if (callback) {
            // Simulate async fetch before calling back
            setTimeout(() => {
                console.log(`[MockVibeAgent] Sending initial subscription data for ${collection}:`, initialResult);
                callback(initialResult);
            }, 50); // Small delay
        }

        // Return a mock unsubscribe function
        const unsubscribe = () => {
            console.log(`[MockVibeAgent] Unsubscribe called for collection: ${collection}`);
            // In a real agent, this would stop listening for changes
        };
        return Promise.resolve(unsubscribe);
    }

    async write(collection: string, data: any | any[]): Promise<WriteResult> {
        console.log(`[MockVibeAgent] write called for collection: ${collection}`, { data });
        if (!this.userDid) {
            throw new Error("Agent not initialized.");
        }

        // Simulate writing data (just log it for now)
        const isArray = Array.isArray(data);
        const docsToWrite = isArray ? data : [data];
        const newIds: string[] = [];

        console.log(`[MockVibeAgent] Simulating write of ${docsToWrite.length} documents to ${collection}`);
        docsToWrite.forEach((doc, index) => {
            const newId = `${collection}_mock_${Date.now()}_${index}`;
            console.log(` - Doc ${index}:`, { ...doc, _id: newId });
            newIds.push(newId);
            // In a real agent, this would interact with storage (e.g., Vibe Cloud)
        });

        const result: WriteResult = { ok: true, ids: newIds };
        return Promise.resolve(result);
    }
}

/* eslint-enable @typescript-eslint/no-explicit-any */
/* eslint-enable @typescript-eslint/no-unused-vars */
