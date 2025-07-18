import type { ReactNode } from "react";
import { LayoutClient } from "@/components/LayoutClient";
import "../styles.css";
import "vibe-react/dist/vibe-react.css";

export default function Layout({ children }: { children: ReactNode }) {
    return (
        <div className="min-h-screen bg-background text-foreground">
            <LayoutClient>{children}</LayoutClient>
        </div>
    );
}
