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
- **Naming**: camelCase for variables/functions, PascalCase for components/types
- **Comments**: JSDoc for functions, inline for complex logic