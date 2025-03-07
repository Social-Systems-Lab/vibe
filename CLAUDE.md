# Vibe Project Guidelines

## Commands
- **Dev**: `npm run dev [app1] [app2]` - Run dev server (options: web, contacts)
- **Build**: `npm run build` - Build SDK and React packages
- **App**: `npm run app` - Run mobile app
- **Install**: `npm run install` - Install all dependencies
- **TypeCheck**: `cd <package-dir> && npx tsc --noEmit`
- **Lint**: `cd <package-dir> && npx eslint 'src/**/*.{ts,tsx}'`

## Code Style
- **Imports**: Group by external/internal, alphabetize
- **Components**: Functional with named exports
- **Types**: Explicit interfaces (vs type), PascalCase
- **Error Handling**: Use try/catch with specific error types
- **State Management**: React hooks (useState, useContext)
- **Formatting**: 4-space indentation, semi-colons
- **Naming**: camelCase for variables/functions, PascalCase for components/types, kebab-case for filenames.
- **Comments**: JSDoc for functions, inline for complex logic

## Repository Structure
- **vibe-app**: Vibe mobile application. Built with **Expo/React Native**.
- **vibe-desktop**: Vibe desktop application. Built with **Electron + React Native**.
- **vibe-web**: Vibe website hosted at [vibeapp.dev](vibeapp.dev) providing documentation and integration with the vibe app. Built with **Next.js**.
- **vibe-sdk**: JavaScript/TypeScript SDK that enables applications to interact with Vibe for authentication, data access, and permissions handling.
- **vibe-react**: React integration for Vibe, simplifying usage of Vibe within React applications.
- **vibe-cloud**: Vibe cloud enabling P2P communication and data storage. Allows users to self-host their digital presence.
- **apps/**: Web applications built on top of Vibe, using the Vibe SDK for authentication and data handling. Built using **Vite + React**.