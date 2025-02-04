# Vibe

Vibe is more than just an app—it's a movement towards true digital freedom. We're building a future where users own their data, control their digital identity, and move seamlessly between apps and services without barriers.

## Repository Structure

The repository is organized into three main subprojects:

### `vibe-app`

Mobile application for managing self-sovereign identities. Secure storage of private keys, credentials, and personal data. Built with **Expo/React Native**.

### `vibe-web`

Website for the Vibe platform. Documentation and interactive examples. Demonstrates integration with the `vibe-sdk`. Built with **Next.js**.

### `vibe-sdk`

JavaScript/TypeScript SDK for third-party websites to interact with the Vibe app. Provides authentication, permissions handling, and data sharing functionalities.

## Getting Started

### Installation

Run the following command to install all dependencies for the repository and its subprojects:

```bash
npm install
```

### Development

**Start the Website**

To start the website (vibe-web) and watch for changes in the vibe-sdk:

```bash
npm run start-web
```

**Start the Mobile App**

Ensure that Android Studio or a compatible emulator is set up, then run:

```bash
npm run start-app
```
