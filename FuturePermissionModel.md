# Vibe Permission Model v2: Specification

This document outlines a future, more advanced permission model for the Vibe ecosystem, based on user groups and application trust levels. It aims to provide a more intuitive and powerful way for users to control access to their data.

## 1. Core Concepts

### 1.1. User Groups

-   Users can create and manage groups of other Vibe users.
-   Default groups could include "Everyone", "Friends", "Family", "Followers".
-   Groups are managed within the user's Vibe Agent and stored in their Vibe Cloud.

### 1.2. Resource-Level Permissions

-   Example: A blog post might have `read` access for "Everyone" and `write` access for the owner. A private photo might have `read` access for "Family" only.

### 1.3. App Trust Levels

-   Instead of granting specific permissions (e.g., `read:posts`), users will assign a "trust level" to each application.
-   Trust levels could be simple, like "Public", "Trusted", or "Admin".
-   Each trust level corresponds to a set of user groups. For example:
    -   **Public**: Can act as a member of the "Everyone" group.
    -   **Trusted**: Can act as a member of the "Friends" and "Followers" groups.
    -   **Admin**: Can act as the user themselves, with access to all resources.

## 2. User Experience

-   **Granting App Access**: When a user authorizes a new app, the Vibe Agent will ask them to assign a trust level, with a clear explanation of what each level means (e.g., "Allow this app to see what your friends can see").
-   **Creating Content**: When a user creates a new document or uploads a file, the UI will provide a simple way to set its visibility (e.g., a dropdown with "Public", "Friends only", "Private"). This will translate to setting the appropriate user group in the resource's ACL.
-   **Managing Groups**: The Vibe Agent will have a dedicated section for managing user groups, allowing users to add or remove members.

## 3. Developer Experience

-   **Simplified Manifest**: The app manifest will no longer need to list dozens of specific permissions. Instead, it might declare the _maximum trust level_ it requires to function.
-   **Transparent Access**: When an app calls `vibe.read("posts")`, the backend will automatically filter the results based on the app's trust level and the user's group memberships. The app developer doesn't need to know the details of the permission evaluation.

## 4. High-Level Architecture

-   **Groups Service**: A new service in the `vibe-cloud-api` will be needed to manage group memberships and resolve group queries.
-   **Data Model Changes**:
    -   A new `groups` collection will be added to each user's database.
    -   Every data document and blob metadata document will need a new `acl` field.
-   **Permission Service v2**: The existing `PermissionService` will be significantly refactored to implement the new trust level and group-based evaluation logic.
-   **Vibe Agent UI**: New UI components will be required for managing trust levels and user groups.

This model represents a significant step forward in user-centric data control and would be a major undertaking. This document serves as a starting point for that future project.
