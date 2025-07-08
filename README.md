# The Vibe Project

Vibe is a platform for building web applications that give users control over their own data and identity. This monorepo contains the core components of the Vibe ecosystem.

## Projects

This repository is structured as a monorepo and contains the following key projects:

### Applications

-   **`apps/vibe-cloud-api`**: The central service that handles user identity, authentication, and data storage. It provides the backend for the Vibe ecosystem.
-   **`apps/test-app`**: A minimal client application used for testing and demonstrating the core features of the Vibe platform.
-   **`apps/vibe-web`**: A more feature-rich web application that serves as a second client for testing multi-app scenarios.

### Packages

-   **`packages/vibe-sdk`**: A client-side JavaScript/TypeScript library that allows developers to integrate their applications with the Vibe platform. It handles authentication, data storage, and real-time synchronization.
-   **`packages/vibe-react`**: A set of React components and hooks that simplify the integration of the `vibe-sdk` into React applications.

## Getting Started

For more detailed information about a specific project, please refer to the `README.md` file within its directory.
