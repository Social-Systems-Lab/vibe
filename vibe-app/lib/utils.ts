    // Helper function to get a name that can be used for database and directory names from a DID
    export const getDirNameFromDid = (did: string): string => {
        return did.toLowerCase().replace(/[^a-z0-9_$()+/-]/g, "");
    }