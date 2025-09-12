// This file defines the manifest for the Vibe Cloud UI itself,
// including the default content renderers that should be installed for every user.

import { VibeManifest } from "vibe-core";

export const vibeCloudUiManifest: VibeManifest = {
    appName: "Vibe Cloud Console",
    appTagline: "Your everything.",
    appDescription: "Your profile, content and connections, under your control—portable across apps.",

    clientId: process.env.VIBE_CLOUD_UI_URL || "http://localhost:4000",
    apiUrl: process.env.VIBE_CLOUD_API_URL || "http://localhost:4000",
    redirectUri: (process.env.VIBE_CLOUD_UI_URL || "http://localhost:4000") + "/auth/callback",
    appLogoUrl: (process.env.VIBE_CLOUD_UI_URL || "http://localhost:4000") + "/images/logo.png",
    appShowcaseUrl: (process.env.VIBE_CLOUD_UI_URL || "http://localhost:4000") + "/images/showcase.png",
    appLogotypeUrl: (process.env.VIBE_CLOUD_UI_URL || "http://localhost:4000") + "/images/logotype.png",

    contentManagers: [
        {
            id: "profile",
            label: "Profile",
            rules: {
                all: [{ eq: ["type", "profile"] }],
            },
            display: {
                sortField: "name",
                icon: "User",
            },
            managerPaths: {
                create: "/manage/profile/create",
                edit: "/manage/profile/edit/{docId}",
                view: {
                    preview: "/render/profile/preview",
                    full: "/render/profile/full",
                },
            },
        },
        {
            id: "post",
            label: "Post",
            rules: {
                all: [{ eq: ["type", "post"] }, { exists: "content" }],
            },
            display: {
                sortField: "createdAt",
                icon: "MessageSquare",
            },
            managerPaths: {
                create: "/manage/post/create",
                edit: "/manage/post/edit/{docId}",
                view: {
                    preview: "/render/post/preview",
                    full: "/render/post/full",
                },
            },
        },
    ],
};
