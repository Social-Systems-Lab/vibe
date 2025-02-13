export interface InstalledApp {
    appId: string;
    name: string;
    description: string;
    iconUrl: string;
    url: string;
    permissions: Record<string, "always" | "ask" | "never">;
    hidden: boolean; // not shown on home screen
    // Possibly layout info for multi-page home screens
    homeScreenPage?: number;
    homeScreenPosition?: number;
}
