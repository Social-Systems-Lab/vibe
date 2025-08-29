import React from "react";
import { FileDoc } from "vibe-sdk";
import VibeImage from "../VibeImage";

interface SquircleProps {
    src?: FileDoc | string | null;
    size?: number;
    className?: string;
    children?: React.ReactNode; // For fallback content like initials
    asCircle?: boolean;
}

const SQUIRCLE_PATH = "M 0 80 C 0 20, 20 0, 80 0 S 160 20, 160 80, 140 160, 80 160, 0 140, 0 80";

export function Squircle({ src, size = 60, className, children, asCircle }: SquircleProps) {
    const clipPathId = `squircle-clip-${Math.random().toString(36).substring(2, 15)}`;

    return (
        <div
            className={className}
            style={{
                width: size,
                height: size,
                position: "relative",
                clipPath: asCircle ? undefined : `url(#${clipPathId})`,
                borderRadius: asCircle ? "50%" : undefined,
                overflow: asCircle ? "hidden" : undefined,
                // Fallback for browsers that might not support clip-path with inline SVG as well
                // but modern browsers should be fine.
            }}
        >
            {!asCircle && (
                <svg width="0" height="0" style={{ position: "absolute" }}>
                    <defs>
                        <clipPath id={clipPathId} clipPathUnits="objectBoundingBox">
                            <path d="M0 0.5 C0 0.125,0.125 0,0.5 0 S1 0.125,1 0.5,0.875 1,0.5 1,0 0.875,0 0.5" />
                        </clipPath>
                    </defs>
                </svg>
            )}
            {src ? (
                <VibeImage src={src} alt="Squircle content" className="w-full h-full object-cover block" />
            ) : (
                <div
                    style={{
                        width: "100%",
                        height: "100%",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        backgroundColor: "#ebebeb",
                        color: "hsl(var(--muted-foreground))",
                    }}
                >
                    {children}
                </div>
            )}
        </div>
    );
}

interface SquircleMaskProps {
    size: number;
    children: React.ReactNode;
    className?: string;
    asCircle?: boolean;
}

export function SquircleMask({ size, children, className, asCircle }: SquircleMaskProps) {
    const clipPathId = `squircle-mask-${Math.random().toString(36).substring(2, 15)}`;
    return (
        <div
            className={className}
            style={{
                width: size,
                height: size,
                clipPath: asCircle ? undefined : `url(#${clipPathId})`,
                borderRadius: asCircle ? "50%" : undefined,
                overflow: asCircle ? "hidden" : undefined,
            }}
        >
            {!asCircle && (
                <svg width="0" height="0" style={{ position: "absolute" }}>
                    <defs>
                        <clipPath id={clipPathId} clipPathUnits="objectBoundingBox">
                            {/* Path normalized to 0-1 range for objectBoundingBox */}
                            <path d="M0 0.5 C0 0.125,0.125 0,0.5 0 S1 0.125,1 0.5,0.875 1,0.5 1,0 0.875,0 0.5" />
                        </clipPath>
                    </defs>
                </svg>
            )}
            {children}
        </div>
    );
}

export default Squircle;
