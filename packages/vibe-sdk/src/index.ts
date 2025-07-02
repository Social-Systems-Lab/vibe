export type VibeSDKConfig = {
    apiUrl: string;
};

export class VibeSDK {
    private config: VibeSDKConfig;
    public isAuthenticated = false;
    public user: any = null;

    constructor(config: VibeSDKConfig) {
        this.config = config;
        console.log("Vibe SDK Initialized with API URL:", this.config.apiUrl);
    }

    async init() {
        console.log("Vibe SDK init method called");
    }

    async login() {
        console.log("Login called");
        // In a real scenario, this would involve a popup and communication with the backend
        this.isAuthenticated = true;
        this.user = { name: "Test User" };
    }

    async logout() {
        console.log("Logout called");
        this.isAuthenticated = false;
        this.user = null;
    }

    async signup() {
        console.log("Signup called");
        // In a real scenario, this would involve a popup and communication with the backend
        this.isAuthenticated = true;
        this.user = { name: "New User" };
    }
}

export const createSdk = (config: VibeSDKConfig) => {
    return new VibeSDK(config);
};
