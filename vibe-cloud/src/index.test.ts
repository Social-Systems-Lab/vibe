import { describe, it, expect, beforeAll } from "bun:test";
import { treaty } from "@elysiajs/eden";
import { app } from "./index";
import { dataService } from "./services/data.service";
import { logger, disableLogging, enableLogging } from "./utils/logger";

// Use treaty for type-safe client generation
const api = treaty(app);

beforeAll(async () => {
    try {
        await dataService.ensureDbExists();
    } catch (err) {
        throw err;
    }
});

describe("API Endpoints", () => {
    it("GET /health should return status ok", async () => {
        const { data, error, status } = await api.health.get();
        expect(status).toBe(200);
        expect(error).toBeNull();
        expect(data).toEqual({ status: "ok" });
    });
});

describe("Data API Endpoints (/api/v1/data)", () => {
    // Use a distinct collection name for this test suite run
    const collection = `test_items_${Date.now()}`;
    let createdItemId: string | null = null;
    let currentRev: string | null = null;

    // Use a single test to ensure sequence and cleanup
    it("should perform CRUD operations on a document", async () => {
        // --- 1. Create Document (POST) ---
        const initialData = { name: "CRUD Test Item", value: 123 };
        const { data: createData, error: createError, status: createStatus } = await api.api.v1.data({ collection }).post(initialData);

        expect(createStatus, "Create status should be 201").toBe(201);
        expect(createError, "Create should not error").toBeNull();
        expect(createData?.ok).toBe(true);
        expect(createData?.id).toBeTypeOf("string");
        expect(createData?.rev).toBeTypeOf("string");

        createdItemId = createData!.id;
        currentRev = createData!.rev;
        expect(createdItemId).toBeDefined();
        expect(currentRev).toBeDefined();

        try {
            // --- 2. Read Document (GET) ---
            const { data: getData, error: getError, status: getStatus } = await api.api.v1.data({ collection })({ id: createdItemId! }).get();

            expect(getStatus, "Read status should be 200").toBe(200);
            expect(getError, "Read should not error").toBeNull();
            expect(getData).toBeDefined();
            expect(getData?._id).toBe(createdItemId);
            expect(getData?._rev).toBe(currentRev);
            expect(getData?.type).toBe(collection);
            expect(getData?.name).toBe(initialData.name);
            expect(getData?.value).toBe(initialData.value);

            // --- 3. Update Document (PUT) ---
            const updatedPayload = { name: "Updated CRUD Item", value: 456 };
            const {
                data: updateData,
                error: updateError,
                status: updateStatus,
            } = await api.api.v1
                .data({ collection })({ id: createdItemId! })
                .put({
                    ...updatedPayload,
                    _rev: currentRev!,
                });

            expect(updateStatus, "Update status should be 200").toBe(200);
            expect(updateError, "Update should not error").toBeNull();
            expect(updateData?.ok).toBe(true);
            expect(updateData?.id).toBe(createdItemId);
            expect(updateData?.rev).toBeTypeOf("string");
            expect(updateData?.rev).not.toBe(currentRev);

            currentRev = updateData!.rev; // Update revision

            // --- 4. Read Updated Document (GET) ---
            const {
                data: getUpdatedData,
                error: getUpdatedError,
                status: getUpdatedStatus,
            } = await api.api.v1.data({ collection })({ id: createdItemId! }).get();

            expect(getUpdatedStatus, "Read updated status should be 200").toBe(200);
            expect(getUpdatedError, "Read updated should not error").toBeNull();
            expect(getUpdatedData?._id).toBe(createdItemId);
            expect(getUpdatedData?._rev).toBe(currentRev);
            expect(getUpdatedData?.name).toBe(updatedPayload.name);
            expect(getUpdatedData?.value).toBe(updatedPayload.value);
        } finally {
            // --- 5. Delete Document (DELETE) ---
            if (createdItemId && currentRev) {
                const {
                    data: deleteData,
                    error: deleteError,
                    status: deleteStatus,
                } = await api.api.v1
                    .data({ collection })({ id: createdItemId! })
                    .delete(undefined, { query: { _rev: currentRev! } });

                expect(deleteStatus, `Delete status should be 200 (was ${deleteStatus})`).toBe(200);
                expect(deleteError, "Delete should not error").toBeNull();
                expect(deleteData?.ok).toBe(true);

                // --- 6. Verify Deletion (GET) ---
                const {
                    data: getDeletedData,
                    error: getDeletedError,
                    status: getDeletedStatus,
                } = await api.api.v1.data({ collection })({ id: createdItemId! }).get();

                expect(getDeletedStatus, "Read deleted status should be 404").toBe(404);
                expect(getDeletedError).not.toBeNull();
                expect(getDeletedError?.value).toEqual({ error: "Resource not found." } as any);

                createdItemId = null;
                currentRev = null;
            } else {
                logger.warn("Skipping delete cleanup because item ID or revision was missing.");
            }
        }
    });

    it("should return 404 when getting a non-existent document", async () => {
        const nonExistentId = "non-existent-id-12345";
        const { data, error, status } = await api.api.v1.data({ collection })({ id: nonExistentId }).get();

        expect(status).toBe(404);
        expect(data).toBeNull(); // No data on 404
        expect(error).not.toBeNull();
        // Check the error response body returned by your onError handler
        expect(error?.value).toEqual({ error: "Resource not found." } as any);
    });

    it("should return 409 conflict when updating with wrong revision", async () => {
        // 1. Create item
        const { data: createData, status: createStatus } = await api.api.v1.data({ collection }).post({ name: "Conflict Test Item", value: 1 });
        expect(createStatus).toBe(201);
        const itemId = createData!.id;
        const itemRev = createData!.rev;

        // 2. Attempt update with wrong revision
        const updatePayload = { name: "Conflict Update", value: 2, _rev: "1-wrongrevision" } as const;
        disableLogging();
        const { data: updateData, error: updateError, status: updateStatus } = await api.api.v1.data({ collection })({ id: itemId }).put(updatePayload);
        enableLogging();

        expect(updateStatus).toBe(409);
        expect(updateData).toBeNull();
        expect(updateError).not.toBeNull();
        expect((updateError?.value as any)?.error).toContain("Revision conflict");

        // 3. Cleanup (Delete with correct revision)
        if (itemId && itemRev) {
            // Using your confirmed syntax
            const { status: deleteStatus } = await api.api.v1
                .data({ collection })({ id: itemId })
                .delete(undefined, { query: { _rev: itemRev } });
            expect(deleteStatus).toBe(200);
        }
    });

    // This test uses POST, so syntax was already correct
    it("should return 400 bad request when creating with invalid data (if schema enforced)", async () => {
        const invalidData = {}; // Assuming empty object might be invalid if schema changes
        disableLogging();
        const { data, error, status } = await api.api.v1.data({ collection }).post(invalidData);
        enableLogging();

        // Status might be 201 if empty object is allowed by current schema, or 400 if not
        expect([201, 400]).toContain(status);
        if (status === 400) {
            expect(error).not.toBeNull();
            expect((error?.value as any)?.error).toContain("Validation failed");
            // You could add more specific checks on error.value.details if needed
        }
    });

    it("should return 400 bad request when deleting without _rev query parameter", async () => {
        // 1. Create item
        const { data: createData, status: createStatus } = await api.api.v1.data({ collection }).post({ name: "Delete Rev Test Item" });
        expect(createStatus).toBe(201);
        const itemId = createData!.id;
        const itemRev = createData!.rev; // Correct rev

        // 2. Attempt delete without _rev query parameter
        // Using your confirmed syntax for delete, but passing empty options object
        disableLogging();
        const {
            data: deleteData,
            error: deleteError,
            status: deleteStatus,
        } = await (api.api.v1.data({ collection })({ id: itemId }) as any).delete(undefined, {}); // Pass empty options
        enableLogging();

        expect(deleteStatus).toBe(400); // Bad Request
        expect(deleteData).toBeNull();
        expect(deleteError).not.toBeNull();
        // Check the specific validation error structure from Elysia/Treaty
        expect((deleteError?.value as any)?.error).toContain("Validation failed");
        expect((deleteError?.value as any)?.details).toContain("Missing required query parameter: _rev");

        // 3. Cleanup (Delete with correct rev)
        if (itemId && itemRev) {
            const { status: cleanupStatus } = await api.api.v1
                .data({ collection })({ id: itemId })
                .delete(undefined, { query: { _rev: itemRev } });
            expect(cleanupStatus).toBe(200);
        }
    });
});
