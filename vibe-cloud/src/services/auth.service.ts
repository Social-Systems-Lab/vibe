import nano from "nano"; // Added import
import type { DocumentListResponse } from "nano"; // Added type import
import { dataService } from "./data.service";
import { logger } from "../utils/logger";
import { v4 as uuidv4 } from "uuid"; // Using uuid for user IDs

// Define the structure for user documents
interface UserDocument {
    _id?: string; // CouchDB ID (assigned on creation)
    _rev?: string; // CouchDB revision
    userId: string; // Our application-specific unique user ID
    email: string; // User's email (used for login)
    hashedPassword: string; // Hashed password
    type: "user"; // Document type for querying/indexing
}

// Define the exported User type (excluding sensitive fields)
export type User = Omit<UserDocument, "hashedPassword">;

const USERS_DB_NAME = "vibe_users";

export class AuthService {
    private nanoInstance: nano.ServerScope; // Store nano instance

    constructor() {
        // Initialize nano instance for the service
        const couchdbUrl = process.env.COUCHDB_URL;
        const couchdbUser = process.env.COUCHDB_USER;
        const couchdbPassword = process.env.COUCHDB_PASSWORD;

        if (!couchdbUrl || !couchdbUser || !couchdbPassword) {
            logger.error("CRITICAL: CouchDB environment variables (COUCHDB_URL, COUCHDB_USER, COUCHDB_PASSWORD) are not set for AuthService.");
            throw new Error("CouchDB environment variables not configured for AuthService.");
        }

        try {
            this.nanoInstance = nano({
                url: couchdbUrl,
                requestDefaults: {
                    auth: {
                        username: couchdbUser,
                        password: couchdbPassword,
                    },
                },
            });
        } catch (error) {
            logger.error("Failed to initialize Nano instance in AuthService:", error);
            throw new Error("Failed to initialize Nano instance in AuthService.");
        }

        // Ensure the users database exists when the service is instantiated
        this.ensureUsersDbExists().catch((err) => {
            logger.error("Failed to ensure users DB exists on AuthService startup:", err);
            // process.exit(1); // Optional: exit if DB setup fails critically
        });
    }

    private async ensureUsersDbExists(): Promise<void> {
        // Use dataService's method which uses its own nano instance
        // Or replicate the logic here using this.nanoInstance
        try {
            await this.nanoInstance.db.get(USERS_DB_NAME);
        } catch (error: any) {
            if (error.statusCode === 404) {
                await this.nanoInstance.db.create(USERS_DB_NAME);
                logger.info(`Database '${USERS_DB_NAME}' created by AuthService.`);
            } else {
                logger.error(`Error checking database '${USERS_DB_NAME}' in AuthService:`, error);
                throw error;
            }
        }
    }

    /**
     * Registers a new user.
     * @param email - User's email address.
     * @param password - User's plain text password.
     * @returns The newly created user document (excluding password).
     * @throws Error if email already exists or registration fails.
     */
    async registerUser(email: string, password: string): Promise<Omit<UserDocument, "hashedPassword">> {
        const lowerCaseEmail = email.toLowerCase(); // Use consistent casing

        // 1. Check if user already exists (by email) - Inefficient, replace with view/query later
        logger.warn("Inefficient user lookup: Fetching all users to check for existing email during registration. Replace with view/query.");
        try {
            const db = this.nanoInstance.use<UserDocument>(USERS_DB_NAME);
            const allUsersResponse: DocumentListResponse<UserDocument> = await db.list({ include_docs: true });
            const existingUser = allUsersResponse.rows
                .map((row: { doc?: UserDocument }) => row.doc)
                .find((doc: UserDocument | undefined) => doc?.type === "user" && doc.email === lowerCaseEmail);

            if (existingUser) {
                logger.warn(`Registration attempt failed: Email already exists for ${lowerCaseEmail}`);
                // Throw the specific error type our handler expects
                throw new Error(`User registration conflict for email: ${lowerCaseEmail}.`);
            }
        } catch (error: any) {
            if (error.message.includes("User registration conflict")) {
                throw error; // Re-throw the specific conflict error
            }
            // Ignore 404 if DB doesn't exist yet (should be created by ensureDbExists, but handle defensively)
            if (error.statusCode !== 404) {
                logger.error(`Error checking for existing user during registration (email: ${lowerCaseEmail}):`, error);
                throw new Error("Registration failed due to internal error during user check.");
            }
            // If 404, proceed as DB is likely empty or just created
        }

        // --- If email does not exist, proceed ---
        // Let's use email as the _id for simplicity in this iteration, assuming emails are unique identifiers.
        // Note: Using email as _id might have implications if emails can change. UUID is generally safer for primary ID.
        // We'll stick to UUID for userId and use email for lookup/login for now.

        // Check if email exists using a view or mango query (more efficient)
        // For simplicity now, we'll try inserting and catch conflict, but this isn't ideal.
        // Let's refine this: Fetch all users and check? No, inefficient.
        // Let's assume for now we can query efficiently later. We'll proceed with hashing and saving.

        // Check if user exists by trying to fetch a document with email as ID (temporary simple check)
        // This requires a specific design where email is the _id or indexed.
        // 2. Hash the password
        const hashedPassword = await Bun.password.hash(password, {
            algorithm: "bcrypt",
            cost: 10, // Standard bcrypt cost factor
        });

        // 3. Generate a unique user ID
        const userId = uuidv4();
        const userDocId = `user:${userId}`; // Use a prefix for CouchDB _id

        // 4. Prepare user document
        const newUser: Omit<UserDocument, "_id" | "_rev"> = {
            userId: userId,
            email: lowerCaseEmail, // Use the lowercased email
            hashedPassword: hashedPassword,
            type: "user",
        };

        // 5. Save user to vibe_users database
        try {
            // Use email as _id for now to enforce uniqueness simply
            // Reverting back to UUID as primary key, email just a field
            const createResponse = await dataService.createDocument(USERS_DB_NAME, "user", {
                _id: userDocId, // Explicitly set _id
                ...newUser,
            });

            if (!createResponse.ok) {
                // This check might be redundant if dataService throws on failure
                throw new Error("Failed to save user document.");
            }

            logger.info(`User registered successfully: ${email}, userId: ${userId}`);

            // 6. Create the user-specific database
            const userDbName = `userdata-${userId}`;
            await dataService.ensureDatabaseExists(userDbName);
            logger.info(`User data database created: ${userDbName}`);

            // Return user info (excluding password)
            const { hashedPassword: _, ...userInfo } = newUser;
            return { ...userInfo, _id: createResponse.id, _rev: createResponse.rev };
        } catch (error: any) {
            // Handle potential conflicts if email needs to be unique (requires index/view later)
            // 409 conflict on _id should ideally not happen now with UUIDs, but handle defensively
            if (error.statusCode === 409) {
                logger.error(`Registration attempt failed: Document conflict for ID ${userDocId} (email: ${lowerCaseEmail})`, error);
                throw new Error(`User registration failed due to document ID conflict.`); // More specific error
            }
            logger.error(`Error saving user document during registration for ${lowerCaseEmail}:`, error);
            throw new Error(`User registration failed for email: ${lowerCaseEmail}.`);
        }
    }

    /**
     * Logs in a user.
     * @param email - User's email address.
     * @param password - User's plain text password.
     * @returns The user document (excluding password) if login is successful.
     * @throws Error if login fails (user not found, wrong password).
     */
    async loginUser(email: string, password: string): Promise<Omit<UserDocument, "hashedPassword">> {
        // 1. Find user by email
        // This requires an efficient lookup, ideally using a CouchDB view or Mango query.
        // For now, we'll simulate this. A real implementation MUST use views/queries.
        // Placeholder: Fetching by a known ID pattern if we used email in _id, or querying.
        // Let's assume we have a way to get the userDocId based on email.
        // Since we don't have views yet, this part is tricky.
        // **Compromise for Iteration 3:** We'll fetch *all* users and filter. THIS IS INEFFICIENT AND MUST BE REPLACED.
        logger.warn("Inefficient user lookup: Fetching all users to find by email. Replace with view/query.");
        let foundUser: (UserDocument & { _id: string; _rev: string }) | null = null;
        try {
            const db = this.nanoInstance.use<UserDocument>(USERS_DB_NAME);
            // Explicitly type the response if needed, though nano types should infer it
            const allUsersResponse: DocumentListResponse<UserDocument> = await db.list({ include_docs: true });
            // Add types for row and doc
            const potentialUser = allUsersResponse.rows
                .map((row: { doc?: UserDocument }) => row.doc)
                .find((doc: UserDocument | undefined) => doc?.type === "user" && doc.email === email.toLowerCase());

            if (potentialUser && potentialUser._id && potentialUser._rev) {
                // Cast remains necessary here as TS doesn't know _id/_rev are definitely present after find
                foundUser = potentialUser as UserDocument & { _id: string; _rev: string };
            }
        } catch (error: any) {
            if (error.statusCode !== 404) {
                // Ignore DB not found if it happens here
                logger.error(`Error fetching users for login check (email: ${email}):`, error);
                throw new Error("Login failed due to internal error during user lookup.");
            }
        }

        if (!foundUser) {
            logger.warn(`Login attempt failed: User not found for email: ${email}`);
            throw new Error("Invalid email or password.");
        }

        // 2. Verify password
        const isPasswordValid = await Bun.password.verify(password, foundUser.hashedPassword);

        if (!isPasswordValid) {
            logger.warn(`Login attempt failed: Invalid password for email: ${email}`);
            throw new Error("Invalid email or password.");
        }

        logger.info(`User logged in successfully: ${email}, userId: ${foundUser.userId}`);

        // 3. Return user info (excluding password)
        const { hashedPassword, ...userInfo } = foundUser;
        return userInfo;
    }

    /**
     * Deletes a user and their associated data database.
     * Primarily intended for testing/cleanup. Use with caution in production.
     * @param userId - The application-specific unique ID of the user to delete.
     */
    async deleteUser(userId: string): Promise<void> {
        logger.info(`Attempting to delete user with userId: ${userId}`);
        const userDocId = `user:${userId}`;
        const userDbName = `userdata-${userId}`;

        // 1. Delete the user document from USERS_DB_NAME
        try {
            const usersDb = this.nanoInstance.use<UserDocument>(USERS_DB_NAME);
            // Need to get the revision first
            const userDoc = await usersDb.get(userDocId);
            await usersDb.destroy(userDocId, userDoc._rev);
            logger.info(`Successfully deleted user document '${userDocId}' from '${USERS_DB_NAME}'.`);
        } catch (error: any) {
            if (error.statusCode === 404) {
                logger.warn(`User document '${userDocId}' not found in '${USERS_DB_NAME}' during deletion (might already be deleted).`);
            } else {
                // Log other errors but proceed to try deleting the data DB
                logger.error(`Error deleting user document '${userDocId}' from '${USERS_DB_NAME}':`, error.message || error);
            }
        }

        // 2. Delete the user's data database
        try {
            await this.nanoInstance.db.destroy(userDbName);
            logger.info(`Successfully deleted user data database '${userDbName}'.`);
        } catch (error: any) {
            if (error.statusCode === 404) {
                logger.warn(`User data database '${userDbName}' not found during deletion (might already be deleted).`);
            } else {
                logger.error(`Error deleting user data database '${userDbName}':`, error.message || error);
            }
        }
    }
}

// Export a singleton instance
export const authService = new AuthService();
