// tests/data.test.ts
import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { createTestCtx, type TestCtx } from "./test-context";
import { dataService } from "../src/index"; // Removed permissionService
import { logger, disableLogging, enableLogging } from "../src/utils/logger";
import type { ReadResult } from "../src/services/data.service";
import { getUserDbName } from "../src/utils/identity.utils";
import type { AppManifest, PermissionSetting } from "../src/models/models"; // Import needed types

describe("Data API Endpoints (/api/v1/data)", () => {
    let testCtx: TestCtx;
    let cleanup: () => Promise<void>;
    let testCollection: string;
    let userDbName: string;

    // Create one user context for all data tests
    beforeAll(async () => {
        const { ctx, cleanup: contextCleanup } = await createTestCtx();
        testCtx = ctx;
        cleanup = contextCleanup;
        // Collection name specific to this test run, granted in test-context
        testCollection = `test_items_${testCtx.ts}`;
        userDbName = getUserDbName(testCtx.userDid);
        logger.debug(`Permissions for app '${testCtx.appId}' and collection '${testCollection}' assumed set by createTestCtx.`);
    });

    afterAll(async () => {
        if (cleanup) {
            await cleanup();
        }
    });

    // Helper to create headers for authenticated requests from the test app
    const getHeaders = () => {
        if (!testCtx || !testCtx.token || !testCtx.appId) {
            throw new Error("Test context not properly initialized.");
        }
        return {
            Authorization: `Bearer ${testCtx.token}`,
            "X-Vibe-App-ID": testCtx.appId,
        };
    };

    // Helper function to upsert grants for the test app
    const upsertTestAppGrants = async (grants: Record<string, PermissionSetting>, permissions: string[]) => {
        const manifest: AppManifest = {
            appId: testCtx.appId,
            name: `Test App ${testCtx.ts}`,
            permissions: permissions,
        };
        const response = await testCtx.api.api.v1.apps.upsert.post({ ...manifest, grants }, { headers: getHeaders() });
        if (response.status !== 200 && response.status !== 201) {
            const errorData = response.data as { error?: string };
            throw new Error(`Failed to upsert grants: ${errorData?.error || `Status ${response.status}`}`);
        }
        return response.data; // Return success data { ok, id, rev }
    };

    // --- Unauthorized/Invalid Access Tests ---

    it("POST /read: should return 401 without token", async () => {
        const { status, error } = await testCtx.api.api.v1.data.read.post({ collection: testCollection }, { headers: { "X-Vibe-App-ID": testCtx.appId } });
        expect(status).toBe(401);
        expect(error?.value as any).toEqual({ error: "Unauthorized: Invalid or missing user token." });
    });

    it("POST /write: should return 401 without token", async () => {
        const { status, error } = await testCtx.api.api.v1.data.write.post(
            { collection: testCollection, data: { name: "test" } },
            // Send only App ID header
            { headers: { "X-Vibe-App-ID": testCtx.appId } }
        );
        expect(status).toBe(401);
        expect(error?.value as any).toEqual({ error: "Unauthorized: Invalid or missing user token." });
    });

    it("POST /read: should return 400 without X-Vibe-App-ID header", async () => {
        const { status, error } = await testCtx.api.api.v1.data.read.post(
            { collection: testCollection },
            { headers: { Authorization: `Bearer ${testCtx.token}` } } // Send only Auth header
        );
        expect(status).toBe(400);
        expect(error?.value as any).toEqual({ error: "Bad Request: Missing X-Vibe-App-ID header." });
    });

    it("POST /write: should return 400 without X-Vibe-App-ID header", async () => {
        const { status, error } = await testCtx.api.api.v1.data.write.post(
            { collection: testCollection, data: { name: "test" } },
            { headers: { Authorization: `Bearer ${testCtx.token}` } } // Send only Auth header
        );
        expect(status).toBe(400);
        expect(error?.value as any).toEqual({ error: "Bad Request: Missing X-Vibe-App-ID header." });
    });

    // --- Permission Tests ---

    it("POST /write: should return 403 Forbidden when app lacks write permission", async () => {
        const readPerm = `read:${testCollection}`;
        const writePerm = `write:${testCollection}`;
        // Initial state set by createTestCtx (both read and write are 'always')
        const initialGrants: Record<string, PermissionSetting> = { [readPerm]: "always", [writePerm]: "always" };
        const initialPermissions = [readPerm, writePerm];

        try {
            // 1. Revoke write permission specifically via /upsert, keeping read
            logger.debug(`Revoking write permission '${writePerm}' via /upsert, keeping '${readPerm}'`);
            const grantsWithoutWrite: Record<string, PermissionSetting> = { [readPerm]: "always" }; // Only specify read grant
            const permissionsWithoutWrite = [readPerm]; // Only specify read permission in manifest
            await upsertTestAppGrants(grantsWithoutWrite, permissionsWithoutWrite);
            logger.debug(`Write permission revoked via /upsert`);

            // Verify only read remains using /status
            const statusAfterRevoke = await testCtx.api.api.v1.user.apps({ appId: testCtx.appId }).status.get({ headers: getHeaders() });

            logger.log("***** Status after revoking write permission:", JSON.stringify(statusAfterRevoke));

            expect(statusAfterRevoke.data?.grants?.[readPerm]).toBe("always");
            expect(statusAfterRevoke.data?.grants?.[writePerm]).toBeUndefined();

            // 2. Attempt write operation
            disableLogging();
            const { status, error } = await testCtx.api.api.v1.data.write.post(
                { collection: testCollection, data: { name: "forbidden write" } },
                { headers: getHeaders() } // Includes correct token and appId
            );
            enableLogging();

            // 3. Assert Forbidden
            expect(status).toBe(403);
            expect(error?.value as any).toEqual({ error: `Forbidden: Application does not have permission '${writePerm}' for this user.` });
        } finally {
            // 4. Restore initial permissions by sending the complete initial state
            logger.debug(`Restoring initial permissions via /upsert`);
            await upsertTestAppGrants(initialGrants, initialPermissions); // Send the full initial state
            logger.debug(`Initial permissions restored`);
        }
    });

    it("POST /read: should return 403 Forbidden when app lacks read permission", async () => {
        const readPerm = `read:${testCollection}`;
        const writePerm = `write:${testCollection}`;
        // Initial state set by createTestCtx (both read and write are 'always')
        const initialGrants: Record<string, PermissionSetting> = { [readPerm]: "always", [writePerm]: "always" };
        const initialPermissions = [readPerm, writePerm];

        try {
            // 1. Revoke read permission specifically via /upsert, keeping write
            logger.debug(`Revoking read permission '${readPerm}' via /upsert, keeping '${writePerm}'`);
            const grantsWithoutRead: Record<string, PermissionSetting> = { [writePerm]: "always" }; // Keep write as 'always'
            const permissionsWithoutRead = [writePerm]; // Only specify write permission in manifest
            await upsertTestAppGrants(grantsWithoutRead, permissionsWithoutRead);
            logger.debug(`Read permission revoked via /upsert`);

            // Verify only write remains using /status
            const statusAfterRevoke = await testCtx.api.api.v1.user.apps({ appId: testCtx.appId }).status.get({ headers: getHeaders() });
            expect(statusAfterRevoke.data?.grants?.[readPerm]).toBeUndefined();
            expect(statusAfterRevoke.data?.grants?.[writePerm]).toBe("always"); // Should still be 'always'

            // 2. Attempt read operation
            disableLogging();
            const { status, error } = await testCtx.api.api.v1.data.read.post({ collection: testCollection, filter: {} }, { headers: getHeaders() });
            enableLogging();

            // 3. Assert Forbidden
            expect(status).toBe(403);
            expect(error?.value as any).toEqual({ error: `Forbidden: Application does not have permission '${readPerm}' for this user.` });
        } finally {
            // 4. Restore initial permissions by sending the complete initial state
            logger.debug(`Restoring initial permissions via /upsert`);
            await upsertTestAppGrants(initialGrants, initialPermissions); // Send the full initial state
            logger.debug(`Initial permissions restored`);
        }
    });

    it("POST /write: should return 403 Forbidden when accessing collection not granted to app", async () => {
        const forbiddenCollection = `forbidden_collection_${testCtx.ts}`;
        const requiredPermission = `write:${forbiddenCollection}`;

        disableLogging();
        const { status, error } = await testCtx.api.api.v1.data.write.post(
            { collection: forbiddenCollection, data: { name: "forbidden write" } },
            { headers: getHeaders() } // Correct token/appId, but app lacks permission for this collection
        );
        enableLogging();

        expect(status).toBe(403);
        expect(error?.value as any).toEqual({ error: `Forbidden: Application does not have permission '${requiredPermission}' for this user.` });
    });

    // --- Successful Read/Write Tests (App has permissions granted in test-context) ---

    it("POST /write: should create a single document", async () => {
        // Add status check before write
        logger.debug("Checking status before write operation...");
        const statusCheck = await testCtx.api.api.v1.user.apps({ appId: testCtx.appId }).status.get({ headers: getHeaders() });
        logger.debug("Status check response:", statusCheck.data);
        // Verify the specific write grant needed for this test
        expect(statusCheck.data?.grants?.[`write:${testCollection}`]).toBe("always");

        const docData = { name: "Single Write Test", value: 123, ts: Date.now() };
        const { data, error, status } = await testCtx.api.api.v1.data.write.post({ collection: testCollection, data: docData }, { headers: getHeaders() });

        expect(status).toBe(200);
        expect(error).toBeNull();
        expect(data).toBeDefined();
        expect((data as any)?.ok).toBe(true);
        const docId = (data as any)?.id;
        expect(docId).toBeTypeOf("string");
        expect((data as any)?.rev).toBeTypeOf("string");

        // Verify directly in DB using imported dataService
        const createdDoc = await dataService.getDocument(userDbName, docId);

        expect(createdDoc).toBeDefined();
        expect((createdDoc as any)?.collection).toBe(testCollection);
        expect((createdDoc as any)?.name).toBe(docData.name);
    });

    it("POST /write: should create multiple documents (bulk)", async () => {
        const docsData = [
            { name: "Bulk Write 1", value: 1, ts: Date.now() },
            { name: "Bulk Write 2", value: 2, ts: Date.now() + 1 },
        ];
        const { data, error, status } = await testCtx.api.api.v1.data.write.post({ collection: testCollection, data: docsData }, { headers: getHeaders() });

        expect(status).toBe(200); // bulk write returns 200 if all OK
        expect(error).toBeNull();
        expect(data).toBeArray();
        expect(data).toHaveLength(docsData.length);

        const bulkResponse = data as any[];
        let createdIds: string[] = [];
        for (const item of bulkResponse) {
            expect(item.ok).toBe(true);
            expect(item.id).toBeTypeOf("string");
            expect(item.rev).toBeTypeOf("string");
            expect(item.error).toBeUndefined();
            createdIds.push(item.id);
        }

        // Verify one doc directly
        const createdDoc = await dataService.getDocument(userDbName, createdIds[0]);
        expect(createdDoc).toBeDefined();
        expect((createdDoc as any)?.collection).toBe(testCollection);
        expect((createdDoc as any)?.name).toBe(docsData[0].name);
    });

    it("POST /write: should update an existing document", async () => {
        // 1. Create initial doc
        const initialData = { name: "Doc to Update", value: 1 };
        const createRes = await testCtx.api.api.v1.data.write.post({ collection: testCollection, data: initialData }, { headers: getHeaders() });
        expect(createRes.status).toBe(200);
        const docId = (createRes.data as any).id;
        const docRev = (createRes.data as any).rev;

        // 2. Update the doc (include _id and _rev in the data payload)
        const updateData = { _id: docId, _rev: docRev, name: "Doc Was Updated", value: 2 };
        const { data, error, status } = await testCtx.api.api.v1.data.write.post(
            { collection: testCollection, data: updateData }, // Send the update payload as data
            { headers: getHeaders() }
        );

        expect(status).toBe(200);
        expect(error).toBeNull();
        expect((data as any)?.ok).toBe(true);
        expect((data as any)?.id).toBe(docId);
        expect((data as any)?.rev).not.toBe(docRev); // Revision should change

        // 3. Verify update in DB
        const updatedDoc = await dataService.getDocument(userDbName, docId);
        expect((updatedDoc as any)?.name).toBe(updateData.name);
        expect((updatedDoc as any)?.value).toBe(updateData.value);
        expect((updatedDoc as any)?._rev).toBe((data as any).rev);
    });

    it("POST /read: should read documents matching a filter", async () => {
        // 1. Ensure some data exists
        const writeData = [
            { name: "Read Filter Test", type: "A", value: 10, ts: Date.now() },
            { name: "Read Filter Test", type: "B", value: 20, ts: Date.now() + 1 },
            { name: "Read Filter Test", type: "A", value: 30, ts: Date.now() + 2 },
        ];
        await testCtx.api.api.v1.data.write.post({ collection: testCollection, data: writeData }, { headers: getHeaders() });

        // 2. Read with filter
        const filter = { type: "A" };
        const { data, error, status } = await testCtx.api.api.v1.data.read.post({ collection: testCollection, filter: filter }, { headers: getHeaders() });

        expect(status).toBe(200);
        expect(error).toBeNull();
        expect(data).toBeDefined();

        const readResult = data as ReadResult;
        expect(readResult.docs).toBeArray();
        expect(readResult.docs.length).toBeGreaterThanOrEqual(2); // Allow for other test runs
        // Verify all returned docs match the filter
        for (const doc of readResult.docs) {
            expect(doc.collection).toBe(testCollection);
            expect(doc.type).toBe("A");
        }
        expect(readResult.doc).toEqual(readResult.docs[0]); // doc should be the first doc
    });

    it("POST /read: should return empty array when no documents match filter", async () => {
        const filter = { type: `NonExistentType_${testCtx.ts}` }; // Make filter unique
        const { data, error, status } = await testCtx.api.api.v1.data.read.post({ collection: testCollection, filter: filter }, { headers: getHeaders() });

        expect(status).toBe(200);
        expect(error).toBeNull();
        expect(data).toEqual({ docs: [], doc: undefined }); // Expect empty result structure
    });

    // --- Validation Tests ---
    it("POST /read: should return 400 if collection is missing", async () => {
        disableLogging();
        const { status, error } = await (testCtx.api.api.v1.data.read.post as any)(
            { filter: {} }, // Missing collection
            { headers: getHeaders() }
        );
        enableLogging();
        expect(status).toBe(400);
        expect(error?.value?.error).toBe("Validation failed");
        expect(error?.value?.details).toContain("Collection name is required");
    });

    it("POST /write: should return 400 if collection is missing", async () => {
        disableLogging();
        const { status, error } = await (testCtx.api.api.v1.data.write.post as any)(
            { data: { name: "test" } }, // Missing collection
            { headers: getHeaders() }
        );
        enableLogging();
        expect(status).toBe(400);
        expect(error?.value?.error).toBe("Validation failed");
        expect(error?.value?.details).toContain("Collection name is required");
    });

    it("POST /write: should return 400 if data is missing or invalid type", async () => {
        disableLogging();
        // Missing data
        let { status, error } = await (testCtx.api.api.v1.data.write.post as any)(
            { collection: testCollection }, // Missing data
            { headers: getHeaders() }
        );
        expect(status).toBe(400);
        expect(error?.value?.error).toBe("Validation failed");
        expect(error?.value?.details).toContain("Data must be a single object or an array of objects");

        // Invalid data type
        ({ status, error } = await (testCtx.api.api.v1.data.write.post as any)(
            { collection: testCollection, data: "not an object" }, // Invalid data
            { headers: getHeaders() }
        ));
        enableLogging();
        expect(status).toBe(400);
        expect(error?.value?.error).toBe("Validation failed");
        expect(error?.value?.details).toContain("Data must be a single object or an array of objects");
    });

    // Test for write conflict (requires creating, then trying to update with old rev)
    it("POST /write: should return 409 conflict when updating with wrong revision", async () => {
        // 1. Create item
        const initialData = { name: "Conflict Write Test", value: 1 };
        const createRes = await testCtx.api.api.v1.data.write.post({ collection: testCollection, data: initialData }, { headers: getHeaders() });
        expect(createRes.status).toBe(200);
        const docId = (createRes.data as any).id;
        const correctRev = (createRes.data as any).rev;

        // 2. Attempt update with wrong revision
        const updatePayload = { _id: docId, _rev: "1-wrongrevision", name: "Conflict Update", value: 2 };
        disableLogging();
        const { data, error, status } = await testCtx.api.api.v1.data.write.post(
            { collection: testCollection, data: updatePayload },
            { headers: getHeaders() }
        );
        enableLogging();

        expect(status).toBe(409); // Expect conflict from the underlying data service
        expect(error).not.toBeNull();
        expect((error?.value as any)?.error).toContain("Revision conflict");

        // Optional: Cleanup the doc created in step 1 using the correct revision
        await dataService.deleteDocument(userDbName, docId, correctRev);
    });
});
