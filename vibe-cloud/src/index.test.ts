import { describe, it, expect } from "vitest";
import { treaty } from "@elysiajs/eden";
import { app } from "./index"; // Import the actual app instance

// Use treaty for type-safe client generation
const api = treaty(app);

describe("API Endpoints", () => {
    it("GET /health should return status ok", async () => {
        const { data, error, status } = await api.health.get();

        expect(status).toBe(200);
        expect(error).toBeNull();
        expect(data).toEqual({ status: "ok" });
    });
});
