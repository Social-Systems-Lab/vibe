"use client";

import React from "react";
import { cn } from "../lib/utils";
import { FileItem } from "../lib/types";

type Size = "sm" | "md" | "lg";
type Variant = "grid" | "inline";

export interface FilePreviewProps {
    file: FileItem;
    size?: Size;
    variant?: Variant;
    className?: string;
    onClick?: () => void;
    selected?: boolean;
}

const sizeMap: Record<Size, { w: number; h: number; radius: string }> = {
    sm: { w: 64, h: 64, radius: "rounded-md" },
    md: { w: 120, h: 120, radius: "rounded-lg" },
    lg: { w: 180, h: 180, radius: "rounded-xl" },
};

function isImage(mime?: string, name?: string) {
    if (mime) return mime.startsWith("image");
    if (!name) return false;
    const lower = name.toLowerCase();
    return [".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp", ".avif"].some((ext) => lower.endsWith(ext));
}

export function FilePreview({ file, size = "md", variant = "grid", className, onClick, selected }: FilePreviewProps) {
    const { w, h, radius } = sizeMap[size];
    const showImage = isImage(file.mimeType, file.name);
    const src = file.thumbnailUrl || file.url;

    const body =
        showImage && src ? (
            <img src={src} alt={file.name || "file"} width={w} height={h} className={cn("object-cover w-full h-full", radius)} draggable={false} />
        ) : (
            <div className={cn("flex items-center justify-center bg-muted text-muted-foreground", radius)} style={{ width: "100%", height: "100%" }}>
                <DefaultFileIcon mime={file.mimeType} />
                showImage: {showImage ? "yes" : "no"}
            </div>
        );

    return (
        <div
            className={cn(
                "relative overflow-hidden border border-transparent hover:border-border transition-colors",
                radius,
                selected && "ring-2 ring-primary",
                className
            )}
            style={{
                width: variant === "inline" ? undefined : w,
                height: variant === "inline" ? undefined : h,
            }}
            onClick={onClick}
            role={onClick ? "button" : undefined}
        >
            {body}
            {file.name && variant === "inline" && <div className="mt-2 text-sm truncate">{file.name}</div>}
        </div>
    );
}

function DefaultFileIcon({ mime }: { mime?: string }) {
    // lightweight fallback glyph by type
    const label =
        mime?.split("/")[0] === "image"
            ? "IMG"
            : mime?.includes("pdf")
            ? "PDF"
            : mime?.includes("zip") || mime?.includes("compressed")
            ? "ZIP"
            : mime?.split("/")?.[0]?.toUpperCase() || "FILE";

    return (
        <div className="flex items-center justify-center w-full h-full">
            <div className="text-xs font-semibold tracking-wide">{label}</div>
        </div>
    );
}

export default FilePreview;
