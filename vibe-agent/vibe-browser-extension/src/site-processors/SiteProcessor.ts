// Defines the interface for site-specific content processing.
export interface SiteProcessor {
    /**
     * Scans the current page for elements that represent user handles or profiles.
     * This method should identify relevant DOM elements.
     */
    scanForHandles(): void;

    /**
     * Injects a Vibe-specific UI element (e.g., an icon) next to a given DOM element.
     * @param element The DOM element next to which the icon should be injected.
     * @param username The username or identifier associated with the element.
     */
    injectIcon(element: HTMLElement, username: string): void;

    /**
     * Determines if the current page is the site this processor is designed for.
     * @returns True if the current page matches, false otherwise.
     */
    isCurrentSite(): boolean;
}
