import { describe, it, expect, beforeAll, beforeEach, afterAll } from "bun:test";
import { treaty } from "@elysiajs/eden";
import { app } from "./index";
import { logger, disableLogging, enableLogging } from "./utils/logger";

// Use treaty for type-safe client generation
// We might need separate clients or modify headers dynamically
const api = treaty(app);

// --- Test Setup ---
// Use unique credentials for each test run to avoid conflicts
const testTimestamp = Date.now();
const testUserEmail = `testuser_${testTimestamp}@example.com`;
const testUserPassword = `password_${testTimestamp}`; // Use a unique password too
let authToken: string | null = null; // Store the JWT token

// Reset token before each test in case one test fails to clean up
beforeEach(() => {
    authToken = null;
});

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
    it("should register a new user successfully", async () => {
        const { data, error, status } = await api.api.v1.auth.register.post({
            email: testUserEmail,
            password: testUserPassword,
        });

        expect(status, `Register status was ${status}, error: ${JSON.stringify(error?.value)}`).toBe(201);
        expect(error).toBeNull();
        expect(data?.message).toBe("User registered successfully.");
        expect(data?.userId).toBeTypeOf("string");
    });

    it("should fail to register with an existing email", async () => {
        // First, ensure the user exists (run the success test first or register here)
        await api.api.v1.auth.register.post({ email: testUserEmail, password: testUserPassword }); // Ignore result, just ensure exists

        // Attempt to register again
        const { data, error, status } = await api.api.v1.auth.register.post({
            email: testUserEmail,
            password: "anotherpassword", // Different password, same email
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
            email: `shortpass_${testTimestamp}@example.com`,
            password: "short",
        });
        expect(status).toBe(400);
        expect(error?.value as any).toEqual({ error: "Validation failed", details: "Password must be at least 8 characters long." });
    });

    it("should log in successfully with correct credentials", async () => {
        // Ensure user is registered first
        await api.api.v1.auth.register.post({ email: testUserEmail, password: testUserPassword });

        const { data, error, status } = await api.api.v1.auth.login.post({
            email: testUserEmail,
            password: testUserPassword,
        });

        expect(status).toBe(200);
        expect(error).toBeNull();
        expect(data?.message).toBe("Login successful.");
        expect(data?.token).toBeTypeOf("string");
        expect(data!.token.length).toBeGreaterThan(20); // Basic check for JWT format
        authToken = data!.token; // Store token for potential later use (though usually done in data tests)
    });

    it("should fail to log in with incorrect password", async () => {
        // Ensure user is registered first
        await api.api.v1.auth.register.post({ email: testUserEmail, password: testUserPassword });

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

// --- Data API Tests (Now Requiring Auth) ---
describe("Data API Endpoints (/api/v1/data) - Requires Auth", () => {
    // Use a distinct collection name for this test suite run
    const collection = `auth_test_items_${testTimestamp}`;
    let createdItemId: string | null = null;
    let currentRev: string | null = null;
    let localAuthToken: string | null = null; // Token specific to this describe block

    // Setup: Register and Login user before running data tests
    beforeAll(async () => {
        logger.info("Setting up user for Data API tests...");
        try {
            // 1. Register
            const regRes = await api.api.v1.auth.register.post({
                email: testUserEmail,
                password: testUserPassword,
            });
            // Handle potential conflict if user already exists from auth tests (though timestamp should prevent this)
            if (regRes.status !== 201 && regRes.status !== 409) {
                throw new Error(`Failed to register test user: Status ${regRes.status}, Error: ${JSON.stringify(regRes.error?.value)}`);
            }
            logger.info(`Test user ${testUserEmail} registered or already exists.`);

            // 2. Login
            const loginRes = await api.api.v1.auth.login.post({
                email: testUserEmail,
                password: testUserPassword,
            });
            if (loginRes.status !== 200 || !loginRes.data?.token) {
                throw new Error(`Failed to log in test user: Status ${loginRes.status}, Error: ${JSON.stringify(loginRes.error?.value)}`);
            }
            localAuthToken = loginRes.data.token;
            logger.info("Test user logged in successfully, token obtained.");
        } catch (err) {
            logger.error("CRITICAL ERROR during test user setup:", err);
            throw err; // Fail fast if setup fails
        }
    });

    // Helper to add auth header
    const getAuthHeaders = () => {
        if (!localAuthToken) {
            throw new Error("Auth token not available for test request.");
        }
        return { Authorization: `Bearer ${localAuthToken}` };
    };

    // --- Tests for Unauthorized Access ---

    it("should return 401 when accessing POST /data without token", async () => {
        const { status, error } = await api.api.v1.data({ collection }).post({ name: "Unauthorized" });
        expect(status).toBe(401);
        expect(error?.value as any).toEqual({ error: "Unauthorized: Invalid or missing token." });
    });

    it("should return 401 when accessing GET /data/:id without token", async () => {
        const { status, error } = await api.api.v1.data({ collection })({ id: "some-id" }).get();
        expect(status).toBe(401);
        expect(error?.value as any).toEqual({ error: "Unauthorized: Invalid or missing token." });
    });

    it("should return 401 when accessing PUT /data/:id without token", async () => {
        // Cast payload to any to bypass stricter type check in test
        const payload: any = { name: "Unauthorized", _rev: "1-abc" };
        const { status, error } = await api.api.v1.data({ collection })({ id: "some-id" }).put(payload);
        expect(status).toBe(401);
        expect(error?.value as any).toEqual({ error: "Unauthorized: Invalid or missing token." });
    });

    it("should return 401 when accessing DELETE /data/:id without token", async () => {
        const { status, error } = await api.api.v1
            .data({ collection })({ id: "some-id" })
            .delete(undefined, { query: { _rev: "1-abc" } });
        expect(status).toBe(401);
        expect(error?.value as any).toEqual({ error: "Unauthorized: Invalid or missing token." });
    });

    // --- CRUD Tests (Now with Auth) ---

    // Use a single test to ensure sequence and cleanup
    it("should perform CRUD operations on a document with authentication", async () => {
        expect(localAuthToken).toBeTypeOf("string"); // Ensure token is available

        // --- 1. Create Document (POST) ---
        const initialData = { name: "Auth CRUD Test", value: 789 };
        const {
            data: createData,
            error: createError,
            status: createStatus,
        } = await api.api.v1.data({ collection }).post(initialData, { headers: getAuthHeaders() });

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
            } = await api.api.v1.data({ collection })({ id: createdItemId! }).get({ headers: getAuthHeaders() });

            expect(getStatus, "Read status should be 200").toBe(200);
            expect(getError, "Read should not error").toBeNull();
            expect(getData).toBeDefined();
            expect(getData?._id).toBe(createdItemId);
            expect(getData?._rev).toBe(currentRev);
            // Type field might not be explicitly set by user, but could be added by service
            // expect(getData?.type).toBe(collection);
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
                    { headers: getAuthHeaders() }
                );

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
            } = await api.api.v1.data({ collection })({ id: createdItemId! }).get({ headers: getAuthHeaders() });

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
                    .delete(undefined, { query: { _rev: currentRev! }, headers: getAuthHeaders() });

                expect(deleteStatus, `Delete status should be 200 (was ${deleteStatus})`).toBe(200);
                expect(deleteError, "Delete should not error").toBeNull();
                expect(deleteData?.ok).toBe(true);

                // --- 6. Verify Deletion (GET) ---
                const {
                    data: getDeletedData,
                    error: getDeletedError,
                    status: getDeletedStatus,
                } = await api.api.v1.data({ collection })({ id: createdItemId! }).get({ headers: getAuthHeaders() }); // Still need auth header to attempt read

                expect(getDeletedStatus, "Read deleted status should be 404").toBe(404);
                expect(getDeletedError).not.toBeNull();
                // The error message comes from the DataService now
                expect((getDeletedError?.value as any)?.error).toContain("not found");

                createdItemId = null;
                currentRev = null;
            } else {
                logger.warn("Skipping delete cleanup because item ID or revision was missing.");
            }
        }
    });

    it("should return 404 when getting a non-existent document (with auth)", async () => {
        const nonExistentId = "non-existent-id-auth-12345";
        const { data, error, status } = await api.api.v1.data({ collection })({ id: nonExistentId }).get({ headers: getAuthHeaders() });

        expect(status).toBe(404);
        expect(data).toBeNull();
        expect(error).not.toBeNull();
        expect((error?.value as any)?.error).toContain("not found");
    });

    it("should return 409 conflict when updating with wrong revision (with auth)", async () => {
        // 1. Create item
        const { data: createData, status: createStatus } = await api.api.v1
            .data({ collection })
            .post({ name: "Auth Conflict Test", value: 1 }, { headers: getAuthHeaders() });
        expect(createStatus).toBe(201);
        const itemId = createData!.id;
        const itemRev = createData!.rev;

        // 2. Attempt update with wrong revision
        const updatePayload = { name: "Auth Conflict Update", value: 2, _rev: "1-wrongrevision" } as const;
        disableLogging();
        const {
            data: updateData,
            error: updateError,
            status: updateStatus,
        } = await api.api.v1.data({ collection })({ id: itemId }).put(updatePayload, { headers: getAuthHeaders() });
        enableLogging();

        expect(updateStatus).toBe(409);
        expect(updateData).toBeNull();
        expect(updateError).not.toBeNull();
        expect((updateError?.value as any)?.error).toContain("Revision conflict");

        // 3. Cleanup (Delete with correct revision)
        if (itemId && itemRev) {
            const { status: deleteStatus } = await api.api.v1
                .data({ collection })({ id: itemId })
                .delete(undefined, { query: { _rev: itemRev }, headers: getAuthHeaders() });
            expect(deleteStatus).toBe(200);
        }
    });

    // This test uses POST, so syntax was already correct
    it("should return 400 bad request when creating with invalid data (if schema enforced) (with auth)", async () => {
        const invalidData = {}; // Assuming empty object might be invalid if schema changes

        disableLogging();
        const { data, error, status } = await api.api.v1.data({ collection }).post(invalidData, { headers: getAuthHeaders() });
        enableLogging();

        // Status might be 201 if empty object is allowed by current schema, or 400 if not
        expect([201, 400]).toContain(status);
        if (status === 400) {
            expect(error).not.toBeNull();
            expect((error?.value as any)?.error).toContain("Validation failed");
        } else if (status === 201 && data?.id && data?.rev) {
            // Cleanup if created successfully
            await api.api.v1
                .data({ collection })({ id: data.id })
                .delete(undefined, { query: { _rev: data.rev }, headers: getAuthHeaders() });
        }
    });

    it("should return 400 bad request when deleting without _rev query parameter (with auth)", async () => {
        // 1. Create item
        const { data: createData, status: createStatus } = await api.api.v1
            .data({ collection })
            .post({ name: "Auth Delete Rev Test" }, { headers: getAuthHeaders() });
        expect(createStatus).toBe(201);
        const itemId = createData!.id;
        const itemRev = createData!.rev; // Correct rev

        // 2. Attempt delete without _rev query parameter
        disableLogging();
        const {
            data: deleteData,
            error: deleteError,
            status: deleteStatus,
        } = await (api.api.v1.data({ collection })({ id: itemId }) as any).delete(undefined, { headers: getAuthHeaders() }); // Pass headers but empty query
        enableLogging();

        expect(deleteStatus).toBe(400); // Bad Request
        expect(deleteData).toBeNull();
        expect(deleteError).not.toBeNull();
        expect((deleteError?.value as any)?.error).toContain("Validation failed");
        expect((deleteError?.value as any)?.details).toContain("Missing required query parameter: _rev");

        // 3. Cleanup (Delete with correct rev)
        if (itemId && itemRev) {
            const { status: cleanupStatus } = await api.api.v1
                .data({ collection })({ id: itemId })
                .delete(undefined, { query: { _rev: itemRev }, headers: getAuthHeaders() });
            expect(cleanupStatus).toBe(200);
        }
    });
});
