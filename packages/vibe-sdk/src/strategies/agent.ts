import { VibeTransportStrategy } from "../strategy";

export class AgentStrategy implements VibeTransportStrategy {
    async login(): Promise<void> {
        throw new Error("Agent login not implemented");
    }

    async logout(): Promise<void> {
        throw new Error("Agent logout not implemented");
    }

    async signup(): Promise<void> {
        throw new Error("Agent signup not implemented");
    }

    async getUser(): Promise<any> {
        throw new Error("Agent getUser not implemented");
    }

    async read(collection: string, filter?: any): Promise<any> {
        throw new Error("Agent read not implemented");
    }

    async readOnce(collection: string, filter?: any): Promise<any> {
        throw new Error("Agent readOnce not implemented");
    }

    async write(collection: string, data: any): Promise<any> {
        throw new Error("Agent write not implemented");
    }

    async remove(collection: string, data: any): Promise<any> {
        throw new Error("Agent delete not implemented");
    }
}
