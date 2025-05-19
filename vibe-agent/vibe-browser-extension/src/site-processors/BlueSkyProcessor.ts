import type { SiteProcessor } from "./SiteProcessor";

export class BlueSkyProcessor implements SiteProcessor {
    public isCurrentSite(): boolean {
        return window.location.hostname.includes("bsky.app");
    }

    public scanForHandles(): void {
        if (!this.isCurrentSite()) {
            return;
        }
        console.log("Vibe: BlueSkyProcessor scanning for handles...");

        // TODO: This is a very basic selector for mocking.
        // Real implementation needs to be more robust and handle dynamic content.
        // The provided HTML has a container div with class "css-g5y9jx"
        // and anchor tags with href starting with "/profile/"
        // For this mock, let's target the anchor tags that contain the handle.
        const handleElements = document.querySelectorAll('a[href^="/profile/"]');
        console.log(`Vibe: BlueSkyProcessor found ${handleElements.length} potential handle elements with selector 'a[href^="/profile/"]'.`);

        handleElements.forEach((el, index) => {
            const anchorElement = el as HTMLAnchorElement;
            const href = anchorElement.getAttribute("href");
            const textContent = anchorElement.textContent || "";
            // console.log(`Vibe: BlueSkyProcessor checking element ${index + 1}: href="${href}", textContent="${textContent}"`);

            if (!href) {
                // console.log(`Vibe: BlueSkyProcessor skipping element ${index + 1} (no href).`);
                return;
            }
            if (!textContent.includes("@")) {
                // console.log(`Vibe: BlueSkyProcessor skipping element ${index + 1} (textContent does not include '@'). Text: "${textContent}"`);
                return;
            }

            const usernameMatch = textContent.match(/@([\w.-]+)/);
            if (usernameMatch && usernameMatch[1]) {
                const username = usernameMatch[1];
                // console.log(`Vibe: BlueSkyProcessor extracted username "${username}" from element ${index + 1}.`);
                // Check if an icon is already injected to prevent duplicates
                const parentElement = anchorElement.parentElement;
                if (parentElement && parentElement.querySelector(`.vibe-icon-injected[data-vibe-username="${username}"]`)) {
                    // console.log(`Vibe: BlueSkyProcessor icon already injected for "${username}" near element ${index + 1}. Skipping.`);
                    return;
                }
                this.injectIcon(anchorElement, username);
            } else {
                // console.log(`Vibe: BlueSkyProcessor could not extract username from textContent "${textContent}" for element ${index + 1}.`);
            }
        });
        // TODO: Implement MutationObserver to handle dynamically loaded content.
    }

    public injectIcon(element: HTMLElement, username: string): void {
        console.log(`Vibe: Injecting icon for BlueSky user: ${username} next to element:`, element);
        const icon = document.createElement("img");
        icon.src = chrome.runtime.getURL("icon-dev.png"); // Make sure icon-dev.png is in web_accessible_resources
        icon.alt = "Vibe Profile";
        icon.style.width = "16px";
        icon.style.height = "16px";
        icon.style.marginLeft = "4px";
        icon.style.cursor = "pointer";
        icon.style.verticalAlign = "middle"; // Align icon nicely with text
        icon.classList.add("vibe-icon-injected"); // Add a class for identification
        icon.setAttribute("data-vibe-username", username); // Store username for potential re-checks

        icon.onclick = (e) => {
            e.preventDefault();
            e.stopPropagation(); // Prevent navigation if the icon is inside an anchor
            console.log(`Vibe icon clicked for user: ${username}`);
            chrome.runtime.sendMessage({
                type: "SHOW_VIBE_PROFILE",
                payload: {
                    site: "bluesky",
                    username: username, // Use the extracted username
                    // TODO: In a real scenario, query Vibe backend here or pass more details
                },
            });
        };

        // Insert the icon after the element, or inside its parent if it's an inline element
        // For an anchor tag, it's better to insert it next to it in its parent.
        element.parentElement?.insertBefore(icon, element.nextSibling);
        // TODO: Add placeholder logic for "page content scanned here", "usernames extracted"
    }
}
