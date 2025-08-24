"use client";

import React from "react";
import { cn } from "../../lib/utils";

/**
 * Declarative slot for the left navigation area.
 * The Layout component decides placement, stickiness and offsets for this slot
 * based on the current layout variant.
 */
export type NavPanelProps = {
  children: React.ReactNode;
  className?: string;
};

export function NavPanel({ children, className }: NavPanelProps) {
  // Marker component: renders nothing by itself.
  // Layout detects this component as a slot and will render its children
  // in the appropriate place for the selected variant.
  return null;
}

// Robust identification for slot detection across builds/HMR
// - displayName is used as primary
// - __isNavPanel is an explicit marker property checked by Layout
(NavPanel as any).__isNavPanel = true;
NavPanel.displayName = "NavPanel";

export default NavPanel;
