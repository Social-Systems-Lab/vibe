import type { SiteProcessor } from "./SiteProcessor";

export class GenericProcessor implements SiteProcessor {
    public isCurrentSite(): boolean {
        // This processor is a fallback, so it doesn't specifically match any site.
        // The logic in content.ts will use this if no other processor matches.
        return true; // Or false, depending on how it's used. Let's assume true for now if it's a default.
    }

    public scanForHandles(): void {
        // console.log("Vibe: GenericProcessor scanning for handles (no-op).");
        // Generic processor might have some very basic, non-site-specific scanning
        // or simply do nothing. For this mock, it's a no-op.
        // TODO: Implement generic scanning logic if desired in the future.
    }

    public injectIcon(element: HTMLElement, username: string): void {
        // console.log(`Vibe: GenericProcessor injectIcon called for ${username} (no-op).`);
        // Generic processor might not inject icons, or have a very different way.
        // For this mock, it's a no-op.
    }
}
