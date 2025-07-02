import type { ReactNode } from "react";
import { Providers } from "../components/providers";

export default function Layout({ children }: { children: ReactNode }) {
    return (
        <Providers>
            <div className="font-sans">{children}</div>
        </Providers>
    );
}
