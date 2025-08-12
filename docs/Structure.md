# Project Structure

This document outlines the structure of the Vibe monorepo, including all applications and packages, along with their configurations.

## Overall Project Structure

```
.
├── apps
│  ├── vibe-cloud-api
│  ├── vibe-cloud-ui
│  ├── vibe-collections
│  └── vibe-feeds
├── docs
├── infra
│  ├── helm
│  └── selfhost
├── packages
│  ├── vibe-core
│  ├── vibe-react
│  └── vibe-sdk
├── .github
└── .vscode
```

## Workspace Configuration

The `pnpm` workspace is configured in `pnpm-workspace.yaml`:

```yaml
packages:
    - "apps/*"
    - "packages/*"
    - "infra"
```

## Applications

This section describes the applications in the `apps` directory.

### `vibe-cloud-ui`

**Type:** Next.js Application

This is the main user interface for Vibe Cloud.

**Folder Structure**

```
.
├── app
│  ├── app-grid
│  │  └── page.tsx
│  ├── auth
│  │  ├── consent
│  │  │  └── page.tsx
│  │  ├── login
│  │  │  └── page.tsx
│  │  ├── profile
│  │  │  └── page.tsx
│  │  ├── signup
│  │  │  └── page.tsx
│  │  └── wizard
│  │      └── page.tsx
│  ├── favicon.ico
│  ├── globals.css
│  ├── layout.tsx
│  └── page.tsx
├── public
│  └── images
│     └── vibe.png
├── .dockerignore
├── .gitignore
├── Dockerfile
├── next.config.ts
├── package.json
├── postcss.config.mjs
├── README.md
└── tsconfig.json
```

**`package.json`**

```json
{
    "name": "vibe-cloud-ui",
    "version": "0.1.1",
    "private": true,
    "scripts": {
        "dev": "next dev -p 4000 --turbopack",
        "build": "next build --turbopack",
        "start": "next start",
        "lint": "next lint"
    },
    "dependencies": {
        "lucide-react": "^0.516.0",
        "next": "^15.4.3",
        "react": "19.1.0",
        "react-dom": "19.1.0",
        "vibe-react": "workspace:*",
        "vibe-sdk": "workspace:*"
    },
    "devDependencies": {
        "typescript": "^5",
        "@types/node": "^20",
        "@types/react": "^19",
        "@types/react-dom": "^19",
        "@tailwindcss/postcss": "^4",
        "tailwindcss": "^4",
        "tailwindcss-animate": "^1.0.7"
    }
}
```

### `vibe-cloud-api`

**Type:** ElysiaJS API

This is the backend API for Vibe Cloud.

**Folder Structure**

```
.
├── public
│  ├── hub.html
│  ├── password-prompt.html
│  └── shared-worker.js
├── src
│  ├── lib
│  │  ├── db.ts
│  │  ├── did.ts
│  │  └── proxy.ts
│  ├── services
│  │  ├── certs.ts
│  │  ├── data.ts
│  │  ├── global-feed.ts
│  │  ├── identity.ts
│  │  └── storage.ts
│  ├── index.ts
│  └── varint.d.ts
├── .dockerignore
├── .env.example
├── .gitignore
├── Dockerfile
├── package.json
├── README.md
└── tsconfig.json
```

**`package.json`**

```json
{
    "name": "vibe-cloud-api",
    "version": "0.0.3",
    "private": true,
    "main": "./dist/index.mjs",
    "types": "./dist/index.d.mts",
    "files": ["dist", "public"],
    "scripts": {
        "dev": "bun run --watch src/index.ts",
        "build": "tsup src/index.ts --format esm --dts"
    },
    "dependencies": {
        "@aws-sdk/client-s3": "^3.842.0",
        "@aws-sdk/s3-request-presigner": "^3.842.0",
        "@elysiajs/cookie": "^0.8.0",
        "@elysiajs/cors": "^1.3.3",
        "@elysiajs/eden": "^1.3.2",
        "@elysiajs/html": "^1.3.0",
        "@elysiajs/jwt": "^1.3.1",
        "@elysiajs/static": "^1.3.0",
        "@noble/ed25519": "^2.3.0",
        "@noble/hashes": "^1.8.0",
        "@yolk-oss/elysia-env": "^3.0.0",
        "bip39": "^3.1.0",
        "buffer": "^6.0.3",
        "elysia": "^1.3.5",
        "micro-ed25519-hdkey": "^0.1.2",
        "minio": "^8.0.5",
        "multibase": "^4.0.6",
        "nano": "^10.1.4",
        "varint": "^6.0.0",
        "vibe-core": "workspace:*",
        "jose": "^5.8.0"
    },
    "devDependencies": {
        "@types/nano": "^7.0.0",
        "tsup": "^8.2.3",
        "typescript": "^5.8.3",
        "bun-types": "^1.2.18"
    }
}
```

### `vibe-feeds`

**Type:** Next.js Application

This application handles the user-facing feeds.

**Folder Structure**

```
.
├── app
│  ├── (main)
│  │  ├── feeds
│  │  │  └── [feedId]
│  │  │      └── page.tsx
│  │  ├── layout.tsx
│  │  └── page.tsx
│  ├── auth
│  │  └── callback
│  │      └── page.tsx
│  ├── components
│  │  ├── CreatePost.tsx
│  │  ├── Feed.tsx
│  │  ├── LeftSidebar.tsx
│  │  ├── PostCard.tsx
│  │  ├── RightSidebar.tsx
│  │  ├── UserHoverCard.tsx
│  │  └── UserPreview.tsx
│  ├── context
│  │  └── SelectedUserContext.tsx
│  ├── lib
│  │  └── manifest.ts
│  ├── favicon.ico
│  ├── globals.css
│  └── layout.tsx
├── public
│  ├── images
│  │  ├── logo.png
│  │  ├── logo3.png
│  │  ├── logotype.png
│  │  ├── showcase.png
│  │  └── showcase2.png
│  ├── file.svg
│  ├── globe.svg
│  ├── next.svg
│  ├── vercel.svg
│  └── window.svg
├── .gitignore
├── Dockerfile
├── next.config.ts
├── package.json
├── postcss.config.mjs
├── README.md
├── tsconfig.json
└── vercel.json
```

**`package.json`**

```json
{
    "name": "vibe-feeds",
    "version": "0.1.3",
    "private": true,
    "scripts": {
        "dev": "next dev -p 3000 --turbopack",
        "build": "next build --turbopack",
        "start": "next start",
        "lint": "next lint"
    },
    "dependencies": {
        "lucide-react": "^0.516.0",
        "next": "^15.4.3",
        "react": "19.1.0",
        "react-dom": "19.1.0",
        "vibe-react": "workspace:*",
        "vibe-sdk": "workspace:*"
    },
    "devDependencies": {
        "typescript": "^5",
        "@types/node": "^20",
        "@types/react": "^19",
        "@types/react-dom": "^19",
        "@tailwindcss/postcss": "^4",
        "tailwindcss": "^4",
        "tailwindcss-animate": "^1.0.7"
    }
}
```

### `vibe-collections`

**Type:** Next.js Application

This application manages user collections.

**Folder Structure**

```
.
├── app
│  ├── (main)
│  │  ├── layout.tsx
│  │  └── page.tsx
│  ├── auth
│  │  └── callback
│  │      └── page.tsx
│  ├── components
│  │  ├── Collections.tsx
│  │  ├── UploadButton.tsx
│  │  └── VibeProvider.tsx
│  ├── lib
│  │  └── manifest.ts
│  ├── favicon.ico
│  ├── globals.css
│  └── layout.tsx
├── public
│  ├── images
│  │  ├── logo.png
│  │  ├── logotype.png
│  │  └── showcase.png
│  ├── file.svg
│  ├── globe.svg
│  ├── next.svg
│  ├── vercel.svg
│  └── window.svg
├── .gitignore
├── Dockerfile
├── next.config.ts
├── package.json
├── postcss.config.mjs
├── README.md
├── tsconfig.json
└── vercel.json
```

**`package.json`**

```json
{
    "name": "vibe-collections",
    "version": "0.1.0",
    "private": true,
    "scripts": {
        "dev": "next dev -p 3001 --turbopack",
        "build": "next build --turbopack",
        "start": "next start",
        "lint": "next lint"
    },
    "dependencies": {
        "lucide-react": "^0.516.0",
        "next": "^15.4.3",
        "react": "19.1.0",
        "react-dom": "19.1.0",
        "vibe-react": "workspace:*",
        "vibe-sdk": "workspace:*"
    },
    "devDependencies": {
        "typescript": "^5",
        "@types/node": "^20",
        "@types/react": "^19",
        "@types/react-dom": "^19",
        "@tailwindcss/postcss": "^4",
        "tailwindcss": "^4",
        "tailwindcss-animate": "^1.0.7"
    }
}
```

## Packages

This section describes the shared packages in the `packages` directory.

### `vibe-core`

**Type:** TypeScript Library

This package contains shared types and core utilities for the Vibe monorepo.

**Folder Structure**

```
.
├── src
│  ├── crypto.ts
│  ├── did.ts
│  └── index.ts
├── .gitignore
├── package.json
└── tsconfig.json
```

**`package.json`**

```json
{
    "name": "vibe-core",
    "version": "0.0.1",
    "description": "Shared types and core utilities for Vibe monorepo",
    "main": "dist/index.js",
    "types": "dist/index.d.ts",
    "exports": {
        ".": "./dist/index.js",
        "./crypto": "./dist/crypto.js",
        "./did": "./dist/did.js"
    },
    "scripts": {
        "build": "tsc"
    },
    "dependencies": {
        "bip39": "^3.1.0",
        "micro-ed25519-hdkey": "^0.1.2",
        "@noble/ed25519": "^2.1.0",
        "@noble/hashes": "^1.4.0",
        "buffer": "^6.0.3",
        "multibase": "^4.0.6",
        "varint": "^6.0.0"
    },
    "devDependencies": {
        "typescript": "^5.0.0",
        "@types/varint": "^6.0.0"
    }
}
```

### `vibe-react`

**Type:** React Component Library

This package provides a set of reusable React components for the Vibe applications.

**Folder Structure**

```
.
├── src
│  ├── assets
│  │  └── loader.json
│  ├── components
│  │  ├── layout
│  │  │  ├── Content.tsx
│  │  │  ├── Header.tsx
│  │  │  ├── Layout.tsx
│  │  │  └── LeftPanel.tsx
│  │  ├── ui
│  │  │  ├── avatar.tsx
│  │  │  ├── button.tsx
│  │  │  ├── card.tsx
│  │  │  ├── dialog.tsx
│  │  │  ├── dropdown-menu.tsx
│  │  │  ├── hover-card.tsx
│  │  │  ├── input.tsx
│  │  │  ├── label.tsx
│  │  │  ├── radio-group.tsx
│  │  │  ├── squircle.tsx
│  │  │  └── textarea.tsx
│  │  ├── AppGridMenu.tsx
│  │  ├── FilePreview.tsx
│  │  ├── ImagePicker.tsx
│  │  ├── LoadingAnimation.tsx
│  │  ├── PermissionPickerDialog.tsx
│  │  ├── PermissionSelector.tsx
│  │  ├── ProfileMenu.tsx
│  │  └── VibeProvider.tsx
│  ├── lib
│  │  ├── types.ts
│  │  └── utils.ts
│  ├── index.tsx
│  ├── input.css
│  └── varint.d.ts
├── .gitignore
├── components.json
├── package.json
├── postbuild.ts
├── postcss.config.js
├── README.md
├── tailwind.config.js
└── tsconfig.json
```

**`package.json`**

```json
{
    "name": "vibe-react",
    "version": "0.0.1",
    "private": true,
    "type": "module",
    "main": "dist/index.js",
    "types": "dist/index.d.ts",
    "files": ["dist"],
    "scripts": {
        "build:js": "tsup src/index.tsx --format esm,cjs --dts --external react --external react-dom",
        "build:css": "npx @tailwindcss/cli -i ./src/input.css -o ./dist/vibe-react.css --minify",
        "build": "pnpm run build:js && pnpm run build:css",
        "dev": "tsup src/index.tsx --format esm,cjs --dts --external react --external react-dom --watch"
    },
    "dependencies": {
        "@lottiefiles/dotlottie-react": "^0.14.4",
        "@radix-ui/react-avatar": "^1.1.10",
        "@radix-ui/react-dialog": "^1.1.14",
        "@radix-ui/react-dropdown-menu": "^2.1.15",
        "@radix-ui/react-hover-card": "^1.1.14",
        "@radix-ui/react-label": "^2.1.7",
        "@radix-ui/react-radio-group": "^1.3.7",
        "@radix-ui/react-slot": "^1.2.3",
        "class-variance-authority": "^0.7.1",
        "clsx": "^2.1.1",
        "lucide-react": "^0.516.0",
        "vibe-sdk": "workspace:*"
    },
    "peerDependencies": {
        "react": "19.1.0",
        "react-dom": "19.1.0"
    },
    "devDependencies": {
        "@tailwindcss/cli": "^4.1.11",
        "@types/react": "19.1.6",
        "@types/react-dom": "19.1.6",
        "autoprefixer": "^10.4.21",
        "concurrently": "^8.2.2",
        "onchange": "^7.1.0",
        "postcss": "^8.5.6",
        "tailwind-merge": "^3.3.1",
        "tailwindcss": "^4.1.11",
        "tailwindcss-animate": "^1.0.7",
        "tsup": "^8.2.3",
        "typescript": "5.8.3"
    }
}
```

### `vibe-sdk`

**Type:** TypeScript SDK

This package provides a software development kit for interacting with the Vibe platform.

**Folder Structure**

```
.
├── src
│  ├── strategies
│  │  ├── agent.ts
│  │  ├── auth-proxy.ts
│  │  └── standalone.ts
│  ├── index.ts
│  ├── sdk-manager.ts
│  ├── session-manager.ts
│  └── varint.d.ts
├── .gitignore
├── package.json
├── README.md
└── tsconfig.json
```

**`package.json`**

```json
{
    "name": "vibe-sdk",
    "version": "0.0.1",
    "private": true,
    "type": "module",
    "main": "dist/index.js",
    "types": "dist/index.d.ts",
    "scripts": {
        "build": "tsup src/index.ts --format esm,cjs --dts",
        "dev": "tsup src/index.ts --format esm,cjs --dts --watch"
    },
    "files": ["dist"],
    "dependencies": {
        "@elysiajs/eden": "^1.3.2",
        "@noble/ed25519": "^2.1.0",
        "@noble/hashes": "^1.4.0",
        "bip39": "^3.1.0",
        "buffer": "^6.0.3",
        "micro-ed25519-hdkey": "^0.1.2",
        "multibase": "^4.0.6",
        "varint": "^6.0.0",
        "jose": "^5.8.0",
        "vibe-core": "workspace:*"
    },
    "devDependencies": {
        "elysia": "^1.3.5",
        "typescript": "5.8.3",
        "concurrently": "^8.2.2",
        "tsup": "^8.2.3",
        "vibe-cloud-api": "workspace:*"
    }
}
```
