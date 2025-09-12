import { VibeSDK } from "vibe-sdk";
import { Document } from "vibe-core";

export interface Manager extends Document {
    managerId: string;
    label: string;
    display: {
        icon?: string;
    };
    managerPaths: {
        create: string;
    };
}

export class ContentService {
    private sdk: VibeSDK;

    constructor(sdk: VibeSDK) {
        this.sdk = sdk;
    }

    async getManagers(): Promise<Manager[]> {
        const result = await this.sdk.readOnce("manager");
        return (result.docs as Manager[]) || [];
    }
}
