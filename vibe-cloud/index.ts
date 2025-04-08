import { Elysia, t } from 'elysia'; // Import Elysia and t for validation
import { staticPlugin } from '@elysiajs/static';
import {
    generateRegistrationOptions,
    verifyRegistrationResponse,
    generateAuthenticationOptions,
    verifyAuthenticationResponse,
} from '@simplewebauthn/server';
import type {
    GenerateRegistrationOptionsOpts,
    GenerateAuthenticationOptionsOpts,
    VerifyRegistrationResponseOpts,
    VerifyAuthenticationResponseOpts,
    VerifiedRegistrationResponse,
    VerifiedAuthenticationResponse,
    RegistrationResponseJSON,
    AuthenticationResponseJSON,
    AuthenticatorTransportFuture,
} from '@simplewebauthn/server';

// Define custom type for stored authenticator data
interface StoredAuthenticator {
    credentialID: Uint8Array;
    credentialPublicKey: Uint8Array;
    counter: number;
    transports?: AuthenticatorTransportFuture[];
}

// Types for our simple in-memory store
interface User {
    id: string; // Store as base64url string
    username: string;
    authenticators: StoredAuthenticator[]; // Use our custom type
}

interface StoredChallenge {
    challenge: string;
    userId?: string; // Store userId during registration to link authenticator later
}

// --- Configuration (Replace with your actual details) ---
const rpID = 'localhost'; // Relying Party ID - Must match the domain name in the browser URL
const rpName = 'Vibe Cloud Prototype';
const expectedOrigin = `http://${rpID}:3000`; // Expected origin of the request

// --- In-Memory Storage (Replace with Database later) ---
const userStore: Map<string, User> = new Map();
const challengeStore: Map<string, StoredChallenge> = new Map(); // Store challenges temporarily

// Helper to generate user ID
function generateUserID(): string {
    return Buffer.from(crypto.getRandomValues(new Uint8Array(16))).toString('base64url');
}

// Helper to manage challenges
function storeChallenge(challenge: string, userId?: string): string {
    const id = crypto.randomUUID();
    challengeStore.set(id, { challenge, userId });
    // Simple cleanup after 5 mins
    setTimeout(() => challengeStore.delete(id), 5 * 60 * 1000);
    return id; // Return an ID to retrieve the challenge later if needed (though often embedded)
}

function getChallenge(id: string): StoredChallenge | undefined {
    return challengeStore.get(id);
}

console.log(`Server starting with RP ID: ${rpID} and Expected Origin: ${expectedOrigin}`);

const app = new Elysia()
    // --- Static File Serving ---
    .use(staticPlugin({ // Serve index.html and client.js from public
        prefix: '/',
        assets: 'public',
        // Serve index.html at root
        indexHTML: true,
    }))
    .use(staticPlugin({ // Serve node_modules directory
        prefix: '/node_modules', // Mount the entire node_modules at /node_modules URL path
        assets: 'node_modules', // Serve from the local node_modules directory
        noCache: true, // Good for development
    }))
    // --- API Endpoints ---
    .post('/generate-registration-options', async ({ body, set }) => {
        const { username } = body;
        if (!username) {
            set.status = 400;
            return { error: 'Username is required' };
        }

        try {
            const existingUser = Array.from(userStore.values()).find(u => u.username === username);
            // Allow adding more authenticators for now

            const userID = existingUser?.id ?? generateUserID();
            const user: User = existingUser ?? { id: userID, username, authenticators: [] };
            if (!existingUser) {
                userStore.set(userID, user);
                console.log(`New user created (in memory): ${username} (ID: ${userID})`);
            }

            const opts: GenerateRegistrationOptionsOpts = {
                rpName,
                rpID,
                userID: Buffer.from(user.id, 'base64url'),
                userName: user.username,
                excludeCredentials: user.authenticators.map((auth: StoredAuthenticator) => ({
                    id: Buffer.from(auth.credentialID).toString('base64url'),
                    type: 'public-key',
                    transports: auth.transports,
                })),
                authenticatorSelection: {
                    residentKey: 'preferred',
                    userVerification: 'preferred',
                },
                attestationType: 'none',
            };

            const options = await generateRegistrationOptions(opts);
            storeChallenge(options.challenge, user.id);
            console.log(`Generated registration options for ${username}`, options);
            return options; // Elysia automatically stringifies JSON

        } catch (error: any) {
            console.error("Error generating registration options:", error);
            set.status = 500;
            return { error: error.message || 'Internal Server Error' };
        }
    }, { // Add basic body validation
        body: t.Object({
            username: t.String()
        })
    })
    .post('/verify-registration', async ({ body, set }) => {
        const { username, attestationResponse } = body;
        if (!username || !attestationResponse) {
            set.status = 400;
            return { error: 'Missing username or attestationResponse' };
        }

        try {
            const user = Array.from(userStore.values()).find(u => u.username === username);
            if (!user) {
                set.status = 404; // Not Found
                return { error: `User ${username} not found during registration verification` };
            }

            const storedChallengeEntry = Array.from(challengeStore.entries()).find(([id, entry]) => entry.userId === user.id);
            if (!storedChallengeEntry) {
                set.status = 400;
                return { error: 'Could not find challenge for this registration attempt' };
            }
            const expectedChallenge = storedChallengeEntry[1].challenge;
            challengeStore.delete(storedChallengeEntry[0]);

            const verificationOpts: VerifyRegistrationResponseOpts = {
                response: attestationResponse,
                expectedChallenge: expectedChallenge,
                expectedOrigin,
                expectedRPID: rpID,
                requireUserVerification: true,
            };

            const verification = await verifyRegistrationResponse(verificationOpts);

            if (verification.verified && verification.registrationInfo) {
                const regInfo: any = verification.registrationInfo;
                const credentialPublicKey = regInfo.credentialPublicKey as Uint8Array;
                const credentialID = regInfo.credentialID as Uint8Array;
                const counter = regInfo.counter as number;

                const newCredentialIDBuffer = Buffer.from(credentialID);
                const existingAuthenticator = user.authenticators.find(
                    (auth: StoredAuthenticator) => Buffer.from(auth.credentialID).equals(newCredentialIDBuffer)
                );

                if (!existingAuthenticator) {
                    const newAuthenticator: StoredAuthenticator = {
                        credentialID: newCredentialIDBuffer,
                        credentialPublicKey: Buffer.from(credentialPublicKey),
                        counter,
                        transports: attestationResponse.response.transports || [],
                    };
                    user.authenticators.push(newAuthenticator);
                    userStore.set(user.id, user);
                    console.log(`Authenticator added for ${username}:`, newAuthenticator);
                } else {
                    console.log(`Authenticator already exists for ${username}:`, credentialID);
                }
                return { verified: true };
            } else {
                set.status = 400;
                return { verified: false, error: 'Verification failed' };
            }
        } catch (error: any) {
            console.error("Verification Error:", error);
            set.status = 400; // Often client-side errors during verification
            return { error: error.message };
        }
    }, { // Add basic body validation
        body: t.Object({
            username: t.String(),
            attestationResponse: t.Any() // Keep 'any' for complex object
        })
    })
    .post('/generate-authentication-options', async ({ body, set }) => {
        const { username } = body; // Optional username

        try {
            let allowCredentials: { id: string; type: 'public-key'; transports?: AuthenticatorTransportFuture[] }[] | undefined = undefined;

            if (username) {
                const user = Array.from(userStore.values()).find(u => u.username === username);
                if (user) {
                    allowCredentials = user.authenticators.map((auth: StoredAuthenticator) => ({
                        id: Buffer.from(auth.credentialID).toString('base64url'),
                        type: 'public-key',
                        transports: auth.transports,
                    }));
                    console.log(`Generating auth options for known user ${username}`);
                } else {
                    console.log(`Generating auth options, but user ${username} not found. Allowing any credential.`);
                }
            } else {
                console.log("Generating auth options without username (allow any discoverable credential)");
            }

            const opts: GenerateAuthenticationOptionsOpts = {
                rpID,
                allowCredentials,
                userVerification: 'preferred',
            };

            const options = await generateAuthenticationOptions(opts);
            storeChallenge(options.challenge); // Store challenge without user ID for auth
            console.log("Generated authentication options:", options);
            return options;

        } catch (error: any) {
            console.error("Error generating authentication options:", error);
            set.status = 500;
            return { error: error.message || 'Internal Server Error' };
        }
    }, { // Add basic body validation
        body: t.Object({
            username: t.Optional(t.String()) // Username is optional
        })
    })
    .post('/verify-authentication', async ({ body, set }) => {
        const { assertionResponse } = body;
        if (!assertionResponse) {
            set.status = 400;
            return { error: 'Missing assertionResponse' };
        }

        try {
            const storedChallengeEntry = Array.from(challengeStore.entries()).find(([id, entry]) => !entry.userId);
            if (!storedChallengeEntry) {
                set.status = 400;
                return { error: 'Could not find challenge for this authentication attempt' };
            }
            const expectedChallenge = storedChallengeEntry[1].challenge;
            challengeStore.delete(storedChallengeEntry[0]);

            const credentialIDFromResponse = assertionResponse.id;
            let user: User | undefined;
            let authenticator: StoredAuthenticator | undefined;

            for (const u of userStore.values()) {
                authenticator = u.authenticators.find(
                    (auth: StoredAuthenticator) => Buffer.from(auth.credentialID).toString('base64url') === credentialIDFromResponse
                );
                if (authenticator) {
                    user = u;
                    break;
                }
            }

            if (!authenticator || !user) {
                set.status = 404; // Not Found
                return { error: `Could not find authenticator with ID ${credentialIDFromResponse}` };
            }

            const verificationOpts = {
                response: assertionResponse,
                expectedChallenge: expectedChallenge,
                expectedOrigin,
                expectedRPID: rpID,
                credentialID: authenticator.credentialID,
                credentialPublicKey: authenticator.credentialPublicKey,
                counter: authenticator.counter,
                transports: authenticator.transports,
                requireUserVerification: true,
            };

            const verification = await verifyAuthenticationResponse(verificationOpts as any); // Keep 'as any' due to persistent TS issues

            if (verification.verified) {
                authenticator.counter = verification.authenticationInfo.newCounter;
                console.log(`Authentication successful for user ${user.username} with counter ${authenticator.counter}`);
                // In a real app, create a session (e.g., using JWT or cookies)
                return { verified: true, user: { username: user.username /* Don't send full authenticator details back */ } };
            } else {
                set.status = 400;
                return { verified: false, error: 'Authentication verification failed' };
            }
        } catch (error: any) {
            console.error("Verification Error:", error);
            set.status = 400; // Often client-side errors during verification
            return { error: error.message };
        }
    }, { // Add basic body validation
        body: t.Object({
            assertionResponse: t.Any() // Keep 'any' for complex object
        })
    })
    .onError(({ code, error, set }) => { // Global error handler
        // Safely access error message
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error(`Elysia Error [${code}]: ${errorMessage}`);
        // Basic error mapping
        if (code === 'VALIDATION') {
            set.status = 400;
            return { error: 'Validation Error', details: error.message };
        }
        if (code === 'NOT_FOUND') {
            set.status = 404;
            return { error: 'Not Found' };
        }
        set.status = 500;
        return { error: 'Internal Server Error' };
    })
    .listen(3000);

console.log(
    `🦊 Elysia is running at http://${app.server?.hostname}:${app.server?.port}`
);
