// tests/test-context.ts
import { treaty } from "@elysiajs/eden";
import { app, authService, dataService, blobService, realtimeService } from "../src/index"; // Removed permissionService
import { logger } from "../src/utils/logger";
import type { App } from "../src/index"; // Import App type for treaty
import type { AppManifest, PermissionSetting } from "../src/models/models"; // Import needed types
import { randomUUIDv7 } from "bun";
import { getUserDbName } from "../src/utils/identity.utils";

// Define a mock App ID for testing purposes
export const TEST_APP_ID = `https://test-app-${randomUUIDv7()}.dev`; // Make App ID unique per run

export interface TestCtx {
    api: ReturnType<typeof treaty<App>>; // Use App type
    userDid: string;
    token: string; // User JWT
    appId: string; // The mock App ID
    ts: number;
}

/**
 * Creates a *fresh* user, grants permissions to a test app for that user,
 * and provides a JWT for the user. Designed for use within a single test file.
 */
export async function createTestCtx(): Promise<{
    ctx: TestCtx;
    cleanup: () => Promise<void>;
}> {
    logger.info("Setting up test context...");
    const api = treaty<App>(app);
    const ts = Date.now();
    const testUserDid = `did:vibe:test:${randomUUIDv7()}`; // Generate unique DID for test user
    const testAppId = TEST_APP_ID; // Use the defined constant

    let userDid: string | null = null;
    let token: string | null = null;

    try {
        // 1. Create Test User and get Token using AuthService helper
        // Grant basic blob permissions directly to the user for testing blob endpoints later
        logger.debug(`Creating test user ${testUserDid}...`);
        const userCreationResult = await authService.createTestUserAndToken(
            testUserDid,
            false, // Not an admin
            "5m" // Short-lived token for tests
        );
        userDid = userCreationResult.userDid;
        token = userCreationResult.token;

        logger.debug(`Test user ${userDid} created, token obtained`);

        // 2. Grant Permissions to the Test App for this User via /upsert
        const appPermissionsToGrant = [`read:test_items_${ts}`, `write:test_items_${ts}`];
        // Simulate grants (e.g., 'always' for read, 'ask' for write)
        const grantsToSet: Record<string, PermissionSetting> = {
            [`read:test_items_${ts}`]: "always",
            [`write:test_items_${ts}`]: "ask", // Or 'always' if tests require write without prompt simulation
        };
        // Define a minimal manifest for the upsert payload
        const testAppManifest: AppManifest = {
            appId: testAppId,
            name: `Test App ${ts}`,
            permissions: appPermissionsToGrant,
            // description and pictureUrl are optional
        };
        logger.debug(`Upserting app registration and grants for app '${testAppId}', user '${userDid}'...`);
        const upsertResponse = await api.api.v1.apps.upsert.post(
            {
                ...testAppManifest,
                grants: grantsToSet,
            },
            { headers: { Authorization: `Bearer ${token}` } } // Pass the user's token
        );

        // Check if the response indicates an error (status not 200 or 201)
        if (upsertResponse.status !== 200 && upsertResponse.status !== 201) {
            // Type assertion for the error response data based on ErrorResponseSchema
            const errorData = upsertResponse.data as { error?: string; details?: any };
            logger.error("Failed to upsert app grants during test setup:", errorData);
            throw new Error(`Failed to set initial app grants: ${errorData?.error || `Status ${upsertResponse.status}`}`);
        }
        logger.debug(`App registration/grants upserted successfully`);
    } catch (error) {
        logger.error("Error during test context setup:", error);
        // Attempt cleanup even if setup failed partially
        if (userDid) {
            await authService.deleteUser(userDid).catch((e) => logger.error("Error during setup cleanup:", e));
        }
        throw error; // Rethrow to fail the test setup
    }

    // Ensure critical variables are set
    if (!userDid || !token) {
        throw new Error("Test context setup failed: userDid or token is null after setup steps.");
    }

    const ctx: TestCtx = {
        api,
        userDid: userDid,
        token: token,
        appId: testAppId,
        ts,
    };

    async function cleanup() {
        logger.info(`Cleaning up test context for user ${ctx.userDid}...`);
        // Use IMPORTED authService for cleanup
        await authService.deleteUser(ctx.userDid).catch((e) => logger.error(`Error during cleanup for user ${ctx.userDid}:`, e));
        // Optional: Explicit DB cleanup if needed and not handled by deleteUser fully
        const userDbName = getUserDbName(ctx.userDid);
        try {
            // Use IMPORTED dataService
            await dataService.getConnection().db.destroy(userDbName);
            logger.info(`Cleaned up test database ${userDbName}`);
        } catch (e: any) {
            if (e.statusCode !== 404) {
                logger.error(`Error cleaning up test database ${userDbName}:`, e);
            }
        }
        logger.info(`Test context cleanup complete for user ${ctx.userDid}.`);
    }

    logger.info("Test context setup complete.");
    return { ctx, cleanup };
}

export { authService, dataService, blobService, realtimeService }; // Removed permissionService
