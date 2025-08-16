# Vibe Home (Signed-in) — Implementation Overview

This document captures what was delivered in Phase 1 and the planned wiring for Phase 2.

## Phase 1 (Delivered)

-   Header center nav added in `(main)/layout.tsx`:
    -   Home (/), Apps (/app-grid), Developers (/developers)
-   Signed-in Home composed in `(main)/page.tsx` with sections:
    -   `WelcomeHero` — CTA to Explore Apps, Developer Portal, GitHub
    -   `CommunityPulse` — placeholder metrics
    -   `WhatsNewFeed` — placeholder “What’s new” cards
    -   `DiscoverAppsGrid` — placeholder app directory cards
    -   `YourActivityPanel` — placeholder for user activity
    -   `DeveloperPortalPromo` — CTA + quick links
-   Developer Portal scaffolded at `/developers` with links to Quickstart, SDK, Cloud API, Example Apps, Changelog, Structure.

All sections use Tailwind classes via `vibe-react` CSS and align to the `VibeProvider`/`Layout` structure.

## Phase 2 (Planned Wiring)

### API Endpoints (Cloud API)

Add in `apps/vibe-cloud-api` (or gateway) to surface data needed by the Home page:

1. Global “What’s New”

-   REST: `GET /api/feed/global?limit=20`
-   Returns:
    ```json
    {
        "items": [
            {
                "id": "string",
                "kind": "app | update | milestone",
                "title": "string",
                "summary": "string",
                "url": "string | null",
                "timestamp": "ISO-8601 string",
                "ref": { "collection": "string", "id": "string" }
            }
        ]
    }
    ```
-   SSE (optional): `GET /api/feed/global/stream`
    -   Emits `data: {FeedItem}` messages for live updates
    -   Optional query: `?collection=apps|updates|...` to filter streams

2. Community Pulse Metrics

-   REST: `GET /api/metrics/community`
-   Returns:
    ```json
    {
        "newUsers24h": 0,
        "newApps7d": 0,
        "activeDevs7d": 0,
        "updatedAt": "ISO-8601 string"
    }
    ```

3. App Directory (Discover)

-   REST: `GET /api/apps?limit=12`
-   Returns:
    ```json
    {
        "apps": [
            {
                "id": "string",
                "name": "string",
                "description": "string",
                "url": "string",
                "iconUrl": "string | null"
            }
        ]
    }
    ```

4. User Activity

-   REST: `GET /api/activity?limit=10`
-   Requires user session
-   Returns:
    ```json
    {
        "items": [{ "id": "string", "text": "string", "when": "ISO-8601 string", "url": "string | null" }]
    }
    ```

### UI Wiring Tasks

1. `WhatsNewFeed`

-   Option A: Convert to an async server component (default in Next.js app dir) and `fetch` from `${process.env.NEXT_PUBLIC_API_URL}/api/feed/global` with `export const revalidate = 30;` for freshness.
-   Option B: Keep as a client component and use polling or `EventSource` to subscribe to SSE updates; hydrate initial data from server via props.

2. `CommunityPulse`

-   Fetch `${API_URL}/api/metrics/community` and render real numbers.
-   Use small `revalidate` (e.g., 60s) or client-side polling for near-real-time updates.

3. `DiscoverAppsGrid`

-   Fetch `${API_URL}/api/apps?limit=12` and map results into cards.
-   Consider tag filters or categories later.

4. `YourActivityPanel`

-   Fetch `${API_URL}/api/activity?limit=10`. Requires authenticated session.
-   Handle empty state (already present). Add link to notifications or profile when available.

5. `WelcomeHero` Personalization

-   Greet user by name once session is available. Example:
    -   Use a session helper from `vibe-sdk` (or Next.js middleware/cookies) to obtain profile handle/displayName.
    -   Fallback to generic “Welcome to Vibe”.

### Auth & Session Notes

-   Ensure API endpoints that require auth validate the session (cookie or bearer token).
-   Home page should remain accessible only when signed-in per product decision; otherwise redirect to `/auth/wizard`.

### Accessibility & UX

-   Ensure headings are semantic (h1/h2).
-   Add `aria-live="polite"` to any live-updating areas if using SSE.
-   Provide sufficient color contrast for badges and subtle elements.

## File Map (Key)

-   `apps/vibe-cloud-ui/app/(main)/layout.tsx` — header nav injection
-   `apps/vibe-cloud-ui/app/(main)/page.tsx` — page composition
-   `apps/vibe-cloud-ui/app/(main)/components/home/*` — all Home sections
-   `apps/vibe-cloud-ui/app/(main)/developers/page.tsx` — developer portal landing

## Future Enhancements

-   Add “Community” route (events, spotlight creators, announcements).
-   Show avatars/logos in feed/app cards when assets exist.
-   Add follow/subscribe actions where applicable.
-   Animate “pulse” counts on update to convey movement.
