import React from "react";

// Basic SVG Placeholder for Vibe Logo
export const VibeLogo = ({ className, ...props }: React.SVGProps<SVGSVGElement>) => (
    <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className={className}
        {...props}
    >
        {/* Simple abstract 'V' shape */}
        <path d="M3 3l7 18L17 3" />
        <path d="M10 3h4" /> {/* Top bar */}
        {/* You can replace this with a more complex SVG path later */}
    </svg>
);
