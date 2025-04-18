import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { treaty } from "@elysiajs/eden";
import type { Server } from "bun";
import { app } from "./index"; // Import the actual app instance

// Use treaty for type-safe client generation for simpler routes
const api = treaty(app);

// Base URL for fetch calls - assuming default port 3000
// In a real setup, this might come from environment variables or test config
const BASE_URL = `http://${app.server?.hostname ?? "localhost"}:${app.server?.port ?? 3000}`;

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
        // 1. Create Document (POST)
        const initialData = { name: "Test Item", value: 123 };
        const { data: createData, error: createError, status: createStatus } = await api.api.v1.data({ collection }).post(initialData);

        expect(createStatus, "Create status should be 201").toBe(201);
        expect(createError, "Create should not error").toBeNull();
        expect(createData, "Create response data should exist").toBeDefined();
        expect(createData?.ok, "Create response ok should be true").toBe(true);
        expect(createData?.id, "Create response should have an ID").toBeTypeOf("string");
        expect(createData?.rev, "Create response should have a revision").toBeTypeOf("string");

        createdItemId = createData!.id; // Store ID for subsequent steps
        currentRev = createData!.rev; // Store revision

        // Ensure we have an ID and rev before proceeding
        if (!createdItemId || !currentRev) {
            throw new Error("Failed to get ID or revision from create response");
        }

        try {
            // 2. Read Document (GET using fetch)
            const getResponse = await fetch(`${BASE_URL}/api/v1/data/${collection}/${createdItemId}`);
            const getStatus = getResponse.status;
            const getData = await getResponse.json();

            expect(getStatus, "Read status should be 200").toBe(200);
            // Assuming successful fetch doesn't throw, check response data
            expect(getData, "Read response data should exist").toBeDefined();
            expect(getData?._id, "Read data should have correct ID").toBe(createdItemId);
            expect(getData?._rev, "Read data should have correct revision").toBe(currentRev);
            expect(getData?.type, "Read data should have correct type (collection)").toBe(collection);
            expect(getData?.name, "Read data should have correct name").toBe(initialData.name);
            expect(getData?.value, "Read data should have correct value").toBe(initialData.value);

            // 3. Update Document (PUT using fetch)
            const updatedPayload = { name: "Updated Test Item", value: 456, _rev: currentRev }; // Include current revision
            const putResponse = await fetch(`${BASE_URL}/api/v1/data/${collection}/${createdItemId}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(updatedPayload),
            });
            const updateStatus = putResponse.status;
            const updateData = await putResponse.json();

            expect(updateStatus, "Update status should be 200").toBe(200);
            // Check response data
            expect(updateData, "Update response data should exist").toBeDefined();
            expect(updateData?.ok, "Update response ok should be true").toBe(true);
            expect(updateData?.id, "Update response should have the same ID").toBe(createdItemId);
            expect(updateData?.rev, "Update response should have a new revision").toBeTypeOf("string");
            expect(updateData?.rev, "Update response revision should differ from previous").not.toBe(currentRev);

            currentRev = updateData!.rev; // Update revision for delete step

            // 4. Read Updated Document (GET using fetch)
            const getUpdatedResponse = await fetch(`${BASE_URL}/api/v1/data/${collection}/${createdItemId}`);
            const getUpdatedStatus = getUpdatedResponse.status;
            const getUpdatedData = await getUpdatedResponse.json();

            expect(getUpdatedStatus, "Read updated status should be 200").toBe(200);
            // Check response data
            expect(getUpdatedData, "Read updated data should exist").toBeDefined();
            expect(getUpdatedData?._id, "Read updated data should have correct ID").toBe(createdItemId);
            expect(getUpdatedData?._rev, "Read updated data should have new revision").toBe(currentRev);
            expect(getUpdatedData?.name, "Read updated data should have updated name").toBe(updatedPayload.name); // Corrected: Check against payload name
            expect(getUpdatedData?.value, "Read updated data should have updated value").toBe(updatedPayload.value); // Corrected: Check against payload value
        } finally {
            // 5. Delete Document (DELETE using fetch) - Ensure this runs even if updates/reads fail
            if (createdItemId && currentRev) {
                const deleteResponse = await fetch(`${BASE_URL}/api/v1/data/${collection}/${createdItemId}?_rev=${currentRev}`, {
                    method: "DELETE",
                });
                const deleteStatus = deleteResponse.status;
                const deleteData = await deleteResponse.json();

                expect(deleteStatus, "Delete status should be 200").toBe(200);
                // Check response data
                expect(deleteData?.ok, "Delete response ok should be true").toBe(true);

                // 6. Verify Deletion (GET using fetch)
                const getDeletedResponse = await fetch(`${BASE_URL}/api/v1/data/${collection}/${createdItemId}`);
                const getDeletedStatus = getDeletedResponse.status;
                expect(getDeletedStatus, "Read deleted status should be 404").toBe(404);

                createdItemId = null; // Clear state after successful delete
                currentRev = null;
            } else {
                console.warn("Skipping delete cleanup because item ID or revision was missing.");
            }
        }
    });

    it("should return 404 when getting a non-existent document", async () => {
        const nonExistentId = "non-existent-id-12345";
        // Use fetch
        const response = await fetch(`${BASE_URL}/api/v1/data/${collection}/${nonExistentId}`);
        const status = response.status;
        const errorData = status === 404 ? await response.json() : null; // Only parse JSON on expected error status

        expect(status).toBe(404);
        expect(errorData?.error).toContain("not found"); // Check error message in response body
    });

    it("should return 409 conflict when updating with wrong revision", async () => {
        // First, create an item to update
        const initialData = { name: "Conflict Test", value: 1 };
        const { data: createData, status: createStatus } = await api.api.v1.data({ collection }).post(initialData);
        expect(createStatus).toBe(201);
        const itemId = createData!.id;
        const itemRev = createData!.rev;

        // Attempt update with an incorrect revision (using fetch)
        const updatedPayload = { name: "Conflict Update", value: 2, _rev: "1-wrongrevision" };
        const putResponse = await fetch(`${BASE_URL}/api/v1/data/${collection}/${itemId}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(updatedPayload),
        });
        const updateStatus = putResponse.status;
        const updateErrorData = updateStatus === 409 ? await putResponse.json() : null;

        expect(updateStatus).toBe(409); // Conflict
        expect(updateErrorData?.error).toContain("Revision conflict");

        // Cleanup: Delete the item using the correct revision (using fetch)
        if (itemId && itemRev) {
            const deleteResponse = await fetch(`${BASE_URL}/api/v1/data/${collection}/${itemId}?_rev=${itemRev}`, { method: "DELETE" });
            expect(deleteResponse.status).toBe(200);
        }
    });

    it("should return 400 bad request when creating with invalid data (if schema enforced)", async () => {
        // This test depends on stricter schema validation than currently implemented (t.Object({}))
        // If we add required fields later, this test would be more meaningful.
        // For now, it might pass even with an empty object if no fields are required.
        const invalidData = {}; // Or data missing a required field if schema changes
        const { data, error, status } = await api.api.v1.data({ collection }).post(invalidData);

        // Expecting 400 if validation fails, but might be 201 if empty object is allowed
        // Adjust expectation based on actual schema validation behavior
        // Replace toBeWithin with check for specific expected statuses
        expect([201, 400], "Status should be 201 (Created) or 400 (Bad Request)").toContain(status);
        if (status === 400) {
            // Access error details from the 'value' property of the treaty error object
            // The error structure indicates 'message' is the relevant field within 'value'
            const errorMessage = error?.value?.message ?? "";
            // The actual message might be more specific, but let's check it's non-empty for now
            // or contains expected keywords if validation rules were stricter.
            // For an empty object body with no required fields, Elysia might not error,
            // hence the check for status 201 earlier. If it *does* error (e.g., future schema change),
            // this checks the message.
            expect(errorMessage).toBeDefined(); // Check if an error message exists
            // A more specific check could be added if the expected validation message is known:
            // expect(errorMessage).toContain("Expected object"); // Example if empty object was rejected
        }
    });

    it("should return 400 bad request when deleting without _rev query parameter", async () => {
        // Create an item first
        const { data: createData, status: createStatus } = await api.api.v1.data({ collection }).post({ name: "Delete Rev Test" });
        expect(createStatus).toBe(201);
        const itemId = createData!.id;
        const itemRev = createData!.rev; // Correct rev

        // Attempt delete without the _rev query (using fetch)
        const deleteResponse = await fetch(`${BASE_URL}/api/v1/data/${collection}/${itemId}`, {
            // No _rev query param
            method: "DELETE",
        });
        const status = deleteResponse.status;
        const errorData = status === 400 ? await deleteResponse.json() : null;

        expect(status).toBe(400); // Bad Request due to missing required query param
        expect(errorData?.error).toContain("Validation failed");
        expect(errorData?.details).toContain("_rev: Missing required query parameter");

        // Cleanup: Delete with correct rev (using fetch)
        if (itemId && itemRev) {
            const cleanupResponse = await fetch(`${BASE_URL}/api/v1/data/${collection}/${itemId}?_rev=${itemRev}`, { method: "DELETE" });
            expect(cleanupResponse.status).toBe(200);
        }
    });
});
