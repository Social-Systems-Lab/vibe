import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { treaty } from "@elysiajs/eden";
import { app } from "./index";
import { authService } from "./services/auth.service";
import { logger, disableLogging, enableLogging } from "./utils/logger";

// --- Test Setup ---
const api = treaty(app);

// Variables to hold the single user's credentials and token for the entire test run
const testTimestamp = Date.now();
const testUserEmail = `testuser_${testTimestamp}@example.com`;
const testUserPassword = `password_${testTimestamp}`;
let testUserId: string | null = null; // Store the user ID from registration
let authToken: string | null = null; // Store the JWT token from login

// --- Global Setup and Teardown ---

beforeAll(async () => {
    logger.log(`Setting up test user ${testUserEmail} for the test run...`);
    try {
        // 1. Register the unique user for this test run
        const regRes = await api.api.v1.auth.register.post({
            email: testUserEmail,
            password: testUserPassword,
        });

        if (regRes.status !== 201 || !regRes.data?.userId) {
            throw new Error(`BEFORE_ALL FAILED: Could not register test user. Status: ${regRes.status}, Error: ${JSON.stringify(regRes.error?.value)}`);
        }
        testUserId = regRes.data.userId; // Store the user ID
        logger.log(`Test user ${testUserEmail} registered successfully (ID: ${testUserId}).`);

        // 2. Log in the user to get the auth token
        const loginRes = await api.api.v1.auth.login.post({
            email: testUserEmail,
            password: testUserPassword,
        });

        if (loginRes.status !== 200 || !loginRes.data?.token) {
            throw new Error(`BEFORE_ALL FAILED: Could not log in test user. Status: ${loginRes.status}, Error: ${JSON.stringify(loginRes.error?.value)}`);
        }
        authToken = loginRes.data.token; // Store the auth token
        logger.log(`Test user ${testUserEmail} logged in successfully.`);
    } catch (err) {
        logger.error("CRITICAL ERROR during global test setup (beforeAll):", err);
        throw err;
    }
});

afterAll(async () => {
    logger.log(`Cleaning up test user ${testUserEmail} (userId: ${testUserId})...`);
    if (!testUserId) {
        logger.warn("Skipping user cleanup as testUserId was not set (setup likely failed).");
        return;
    }

    try {
        // Call the AuthService method for cleanup
        await authService.deleteUser(testUserId);
        logger.log(`Cleanup requested for test user ${testUserEmail} via AuthService.`);
    } catch (error: any) {
        // Log cleanup errors but don't fail the test suite because of them
        logger.error(`Error during test user cleanup call for ${testUserEmail} (userId: ${testUserId}):`, error.message || error);
    }
});

// --- Helper to add auth header ---
const getAuthHeaders = () => {
    if (!authToken) {
        throw new Error("Auth token not available. Global setup (beforeAll) likely failed.");
    }
    return { Authorization: `Bearer ${authToken}` };
};

// --- API Endpoint Tests ---

describe("API Endpoints", () => {
    it("GET /health should return status ok", async () => {
        const { data, error, status } = await api.health.get();
        expect(status).toBe(200);
        expect(error).toBeNull();
        expect(data).toEqual({ status: "ok" });
    });
});

// --- Auth API Tests ---
describe("Auth API Endpoints (/api/v1/auth)", () => {
    it("should fail to register with the existing email (created in beforeAll)", async () => {
        // Attempt to register the SAME user again
        const { data, error, status } = await api.api.v1.auth.register.post({
            email: testUserEmail, // Use the globally defined email
            password: "anotherpassword",
        });

        expect(status).toBe(409); // Conflict
        expect(data).toBeNull();
        expect(error).not.toBeNull();
        expect(error?.value as any).toEqual({ error: "Email already registered." });
    });

    it("should fail to register with invalid email format", async () => {
        const { data, error, status } = await api.api.v1.auth.register.post({
            email: "invalid-email",
            password: "validpassword123",
        });
        expect(status).toBe(400);
        expect(error?.value as any).toEqual({ error: "Validation failed", details: "Invalid email format." });
    });

    it("should fail to register with short password", async () => {
        const { data, error, status } = await api.api.v1.auth.register.post({
            email: `shortpass_${testTimestamp}@example.com`, // Use a different email for this validation test
            password: "short",
        });
        expect(status).toBe(400);
        expect(error?.value as any).toEqual({ error: "Validation failed", details: "Password must be at least 8 characters long." });
    });

    it("should fail to log in with incorrect password", async () => {
        // User testUserEmail was created in beforeAll
        const { data, error, status } = await api.api.v1.auth.login.post({
            email: testUserEmail,
            password: "wrongpassword",
        });

        expect(status).toBe(401); // Unauthorized
        expect(data).toBeNull();
        expect(error).not.toBeNull();
        expect(error?.value as any).toEqual({ error: "Invalid credentials." });
    });

    it("should fail to log in with non-existent email", async () => {
        const { data, error, status } = await api.api.v1.auth.login.post({
            email: `nonexistent_${testTimestamp}@example.com`,
            password: "somepassword",
        });

        expect(status).toBe(401); // Unauthorized (service returns same error for not found / wrong pass)
        expect(data).toBeNull();
        expect(error).not.toBeNull();
        expect(error?.value as any).toEqual({ error: "Invalid credentials." });
    });
});

// --- Data API Tests ---
describe("Data API Endpoints (/api/v1/data) - Requires Auth", () => {
    // Use a distinct collection name for this test suite run
    const collection = `auth_test_items_${testTimestamp}`;
    let createdItemId: string | null = null; // Keep these local to the CRUD test
    let currentRev: string | null = null;

    // --- Tests for Unauthorized Access ---
    // These tests remain the same, ensuring endpoints fail *without* the token

    it("should return 401 when accessing POST /data without token", async () => {
        const { status, error } = await api.api.v1.data({ collection }).post({ name: "Unauthorized" });
        expect(status).toBe(401);
        expect(error?.value as any).toEqual({ error: "Unauthorized: Invalid token." });
    });

    it("should return 401 when accessing GET /data/:id without token", async () => {
        const { status, error } = await api.api.v1.data({ collection })({ id: "some-id" }).get();
        expect(status).toBe(401);
        expect(error?.value as any).toEqual({ error: "Unauthorized: Invalid token." });
    });

    it("should return 401 when accessing PUT /data/:id without token", async () => {
        const payload: any = { name: "Unauthorized", _rev: "1-abc" };
        const { status, error } = await api.api.v1.data({ collection })({ id: "some-id" }).put(payload);
        expect(status).toBe(401);
        expect(error?.value as any).toEqual({ error: "Unauthorized: Invalid token." });
    });

    it("should return 401 when accessing DELETE /data/:id without token", async () => {
        const { status, error } = await api.api.v1
            .data({ collection })({ id: "some-id" })
            .delete(undefined, { query: { _rev: "1-abc" } });
        expect(status).toBe(401);
        expect(error?.value as any).toEqual({ error: "Unauthorized: Invalid token." });
    });

    // --- CRUD Tests ---

    it("should perform CRUD operations on a document with authentication", async () => {
        // Ensure token is available (checked by getAuthHeaders)
        expect(authToken).toBeTypeOf("string");

        // --- 1. Create Document (POST) ---
        const initialData = { name: "Auth CRUD Test", value: 789 };
        const {
            data: createData,
            error: createError,
            status: createStatus,
        } = await api.api.v1.data({ collection }).post(initialData, { headers: getAuthHeaders() }); // Uses global token

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
            const {
                data: getData,
                error: getError,
                status: getStatus,
            } = await api.api.v1.data({ collection })({ id: createdItemId! }).get({ headers: getAuthHeaders() }); // Uses global token

            expect(getStatus, "Read status should be 200").toBe(200);
            expect(getError, "Read should not error").toBeNull();
            // ... rest of GET assertions ...
            expect(getData?._id).toBe(createdItemId);
            expect(getData?._rev).toBe(currentRev);
            expect(getData?.name).toBe(initialData.name);
            expect(getData?.value).toBe(initialData.value);

            // --- 3. Update Document (PUT) ---
            const updatedPayload = { name: "Updated Auth CRUD", value: 987 };
            const {
                data: updateData,
                error: updateError,
                status: updateStatus,
            } = await api.api.v1
                .data({ collection })({ id: createdItemId! })
                .put(
                    {
                        ...updatedPayload,
                        _rev: currentRev!,
                    },
                    { headers: getAuthHeaders() } // Uses global token
                );

            expect(updateStatus, "Update status should be 200").toBe(200);
            expect(updateError, "Update should not error").toBeNull();
            // ... rest of PUT assertions ...
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
            } = await api.api.v1.data({ collection })({ id: createdItemId! }).get({ headers: getAuthHeaders() }); // Uses global token

            expect(getUpdatedStatus, "Read updated status should be 200").toBe(200);
            expect(getUpdatedError, "Read updated should not error").toBeNull();
            // ... rest of GET updated assertions ...
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
                    .delete(undefined, { query: { _rev: currentRev! }, headers: getAuthHeaders() }); // Uses global token

                expect(deleteStatus, `Delete status should be 200 (was ${deleteStatus})`).toBe(200);
                expect(deleteError, "Delete should not error").toBeNull();
                expect(deleteData?.ok).toBe(true);

                // --- 6. Verify Deletion (GET) ---
                const { error: getDeletedError, status: getDeletedStatus } = await api.api.v1
                    .data({ collection })({ id: createdItemId! })
                    .get({ headers: getAuthHeaders() }); // Uses global token

                expect(getDeletedStatus, "Read deleted status should be 404").toBe(404);
                expect(getDeletedError).not.toBeNull();
                expect((getDeletedError?.value as any)?.error).toContain("not found"); // Or "Resource not found." depending on your error handler

                createdItemId = null;
                currentRev = null;
            } else {
                logger.warn("Skipping delete cleanup within CRUD test because item ID or revision was missing.");
            }
        }
    });

    it("should return 404 when getting a non-existent document", async () => {
        const nonExistentId = "non-existent-id-auth-12345";
        const { data, error, status } = await api.api.v1.data({ collection })({ id: nonExistentId }).get({ headers: getAuthHeaders() }); // Uses global token

        expect(status).toBe(404);
        expect(data).toBeNull();
        expect(error).not.toBeNull();
        expect((error?.value as any)?.error).toContain("not found"); // Or "Resource not found."
    });

    it("should return 409 conflict when updating with wrong revision", async () => {
        // 1. Create item
        const { data: createData, status: createStatus } = await api.api.v1
            .data({ collection })
            .post({ name: "Auth Conflict Test", value: 1 }, { headers: getAuthHeaders() }); // Uses global token
        expect(createStatus).toBe(201);
        const itemId = createData!.id;
        const itemRev = createData!.rev;

        // 2. Attempt update with wrong revision
        const updatePayload = { name: "Auth Conflict Update", value: 2, _rev: "1-wrongrevision" } as const;
        disableLogging();
        const { error: updateError, status: updateStatus } = await api.api.v1
            .data({ collection })({ id: itemId })
            .put(updatePayload, { headers: getAuthHeaders() }); // Uses global token
        enableLogging();

        expect(updateStatus).toBe(409);
        expect(updateError).not.toBeNull();
        expect((updateError?.value as any)?.error).toContain("Revision conflict");

        // 3. Cleanup (Delete with correct revision)
        if (itemId && itemRev) {
            const { status: deleteStatus } = await api.api.v1
                .data({ collection })({ id: itemId })
                .delete(undefined, { query: { _rev: itemRev }, headers: getAuthHeaders() }); // Uses global token
            expect(deleteStatus).toBe(200);
        }
    });

    it("should return 400 bad request when creating with invalid data (if schema enforced)", async () => {
        const invalidData = {}; // Assuming empty object might be invalid

        disableLogging();
        const { data, error, status } = await api.api.v1.data({ collection }).post(invalidData, { headers: getAuthHeaders() }); // Uses global token
        enableLogging();

        expect([201, 400]).toContain(status); // Allow 201 if empty is valid, 400 if not
        if (status === 400) {
            expect(error).not.toBeNull();
            expect((error?.value as any)?.error).toContain("Validation failed");
        } else if (status === 201 && data?.id && data?.rev) {
            // Cleanup if created successfully
            await api.api.v1
                .data({ collection })({ id: data.id })
                .delete(undefined, { query: { _rev: data.rev }, headers: getAuthHeaders() }); // Uses global token
        }
    });

    it("should return 400 bad request when deleting without _rev query parameter", async () => {
        // 1. Create item
        const { data: createData, status: createStatus } = await api.api.v1
            .data({ collection })
            .post({ name: "Auth Delete Rev Test" }, { headers: getAuthHeaders() }); // Uses global token
        expect(createStatus).toBe(201);
        const itemId = createData!.id;
        const itemRev = createData!.rev;

        // 2. Attempt delete without _rev query parameter
        disableLogging();
        const { error: deleteError, status: deleteStatus } = await (api.api.v1.data({ collection })({ id: itemId }) as any).delete(undefined, {
            headers: getAuthHeaders(),
        }); // Pass headers but empty query
        enableLogging();

        expect(deleteStatus).toBe(400);
        expect(deleteError).not.toBeNull();
        expect((deleteError?.value as any)?.error).toContain("Validation failed");
        expect((deleteError?.value as any)?.details).toContain("Missing required query parameter: _rev");

        // 3. Cleanup (Delete with correct rev)
        if (itemId && itemRev) {
            const { status: cleanupStatus } = await api.api.v1
                .data({ collection })({ id: itemId })
                .delete(undefined, { query: { _rev: itemRev }, headers: getAuthHeaders() }); // Uses global token
            expect(cleanupStatus).toBe(200);
        }
    });
});
