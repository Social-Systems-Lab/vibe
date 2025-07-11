import { StandaloneStrategy } from "./standalone";

export class AuthProxy {
    private standalone: StandaloneStrategy;

    constructor(config: { clientId: string; redirectUri: string; apiUrl: string }) {
        this.standalone = new StandaloneStrategy(config);
    }

    async login() {
        await this.standalone.login();
        const user = await this.standalone.getUser();
        // This is a bit of a hack, but it allows us to notify the HubStrategy
        // without a direct dependency.
        if ((this.standalone as any).notifyStateChange) {
            (this.standalone as any).notifyStateChange(!!user, user);
        }
    }

    async logout() {
        return this.standalone.logout();
    }

    async signup() {
        return this.standalone.signup();
    }

    async getUser() {
        return this.standalone.getUser();
    }
}
