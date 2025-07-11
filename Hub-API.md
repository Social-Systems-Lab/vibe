# Hub-Client API Contract

This document defines the `postMessage` API for communication between the Vibe SDK (`HubStrategy`) and the central hub iframe.

## 1. Initialization

### Client -> Hub: `INIT`

The client sends this message to initiate a connection with the hub.

-   **`type`**: `"INIT"`
-   **`payload`**:
    -   `origin`: The origin of the client application (e.g. `https://my-app.com`).
    -   `user`: The current user object, if available.
-   **`port`**: A `MessagePort` for dedicated, secure communication.

### Hub -> Client: `INIT_ACK`

The hub sends this message to acknowledge a successful initialization.

-   **`type`**: `"INIT_ACK"`

### Hub -> Client: `INIT_FAIL`

The hub sends this message if initialization fails.

-   **`type`**: `"INIT_FAIL"`
-   **`payload`**:
    -   `error`: A string describing the reason for failure.

## 2. Authentication

### Client -> Hub: `AUTH_LOGIN`

The client sends this message to request that the hub initiate the login flow.

-   **`type`**: `"AUTH_LOGIN"`

### Client -> Hub: `AUTH_LOGOUT`

The client sends this message to request that the hub log the user out.

-   **`type`**: `"AUTH_LOGOUT"`

### Client -> Hub: `AUTH_SIGNUP`

The client sends this message to request that the hub initiate the signup flow.

-   **`type`**: `"AUTH_SIGNUP"`

### Hub -> Client: `AUTH_STATE_CHANGE`

The hub sends this message whenever the user's authentication state changes.

-   **`type`**: `"AUTH_STATE_CHANGE"`
-   **`payload`**:
    -   `isLoggedIn`: A boolean indicating if the user is logged in.
    -   `user`: The user object if logged in, otherwise `null`.

## 3. Data Operations

### Client -> Hub: `DB_READ_ONCE`

-   **`type`**: `"DB_READ_ONCE"`
-   **`payload`**:
    -   `collection`: The name of the collection to query.
    -   `filter`: The PouchDB `find` selector.
-   **`nonce`**: A unique identifier for the request.

### Client -> Hub: `DB_WRITE`

-   **`type`**: `"DB_WRITE"`
-   **`payload`**:
    -   `collection`: The name of the collection.
    -   `data`: The document to write.
-   **`nonce`**: A unique identifier for the request.

### Client -> Hub: `DB_REMOVE`

-   **`type`**: `"DB_REMOVE"`
-   **`payload`**:
    -   `collection`: The name of the collection.
    -   `data`: The document to remove.
-   **`nonce`**: A unique identifier for the request.

### Hub -> Client: `DB_ACK`

The hub sends this in response to `DB_READ_ONCE`, `DB_WRITE`, and `DB_REMOVE`.

-   **`type`**: `"DB_ACK"`
-   **`payload`**:
    -   `success`: A boolean indicating if the operation was successful.
    -   `data`: The result of the operation (e.g., the documents from a read).
    -   `error`: A string describing the reason for failure.
-   **`nonce`**: The nonce from the original request.

## 4. Real-Time Subscriptions

### Client -> Hub: `DB_SUBSCRIBE`

-   **`type`**: `"DB_SUBSCRIBE"`
-   **`payload`**:
    -   `collection`: The name of the collection to subscribe to.
    -   `filter`: The PouchDB `find` selector.
-   **`subscriptionId`**: A unique identifier for the subscription.

### Client -> Hub: `DB_UNSUBSCRIBE`

-   **`type`**: `"DB_UNSUBSCRIBE"`
-   **`payload`**:
    -   `subscriptionId`: The ID of the subscription to cancel.

### Hub -> Client: `DB_UPDATE`

The hub sends this whenever there is new data for an active subscription.

-   **`type`**: `"DB_UPDATE"`
-   **`payload`**:
    -   `data`: The updated data that matches the subscription's filter.
-   **`subscriptionId`**: The ID of the relevant subscription.
