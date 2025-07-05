/**
 * Generates a CouchDB-compatible database name for a given instance ID.
 * @param instanceId The user's unique instance identifier.
 * @returns A valid CouchDB database name.
 */
export function getUserDbName(instanceId: string): string {
    // The instanceId should already be safe for use as a database name,
    // but we can add a prefix for clarity.
    return `userdb-${instanceId}`;
}
