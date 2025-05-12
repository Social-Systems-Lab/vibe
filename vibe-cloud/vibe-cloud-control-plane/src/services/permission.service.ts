// permission.service.ts
import { logger } from "../utils/logger";
import { APPS_COLLECTION, type App as AppModel, type PermissionSetting } from "../models/models"; // Use AppModel, PermissionSetting
import { SYSTEM_DB } from "../utils/constants";
import type { DataService } from "./data.service";
import { InternalServerError, NotFoundError } from "elysia";

export class PermissionService {
    private dataService: DataService;

    constructor(dataService: DataService) {
        this.dataService = dataService;
        logger.info("PermissionService initialized.");
    }

    /**
     * Checks if an application has the required permission FOR a specific user,
     * based on the user-specific app registration document in the 'apps' collection.
     * Treats 'ask' as denied for backend checks; the agent handles the prompt.
     */
    async canAppActForUser(userDid: string, appId: string, requiredPermission: string): Promise<boolean> {
        if (!userDid || !appId || !requiredPermission) {
            logger.debug(`canAppActForUser check failed: Missing userDid, appId, or requiredPermission.`);
            return false;
        }

        const docId = `${APPS_COLLECTION}/${userDid}/${appId}`;
        logger.debug(`canAppActForUser: Checking doc '${docId}' for permission '${requiredPermission}'`);

        try {
            const doc = await this.dataService.getDocument<AppModel>(SYSTEM_DB, docId);

            // Check if the grants object exists and the specific permission is set to 'always'
            const setting = doc?.grants?.[requiredPermission];
            const hasPermission = setting === "always";

            logger.debug(
                `App Permission check for user '${userDid}', app '${appId}', required '${requiredPermission}': Setting='${setting}', Result=${
                    hasPermission ? "GRANTED" : "DENIED"
                }`
            );
            return hasPermission;
        } catch (error) {
            if (error instanceof NotFoundError) {
                logger.debug(`App registration document '${docId}' not found. Permission denied.`);
                return false; // Document doesn't exist, so permission is denied
            }
            // Log other errors
            logger.error(
                `Error during app permission check ('canAppActForUser') for user '${userDid}', app '${appId}', required '${requiredPermission}', docId '${docId}':`,
                error
            );
            return false; // Default deny on any other error
        }
    }
}
