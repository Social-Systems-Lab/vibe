# Vibe

A self-sovereign identity (SSI) framework empowering users to own, control, and securely manage their personal data.

---

## Repository Structure

The repository is organized into three main subprojects:

### `vibe-app`

Mobile application for managing self-sovereign identities. Secure storage of private keys, credentials, and personal data. Built with **Expo/React Native**.

### `vibe-web`

Developer portal for the Vibe framework. Documentation and interactive examples. Demonstrates integration with the `vibe-sdk`. Built with **Next.js**.

### `vibe-sdk`

JavaScript/TypeScript SDK for third-party websites to interact with the Vibe app. Provides authentication, permissions handling, and data sharing functionalities.

---

## Getting Started

### Installation

Run the following command to install all dependencies for the repository and its subprojects:

```bash
npm install
```

This script:

Installs dependencies for the root project.
Installs dependencies in vibe-web, vibe-app, and vibe-sdk.

### Development

**Start the Developer Portal**
To start the developer portal (vibe-web) and watch for changes in the vibe-sdk:

```bash
npm run start-web
```

**Start the Mobile App**
Ensure that Android Studio or a compatible emulator is set up, then run:

```bash
npm run start-app
```
