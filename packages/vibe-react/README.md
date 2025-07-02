# Vibe React Library

This package provides React components and hooks to interact with the Vibe ecosystem.

## Installation

```bash
bun add vibe-react
```

## Usage

Wrap your application with the `VibeProvider`.

```tsx
// app/layout.tsx
import { VibeProvider } from "vibe-react";

export default function RootLayout({ children }) {
    const config = {
        apiUrl: "https://your-vibe-api-endpoint.com",
    };

    return (
        <html lang="en">
            <body>
                <VibeProvider config={config}>{children}</VibeProvider>
            </body>
        </html>
    );
}
```

### Usage with React Server Components (RSC)

If you are using a framework that supports React Server Components (like Next.js 13+ or Waku), you must ensure the `VibeProvider` is rendered within a Client Component. React Context is not passed from Server to Client Components.

Create a dedicated `providers.tsx` file marked with `"use client";`.

**`app/components/providers.tsx`**

```tsx
"use client";

import type { ReactNode } from "react";
import { VibeProvider } from "vibe-react";

const config = {
    apiUrl: "https://your-vibe-api-endpoint.com",
};

export function Providers({ children }: { children: ReactNode }) {
    return <VibeProvider config={config}>{children}</VibeProvider>;
}
```

Then, use this `Providers` component in your root server-side layout.

**`app/layout.tsx`**

```tsx
import type { ReactNode } from "react";
import { Providers } from "./components/providers";

export default function Layout({ children }: { children: ReactNode }) {
    return (
        <html>
            <body>
                <Providers>{children}</Providers>
            </body>
        </html>
    );
}
```

## Available Components & Hooks

### `useVibe()`

Access the Vibe SDK instance and authentication state.

```tsx
import { useVibe } from "vibe-react";

function MyComponent() {
    const { isAuthenticated, user, login, logout } = useVibe();
    // ...
}
```

### Components

-   `<LoginButton />`
-   `<SignupButton />`
-   `<ProfileMenu />`
