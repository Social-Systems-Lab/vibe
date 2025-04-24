// tests/test-context.ts
import { treaty } from "@elysiajs/eden";
import { app, authService, permissionService, dataService, blobService, realtimeService } from "../src/index";
import { logger } from "../src/utils/logger";
import type { App } from "../src/index"; // Import App type for treaty
import { randomUUIDv7 } from "bun";
import { getUserDbName } from "../src/utils/did.utils";

// Define a mock App ID for testing purposes
export const TEST_APP_ID = `https://test-app-${randomUUIDv7()}.dev`; // Make App ID unique per run

export interface TestCtx {
    api: ReturnType<typeof treaty<App>>; // Use App type
    userDid: string;
    token: string; // User JWT
    appId: string; // The mock App ID
    permsRev: string | null; // Revision of the user's permission doc
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
    let initialPermsRev: string | null = null; // Rev after user creation/direct perms
    let finalPermsRev: string | null = null; // Rev after granting app perms

    try {
        // 1. Create Test User and get Token using AuthService helper
        // Grant basic blob permissions directly to the user for testing blob endpoints later
        const directPermissions = [`read:blobs`, `write:blobs`];
        logger.debug(`Creating test user ${testUserDid} with direct permissions [${directPermissions.join(", ")}]...`);
        const userCreationResult = await authService.createTestUserAndToken(
            testUserDid,
            directPermissions,
            false, // Not an admin
            "5m" // Short-lived token for tests
        );
        userDid = userCreationResult.userDid;
        token = userCreationResult.token;

        initialPermsRev = userCreationResult.permsRev; // This is the rev *after* setting direct permissions
        logger.debug(`Test user ${userDid} created, token obtained, initial perms rev: ${initialPermsRev}`);

        // 2. Grant Permissions to the Test App for this User
        const appPermissionsToGrant = [`read:test_items_${ts}`, `write:test_items_${ts}`];
        logger.debug(`Granting app permissions [${appPermissionsToGrant.join(", ")}] to app '${testAppId}' for user '${userDid}'...`);
        const permRes = await permissionService.grantAppPermission(userDid, testAppId, appPermissionsToGrant);
        finalPermsRev = permRes.rev;
        logger.debug(`App permissions granted, final perms rev: ${finalPermsRev}`);
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
        permsRev: finalPermsRev, // Store the latest rev after app grant
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

export { authService, dataService, permissionService, blobService, realtimeService };
