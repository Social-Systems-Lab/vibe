import { User } from "vibe-core";
import { generatePkce } from "./strategies/standalone";

export type SessionState = {
    status: "LOGGED_IN" | "LOGGED_OUT" | "ONE_TAP_REQUIRED" | "SILENT_LOGIN_SUCCESS";
    code?: string;
    user?: User;
};

export class SessionManager {
    private config: {
        clientId: string;
        redirectUri: string;
        apiUrl: string;
        authFlow?: "onetap" | "default";
    };

    constructor(config: { clientId: string; redirectUri: string; apiUrl: string; authFlow?: "onetap" | "default" }) {
        this.config = config;
    }

    async checkSession(): Promise<SessionState> {
        return new Promise(async (resolve) => {
            const pkce = await generatePkce();
            sessionStorage.setItem("vibe_pkce_verifier", pkce.verifier);

            const params = new URLSearchParams({
                client_id: this.config.clientId,
                redirect_uri: this.config.redirectUri,
                code_challenge: pkce.challenge,
                code_challenge_method: "S256",
            });

            const sessionCheckPath = this.config.authFlow === "default" ? "/auth/session-check" : "/auth/onetap/session-check";
            const iframe = document.createElement("iframe");
            iframe.style.display = "none";
            iframe.src = `${this.config.apiUrl}${sessionCheckPath}?${params.toString()}`;
            document.body.appendChild(iframe);

            const messageListener = (event: MessageEvent) => {
                if (event.source !== iframe.contentWindow) {
                    return;
                }

                // Clean up
                window.removeEventListener("message", messageListener);
                document.body.removeChild(iframe);

                console.log("Session check completed", event.data);
                resolve(event.data as SessionState);
            };

            window.addEventListener("message", messageListener);
        });
    }
}
