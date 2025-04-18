import { Elysia, t } from "elysia";
import { dataService } from "./services/data.service"; // Import the data service

// Define a basic schema for data documents (excluding _id, _rev, type)
const DataDocumentSchema = t.Object({}, { additionalProperties: true }); // Allow any fields for now

// Define schema for update payload, requiring _rev
const UpdateDataDocumentSchema = t.Intersect([
    t.Object({
        _rev: t.String({ error: "Missing required field: _rev" }),
    }),
    DataDocumentSchema,
]);

// Define schema for delete query parameters, requiring _rev
const DeleteParamsSchema = t.Object({
    _rev: t.String({ error: "Missing required query parameter: _rev" }),
});

export const app = new Elysia()
    .decorate("dataService", dataService) // Make service available in handlers
    .onError(({ code, error, set }) => {
        // Log the error code
        console.error(`[${code}] Error occurred:`);

        // Check if it's a standard Error object before accessing message/stack
        if (error instanceof Error) {
            console.error(`Message: ${error.message}`);
            console.error(error.stack); // Log stack trace for debugging

            // Handle specific known errors from DataService based on message
            if (error.message.includes("not found")) {
                set.status = 404; // Not Found
                return { error: "Resource not found." };
            }
            if (error.message.includes("Revision conflict")) {
                set.status = 409; // Conflict
                return { error: error.message }; // Return the specific conflict message
            }
            if (error.message.includes("Database connection not initialized")) {
                set.status = 503; // Service Unavailable
                return { error: "Database service is not available." };
            }
        } else {
            // Log non-standard errors differently
            console.error("Non-standard error object:", error);
        }

        // Handle Elysia validation errors specifically by code
        if (code === "VALIDATION") {
            set.status = 400; // Bad Request
            // The 'error' object for VALIDATION might have specific structure.
            // Let's try to return a generic validation message,
            // potentially accessing error.message if it exists and is informative.
            let details = "Invalid request body or parameters.";
            if (error instanceof Error && error.message) {
                try {
                    // Attempt to parse Bun/Elysia's detailed validation error message
                    const validationInfo = JSON.parse(error.message);
                    if (validationInfo && Array.isArray(validationInfo.issues)) {
                        details = validationInfo.issues.map((issue: any) => `${issue.path?.join(".") || "field"}: ${issue.message}`).join(", ");
                    } else {
                        details = error.message; // Use raw message if parsing fails
                    }
                } catch (e) {
                    details = error.message; // Use raw message if JSON parsing fails
                }
            }
            return { error: "Validation failed", details: details };
        }

        // Handle other specific Elysia error codes if needed
        if (code === "NOT_FOUND") {
            set.status = 404;
            return { error: "API endpoint not found." };
        }
        if (code === "PARSE") {
            set.status = 400;
            return { error: "Failed to parse request body." };
        }

        // Default internal server error for unhandled cases
        set.status = 500;
        return { error: "An internal server error occurred." };
    })
    .get("/health", () => ({ status: "ok" }))
    .group("/api/v1/data", (group) =>
        group
            // POST /api/v1/data/:collection - Create a document
            .post(
                "/:collection",
                async ({ dataService, params, body, set }) => {
                    const { collection } = params;
                    const response = await dataService.createDocument(collection, body);
                    set.status = 201; // Created
                    return { id: response.id, rev: response.rev, ok: response.ok };
                },
                {
                    params: t.Object({ collection: t.String() }),
                    body: DataDocumentSchema,
                    detail: { summary: "Create a document in a collection" },
                }
            )
            // GET /api/v1/data/:collection/:id - Get a document by ID
            .get(
                "/:collection/:id",
                async ({ dataService, params }) => {
                    const { id } = params;
                    // Note: Current dataService.getDocument doesn't use collection, but route includes it for structure
                    const doc = await dataService.getDocument(id);
                    // Remove _id and _rev from the main body for cleaner response? Optional.
                    // const { _id, _rev, ...data } = doc;
                    // return { id: _id, rev: _rev, data };
                    return doc; // Return the full document for now
                },
                {
                    params: t.Object({
                        collection: t.String(),
                        id: t.String(),
                    }),
                    detail: { summary: "Get a document by ID" },
                }
            )
            // PUT /api/v1/data/:collection/:id - Update a document
            .put(
                "/:collection/:id",
                async ({ dataService, params, body, set }) => {
                    const { collection, id } = params;
                    const { _rev, ...dataToUpdate } = body; // Extract _rev from body
                    const response = await dataService.updateDocument(collection, id, _rev, dataToUpdate);
                    set.status = 200; // OK
                    return { id: response.id, rev: response.rev, ok: response.ok };
                },
                {
                    params: t.Object({
                        collection: t.String(),
                        id: t.String(),
                    }),
                    body: UpdateDataDocumentSchema, // Use schema that requires _rev
                    detail: { summary: "Update a document by ID (requires _rev in body)" },
                }
            )
            // DELETE /api/v1/data/:collection/:id?_rev=... - Delete a document
            .delete(
                "/:collection/:id",
                async ({ dataService, params, query, set }) => {
                    const { id } = params;
                    const { _rev } = query; // Get _rev from query parameters
                    const response = await dataService.deleteDocument(id, _rev);
                    set.status = 200; // OK (or 204 No Content)
                    // Return minimal response or just status code
                    return { ok: response.ok };
                },
                {
                    params: t.Object({
                        collection: t.String(),
                        id: t.String(),
                    }),
                    query: DeleteParamsSchema, // Validate query parameter _rev
                    detail: { summary: "Delete a document by ID (requires _rev query parameter)" },
                }
            )
    );

// Start the server only if the file is run directly
if (import.meta.main) {
    app.listen(3000);
    console.log(`🦊 Vibe Cloud is running at ${app.server?.hostname}:${app.server?.port}`);
}
