# Vibe

Vibe is more than just an app—it's a movement towards true digital freedom. We're building a future where users own their data, control their digital identity, and move seamlessly between apps and services without barriers.

## Repository Structure

The repository is organized into these projects:

### `vibe-app`

Mobile application for managing self-sovereign identities. Secure storage of private keys, credentials, and personal data. Built with **Expo/React Native**.

### `vibe-web`

Website for the Vibe platform. Documentation and interactive examples. Demonstrates integration with the `vibe-sdk`. Built with **Next.js**.

### `vibe-sdk`

JavaScript/TypeScript SDK for third-party websites to interact with the Vibe app. Provides authentication, permissions handling, data access and data sharing functionalities.

### `apps/*`

Web applications integrating with the Vibe app through the Vibe SDK. Built using **Vite + React**.



## Getting Started

### Installation

Run the following command to install all dependencies for the repository and its subprojects:

```bash
npm install
```

### Development

**Start the Mobile App**

Ensure that Android Studio or a compatible emulator is set up, then run:

```bash
npm run start-vibe-app
```

**Start the Web Apps**

First build and watch the vibe SDK (vibe-sdk):

```bash
npm run watch-vibe-sdk
```

Then run any of the web apps.

**vibe-web:**

```bash
npm run start-vibe-web
```

**apps:**

```bash
npm run start-app-<appname>
```
