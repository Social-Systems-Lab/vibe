import * as Constants from "./constants";
import * as Types from "./types";

// --- Token Management Utility Functions ---

export async function storeCpTokens(did: string, tokenDetails: Types.TokenDetails): Promise<void> {
    const accessTokenKey = `${Constants.SESSION_STORAGE_CP_ACCESS_TOKEN_PREFIX}${did}`;
    const accessTokenExpiresAtKey = `${Constants.SESSION_STORAGE_CP_ACCESS_TOKEN_EXPIRES_AT_PREFIX}${did}`;
    const refreshTokenKey = `${Constants.LOCAL_STORAGE_CP_REFRESH_TOKEN_PREFIX}${did}`;
    const refreshTokenExpiresAtKey = `${Constants.LOCAL_STORAGE_CP_REFRESH_TOKEN_EXPIRES_AT_PREFIX}${did}`;

    await chrome.storage.session.set({
        [accessTokenKey]: tokenDetails.accessToken,
        [accessTokenExpiresAtKey]: tokenDetails.accessTokenExpiresIn,
    });
    await chrome.storage.local.set({
        [refreshTokenKey]: tokenDetails.refreshToken,
        [refreshTokenExpiresAtKey]: tokenDetails.refreshTokenExpiresAt,
    });
    console.info(`Stored CP tokens for DID: ${did}`);
}

export async function clearCpTokens(did: string): Promise<void> {
    const accessTokenKey = `${Constants.SESSION_STORAGE_CP_ACCESS_TOKEN_PREFIX}${did}`;
    const accessTokenExpiresAtKey = `${Constants.SESSION_STORAGE_CP_ACCESS_TOKEN_EXPIRES_AT_PREFIX}${did}`;
    const refreshTokenKey = `${Constants.LOCAL_STORAGE_CP_REFRESH_TOKEN_PREFIX}${did}`;
    const refreshTokenExpiresAtKey = `${Constants.LOCAL_STORAGE_CP_REFRESH_TOKEN_EXPIRES_AT_PREFIX}${did}`;

    await chrome.storage.session.remove([accessTokenKey, accessTokenExpiresAtKey]);
    await chrome.storage.local.remove([refreshTokenKey, refreshTokenExpiresAtKey]);
    console.info(`Cleared CP tokens for DID: ${did}`);
}

export async function getValidCpAccessToken(did: string): Promise<string> {
    const nowSeconds = Math.floor(Date.now() / 1000);

    // 1. Try session access token
    const accessTokenKey = `${Constants.SESSION_STORAGE_CP_ACCESS_TOKEN_PREFIX}${did}`;
    const accessTokenExpiresAtKey = `${Constants.SESSION_STORAGE_CP_ACCESS_TOKEN_EXPIRES_AT_PREFIX}${did}`;
    const sessionData = await chrome.storage.session.get([accessTokenKey, accessTokenExpiresAtKey]);
    const sessionAccessToken = sessionData[accessTokenKey];
    const sessionAccessTokenExpiresAt = sessionData[accessTokenExpiresAtKey];

    if (sessionAccessToken && sessionAccessTokenExpiresAt && sessionAccessTokenExpiresAt > nowSeconds) {
        console.debug(`Using valid session CP access token for DID: ${did}`);
        return sessionAccessToken;
    }

    // 2. Try using refresh token from local storage
    const refreshTokenKey = `${Constants.LOCAL_STORAGE_CP_REFRESH_TOKEN_PREFIX}${did}`;
    const refreshTokenExpiresAtKey = `${Constants.LOCAL_STORAGE_CP_REFRESH_TOKEN_EXPIRES_AT_PREFIX}${did}`;
    const localData = await chrome.storage.local.get([refreshTokenKey, refreshTokenExpiresAtKey]);
    const storedRefreshToken = localData[refreshTokenKey];
    const storedRefreshTokenExpiresAt = localData[refreshTokenExpiresAtKey];

    if (storedRefreshToken && storedRefreshTokenExpiresAt && storedRefreshTokenExpiresAt > nowSeconds) {
        console.info(`Session CP access token missing or expired for ${did}. Attempting refresh...`);
        try {
            const refreshResponse = await fetch(`${Constants.OFFICIAL_VIBE_CLOUD_URL}/api/v1/auth/refresh`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ refreshToken: storedRefreshToken }),
            });

            if (!refreshResponse.ok) {
                const errorBody = await refreshResponse.json().catch(() => ({ error: "Refresh failed with status: " + refreshResponse.status }));
                console.warn(`CP token refresh failed for ${did}: ${refreshResponse.status}, ${errorBody.error}`);
                if (refreshResponse.status === 401) {
                    // Unauthorized, refresh token likely invalid/revoked
                    await clearCpTokens(did); // Clear out bad tokens
                    throw new Error(`FULL_LOGIN_REQUIRED: Refresh token invalid for ${did}.`);
                }
                throw new Error(errorBody.error || `Token refresh failed: ${refreshResponse.status}`);
            }

            const newTokenDetails = (await refreshResponse.json()) as Types.TokenDetails;
            await storeCpTokens(did, newTokenDetails);
            console.info(`CP token refreshed successfully for DID: ${did}`);
            return newTokenDetails.accessToken;
        } catch (error: any) {
            console.error(`Error during token refresh for ${did}:`, error);
            if (error.message.startsWith("FULL_LOGIN_REQUIRED")) throw error; // Re-throw specific error
            throw new Error(`Token refresh process failed for ${did}: ${error.message}`);
        }
    }

    // 3. No valid session token, no valid refresh token
    console.warn(`No valid CP session or refresh token for DID: ${did}. Full login required.`);
    throw new Error(`FULL_LOGIN_REQUIRED: No valid tokens for ${did}.`);
}
