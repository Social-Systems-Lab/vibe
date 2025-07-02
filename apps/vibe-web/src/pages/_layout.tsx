"use client";

import "../styles.css";

import type { ReactNode } from "react";
import { Provider } from "jotai";

type RootLayoutProps = { children: ReactNode };

export default function RootLayout({ children }: RootLayoutProps) {
    return (
        <Provider>
            <div className="font-['Nunito']">
                <meta name="description" content="Vibe - your everything" />
                <link rel="icon" type="image/png" href="/images/favicon.png" />
                <main>{children}</main>
            </div>
        </Provider>
    );
}
