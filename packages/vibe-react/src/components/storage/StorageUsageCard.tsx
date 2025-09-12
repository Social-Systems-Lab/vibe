"use client";

import * as React from "react";
import { Card, CardAction, CardContent, CardHeader, CardTitle, CardDescription } from "../ui/card";
import { cn } from "../../lib/utils";

export type StorageUsageCardProps = {
    usedBytes?: number;
    reservedBytes?: number;
    limitBytes?: number;
    percent?: number; // 0-100
    tier?: string;
    loading?: boolean;
    className?: string;
    action?: React.ReactNode; // optional right-side action (e.g., Manage plan)
};

function formatBytes(n?: number) {
    if (typeof n !== "number" || isNaN(n)) return "-";
    const units = ["B", "KB", "MB", "GB", "TB"];
    let i = 0;
    let v = n;
    while (v >= 1024 && i < units.length - 1) {
        v /= 1024;
        i++;
    }
    return `${v.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

export function StorageUsageCard({
    usedBytes,
    reservedBytes,
    limitBytes,
    percent,
    tier,
    loading,
    className,
    action,
}: StorageUsageCardProps) {
    const computedPercent =
        typeof percent === "number"
            ? Math.max(0, Math.min(100, percent))
            : typeof usedBytes === "number" && typeof limitBytes === "number" && limitBytes > 0
            ? Math.max(0, Math.min(100, (usedBytes / limitBytes) * 100))
            : 0;

    const nearLimit = computedPercent >= 80;
    const hasAction = Boolean(action);
    const minFill = computedPercent > 0 ? 8 : 0;

    return (
        <div className={cn("", className)}>
            {loading ? (
                <div className="text-sm text-foreground/60">Loading usage…</div>
            ) : (
                <>
                    <div className="mb-3 flex items-end gap-2">
                        <div className="text-2xl font-semibold">{formatBytes(usedBytes)}</div>
                        <div className="text-sm text-foreground/60">of {formatBytes(limitBytes)} used</div>
                        {/* <div className={cn("ml-auto text-sm", nearLimit ? "text-amber-700" : "text-foreground/70")}>
                {computedPercent.toFixed(0)}%
              </div> */}
                    </div>

                    <div
                        className={cn(
                            "relative h-2 w-full overflow-hidden rounded-full bg-foreground/10",
                            nearLimit && "ring-2 ring-amber-400/40"
                        )}
                        aria-label="Storage usage"
                    >
                        <div
                            className="absolute inset-y-0 left-0 h-full rounded-full bg-violet-500 bg-gradient-to-r from-violet-500 to-indigo-500 transition-[width] duration-300 ease-out"
                            style={{ width: `${computedPercent}%`, minWidth: minFill }}
                        />
                        {/* TODO: Investigate lingering reserved_bytes from failed uploads.
                  The reconciler should clean these up. For now, hiding from UI. */}
                        {/* {typeof reservedBytes === "number" && typeof limitBytes === "number" && limitBytes > 0 && reservedBytes > 0 && (
                <div
                  className="absolute inset-y-0 rounded-full bg-foreground/40"
                  style={{
                    left: `${computedPercent}%`,
                    width: `${Math.max(0, Math.min(100, (reservedBytes / limitBytes) * 100))}%`,
                  }}
                />
              )} */}
                    </div>

                    {/* {(reservedBytes || 0) > 0 && (
              <div className="mt-2 flex items-center gap-4 text-xs text-foreground/70">
                <div className="flex items-center gap-1">
                  <span className="inline-block size-2 rounded-full bg-violet-500" />
                  Used
                </div>
                <div className="flex items-center gap-1">
                  <span className="inline-block size-2 rounded-full bg-foreground/40" />
                  Reserved
                </div>
                {tier ? <div className="ml-auto text-foreground/60">Plan • {tier}</div> : null}
              </div>
            )} */}

                    {nearLimit && (
                        <div className="mt-2 text-xs text-amber-700">
                            Approaching your limit. Consider cleaning up files or upgrading your plan.
                        </div>
                    )}
                </>
            )}
        </div>
    );
}
