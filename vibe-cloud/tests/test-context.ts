// tests/test‑context.ts
import { treaty } from "@elysiajs/eden";
import { app } from "../src/index";
import { authService } from "../src/services/auth.service";
import { permissionService } from "../src/services/permission.service";

export interface TestCtx {
    api: ReturnType<typeof treaty>;
    userId: string;
    token: string;
    permsRev: string;
    ts: number;
    email: string;
    password: string;
}

/** create a *fresh* user + jwt for *one* test file */
export async function createTestCtx(): Promise<{
    ctx: TestCtx;
    cleanup: () => Promise<void>;
}> {
    const api = treaty(app);
    const ts = Date.now();
    const email = `test_${ts}@example.com`;
    const password = `pass_${ts}`;

    // register + login
    const reg = await api.api.v1.auth.register.post({ email, password });
    const login = await api.api.v1.auth.login.post({ email, password });

    const { rev } = await permissionService.setPermissions(reg.data!.userId, []);

    const ctx: TestCtx = {
        api,
        userId: reg.data!.userId,
        token: login.data!.token,
        permsRev: rev,
        ts,
        email,
        password,
    };

    async function cleanup() {
        await permissionService.deletePermissions(ctx.userId);
        await authService.deleteUser(ctx.userId);
    }

    return { ctx, cleanup };
}
