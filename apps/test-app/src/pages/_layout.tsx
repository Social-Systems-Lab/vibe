import type { ReactNode } from "react";
import { Providers } from "../components/providers";
import { AuthWidget } from "vibe-react";

export default function Layout({ children }: { children: ReactNode }) {
    return (
        <Providers>
            <header>
                <AuthWidget />
            </header>
            <main className="font-sans">{children}</main>
        </Providers>
    );
}
