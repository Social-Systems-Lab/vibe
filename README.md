# The Vibe Project

Vibe is a platform for building web applications that give users control over their own data and identity. This monorepo contains the core components of the Vibe ecosystem.

## Projects

This repository is structured as a monorepo and contains the following key projects:

### Applications

-   **`apps/vibe-cloud-api`**: The central service that handles user identity, authentication, and data storage. It provides the backend for the Vibe ecosystem.
-   **`apps/vibe-cloud-ui`**: Contains rich UI for auth flows.
-   **`apps/vibe-feeds`**: A social media feeds client application used for testing and demonstrating the core features of the Vibe platform.

### Packages

-   **`packages/vibe-core`**: A package containing shared types and core utility functions, including cryptography and DID management.
-   **`packages/vibe-sdk`**: A client-side JavaScript/TypeScript library that allows developers to integrate their applications with the Vibe platform. It handles authentication, data storage, and real-time synchronization.
-   **`packages/vibe-react`**: A set of React components and hooks that simplify the integration of the `vibe-sdk` into React applications.

## Getting Started

To get started with local development, follow these steps:

1.  **Start the required services:**

    We use Docker to run CouchDB and Minio. To start them, run the following command from the `infra/selfhost` directory:

    ```bash
    docker-compose up -d minio couchdb couchdb-setup
    ```

2.  **Install dependencies:**

    This project uses `pnpm` for package management. To install all dependencies, run the following command from the root of the repository:

    ```bash
    pnpm install
    ```

3.  **Build the project:**

    To build all the packages and applications, run the following command from the root of the repository:

    ```bash
    pnpm build
    ```

4.  **Run the development servers:**

    To start the development servers for all applications, run the following command from the root of the repository:

    ```bash
    pnpm dev
    ```

For more detailed information about a specific project, please refer to the `README.md` file within its directory.
