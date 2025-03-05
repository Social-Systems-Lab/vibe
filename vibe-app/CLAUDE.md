# Vibe App Guidelines

## Commands
- **Start**: `npm run start` - Start Expo with tunnel mode (clears cache)
- **Android**: `npm run android` - Run on Android device/emulator
- **iOS**: `npm run ios` - Run on iOS simulator/device
- **Web**: `npm run web` - Start Expo web server
- **Test**: `npm run test` - Run Jest tests in watch mode
- **Test Single**: `npx jest -t "test name"` - Run specific test
- **Lint**: `npm run lint` - Run Expo linting
- **TypeCheck**: `npx tsc --noEmit` - Check TypeScript errors

## Code Style
- **Imports**: Group external first, then internal; alphabetize within groups
- **Components**: Functional components with named exports
- **Types**: Explicit interfaces (PascalCase), prefer interfaces over types
- **Error Handling**: try/catch with specific error types
- **State Management**: React Context API for global state, useState for local
- **Formatting**: 4-space indentation, semicolons, single quotes
- **Naming**: camelCase for variables/functions, PascalCase for components/types
- **Comments**: JSDoc for functions, inline for complex logic
- **File Structure**: Features in dedicated subdirectories, context providers separate