import { describe, it, expect, beforeAll } from "bun:test";
import { treaty } from "@elysiajs/eden";
import { app } from "./index";
import { dataService } from "./services/data.service";

// Use treaty for type-safe client generation
const api = treaty(app);

beforeAll(async () => {
    console.log("Running beforeAll: Ensuring DataService is initialized...");
    // Directly call and await the async initialization logic
    // This assumes ensureDbExists handles both checking and creation idempotently
    try {
        await dataService.ensureDbExists();
        console.log("DataService initialization check complete.");
    } catch (err) {
        console.error("Error during beforeAll DataService initialization:", err);
        // Optionally throw the error to fail the test suite early
        // throw err;
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
    const collection = "test_items";
    let createdItemId: string | null = null;
    let currentRev: string | null = null;

    // Use a single test to ensure sequence and cleanup
    it("should perform CRUD operations on a document", async () => {
        // --- 1. Create Document (POST) ---
        console.log("Creating document in collection:", collection);
        const initialData = { name: "Treaty Test Item", value: 123 };
        const { data: createData, error: createError, status: createStatus } = await api.api.v1.data({ collection }).post(initialData);
        console.log("Create response:", createData, createError, createStatus);

        expect(createStatus, "Create status should be 201").toBe(201);
        expect(createError, "Create should not error").toBeNull();
        expect(createData?.ok).toBe(true);
        expect(createData?.id).toBeTypeOf("string");
        expect(createData?.rev).toBeTypeOf("string");

        createdItemId = createData!.id;
        currentRev = createData!.rev;
        expect(createdItemId).toBeDefined();
        expect(currentRev).toBeDefined();

        // try {
        //     // --- 2. Read Document (GET) ---
        //     const { data: getData, error: getError, status: getStatus } = await api.api.v1.data({ collection })({ id: createdItemId! }).get();

        //     expect(getStatus, "Read status should be 200").toBe(200);
        //     expect(getError, "Read should not error").toBeNull();
        //     expect(getData).toBeDefined();
        //     expect(getData?._id).toBe(createdItemId);
        //     expect(getData?._rev).toBe(currentRev);
        //     expect(getData?.type).toBe(collection);
        //     expect(getData?.name).toBe(initialData.name);
        //     expect(getData?.value).toBe(initialData.value);

        //     // --- 3. Update Document (PUT) ---
        //     const updatedPayload = { name: "Updated Treaty Item", value: 456 };
        //     const {
        //         data: updateData,
        //         error: updateError,
        //         status: updateStatus,
        //     } = await api.api.v1
        //         .data({ collection })({ id: createdItemId! })
        //         .put({
        //             ...updatedPayload,
        //             _rev: currentRev!, // Include _rev in the body object
        //         });

        //     expect(updateStatus, "Update status should be 200").toBe(200);
        //     expect(updateError, "Update should not error").toBeNull();
        //     expect(updateData?.ok).toBe(true);
        //     expect(updateData?.id).toBe(createdItemId);
        //     expect(updateData?.rev).toBeTypeOf("string");
        //     expect(updateData?.rev).not.toBe(currentRev);

        //     currentRev = updateData!.rev; // Update revision

        //     // --- 4. Read Updated Document (GET) ---
        //     const {
        //         data: getUpdatedData,
        //         error: getUpdatedError,
        //         status: getUpdatedStatus,
        //     } = await api.api.v1.data({ collection })({ id: createdItemId! }).get();

        //     expect(getUpdatedStatus, "Read updated status should be 200").toBe(200);
        //     expect(getUpdatedError, "Read updated should not error").toBeNull();
        //     expect(getUpdatedData?._id).toBe(createdItemId);
        //     expect(getUpdatedData?._rev).toBe(currentRev);
        //     expect(getUpdatedData?.name).toBe(updatedPayload.name);
        //     expect(getUpdatedData?.value).toBe(updatedPayload.value);
        // } finally {
        //     // --- 5. Delete Document (DELETE) ---
        //     if (createdItemId && currentRev) {
        //         const {
        //             data: deleteData,
        //             error: deleteError,
        //             status: deleteStatus,
        //         } = await api.api.v1
        //             .data({ collection })({ id: createdItemId })
        //             .delete(undefined, {
        //                 // Pass undefined for body
        //                 query: { _rev: currentRev }, // Pass query params
        //             });

        //         expect(deleteStatus, `Delete status should be 200 (was ${deleteStatus})`).toBe(200);
        //         // Check error only if status is not 200, treaty might put validation errors in 'error' even on non-2xx status
        //         if (deleteStatus !== 200) {
        //             console.error("Delete Error:", deleteError);
        //         }
        //         expect(deleteError, "Delete should not error").toBeNull();
        //         expect(deleteData?.ok).toBe(true);

        //         // --- 6. Verify Deletion (GET) ---
        //         const {
        //             data: getDeletedData,
        //             error: getDeletedError,
        //             status: getDeletedStatus,
        //         } = await api.api.v1.data({ collection })({ id: createdItemId }).get();

        //         expect(getDeletedStatus, "Read deleted status should be 404").toBe(404);
        //         // Expect error object to exist and contain relevant info for 404
        //         expect(getDeletedError).not.toBeNull();
        //         expect(getDeletedError?.value).toEqual({ error: "Resource not found." }); // Check error response body

        //         createdItemId = null;
        //         currentRev = null;
        //     } else {
        //         console.warn("Skipping delete cleanup because item ID or revision was missing.");
        //     }
        // }
    });

    // --- Refactor other tests similarly ---

    // it("should return 404 when getting a non-existent document", async () => {
    //     const nonExistentId = "non-existent-id-treaty";
    //     const { data, error, status } = await api.api.v1.data({ collection })({ id: nonExistentId }).get();

    //     expect(status).toBe(404);
    //     expect(data).toBeNull(); // No data on 404
    //     expect(error).not.toBeNull();
    //     expect(error?.value).toEqual({ error: "Resource not found." }); // Check error response body
    // });

    // it("should return 409 conflict when updating with wrong revision", async () => {
    //     // 1. Create item
    //     const { data: createData, status: createStatus } = await api.api.v1.data({ collection }).post({ name: "Conflict Treaty Test", value: 1 });
    //     expect(createStatus).toBe(201);
    //     const itemId = createData!.id;
    //     const itemRev = createData!.rev;

    //     // 2. Attempt update with wrong revision
    //     const updatePayload = { name: "Conflict Update", value: 2, _rev: "1-wrongrevision" } as const;
    //     const { data: updateData, error: updateError, status: updateStatus } = await api.api.v1.data({ collection })({ id: itemId }).put(updatePayload);

    //     expect(updateStatus).toBe(409);
    //     expect(updateData).toBeNull();
    //     expect(updateError).not.toBeNull();
    //     expect(updateError?.value?.message).toContain("Revision conflict"); // Check error message

    //     // 3. Cleanup (Delete with correct revision)
    //     if (itemId && itemRev) {
    //         const { status: deleteStatus } = await api.api.v1
    //             .data({ collection })({ id: itemId })
    //             .delete(undefined, { query: { _rev: itemRev } });
    //         expect(deleteStatus).toBe(200);
    //     }
    // });

    // // ... (Keep the 400 invalid data test as is, it already uses treaty) ...

    // it("should return 400 bad request when deleting without _rev query parameter", async () => {
    //     // 1. Create item
    //     const { data: createData, status: createStatus } = await api.api.v1.data({ collection }).post({ name: "Delete Rev Treaty Test" });
    //     expect(createStatus).toBe(201);
    //     const itemId = createData!.id;
    //     const itemRev = createData!.rev; // Correct rev

    //     // 2. Attempt delete without _rev
    //     const {
    //         data: deleteData,
    //         error: deleteError,
    //         status: deleteStatus,
    //     } = await (api.api.v1.data({ collection })({ id: itemId }).delete as any)(undefined, {}); // Type assertion to bypass parameter validation

    //     expect(deleteStatus).toBe(400); // Bad Request
    //     expect(deleteData).toBeNull();
    //     expect(deleteError).not.toBeNull();
    //     // Check the specific validation error structure from Elysia/Treaty
    //     expect(deleteError?.value?.error).toContain("Validation failed");
    //     expect(deleteError?.value?.details).toContain("_rev: Missing required query parameter");

    //     // 3. Cleanup (Delete with correct rev)
    //     if (itemId && itemRev) {
    //         const { status: cleanupStatus } = await api.api.v1
    //             .data({ collection })({ id: itemId })
    //             .delete(undefined, { query: { _rev: itemRev } });
    //         expect(cleanupStatus).toBe(200);
    //     }
    // });
});
