import { Elysia, t } from "elysia";
import { IdentityService } from "../services/identity";
import { proxyRequest } from "../lib/proxy";
import { App } from "..";

export const defaultAuth = (app: App) =>
    app.group("", (group) =>
        group.get(
            "/authorize",
            async ({ query, cookie, set }) => {
                const { client_id, redirect_uri, state, code_challenge, code_challenge_method, scope, form_type, prompt } = query;

                // TODO: Implement new full-screen flow logic
                // For now, let's just proxy to the UI wizard as a starting point

                const wizardUrl = new URL("http://localhost:4000/auth/wizard");
                wizardUrl.search = new URLSearchParams(query as any).toString();

                const newRequest = new Request(wizardUrl.toString(), {
                    method: "GET",
                    headers: new Headers({
                        ...Object.fromEntries(cookie as any),
                    }),
                });

                return proxyRequest(newRequest);
            },
            {
                query: t.Object({
                    client_id: t.String(),
                    redirect_uri: t.String(),
                    response_type: t.String(),
                    scope: t.String(),
                    state: t.Optional(t.String()),
                    code_challenge: t.String(),
                    code_challenge_method: t.Optional(t.String()),
                    form_type: t.Optional(t.String()),
                    prompt: t.Optional(t.String()),
                }),
            }
        )
    );
