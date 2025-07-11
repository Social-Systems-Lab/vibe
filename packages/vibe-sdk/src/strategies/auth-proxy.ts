import { StandaloneStrategy } from "./standalone";

export class AuthProxy {
    private standalone: StandaloneStrategy;

    constructor(config: { clientId: string; redirectUri: string; apiUrl: string }) {
        this.standalone = new StandaloneStrategy(config);
    }

    async login() {
        return this.standalone.login();
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
