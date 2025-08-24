"use client";

import React, { Children, isValidElement, cloneElement } from "react";
import { cn } from "../../lib/utils";
import { LayoutConfigProvider, LayoutVariant, LayoutVariantConfig } from "./LayoutContext";
import { Header as HeaderCmp } from "./Header";
import { Content as ContentCmp } from "./Content";
import { TopBar as TopBarCmp } from "./TopBar";
import { NavPanel as NavPanelCmp } from "./NavPanel";
import { AppGridMenu } from "../AppGridMenu";
import { ProfileMenu } from "../../index";

export type LayoutProps = {
  children: React.ReactNode;
  className?: string;
  container?: "fluid" | "fixed";
  maxWidth?: string;
  /**
   * - "default": two rows (TopBar row + main row), centered content
   * - "fluid": two rows (TopBar row + main row), full-bleed content
   * - "dashboard": two columns (left fixed rail with Header+NavPanel, right main with TopBar+Content)
   */
  variant?: LayoutVariant;
  /**
   * Dashboard-only chrome controls
   */
  dashboardLeftBorder?: boolean;   // default true
  dashboardTopBarBorder?: boolean; // default false
};

function getDisplayName(el: any): string | undefined {
  if (!el) return undefined;
  return (el.type && (el.type.displayName || el.type.name)) || undefined;
}

// Helper: robust name match to handle re-exports/minification
function nameIncludes(el: any, needle: string): boolean {
  const n = (getDisplayName(el) || "").toLowerCase();
  return n.includes(needle.toLowerCase());
}

export function Layout({
  children,
  className,
  container = "fluid",
  maxWidth = "none",
  variant = "default",
  dashboardLeftBorder,
  dashboardTopBarBorder,
}: LayoutProps) {
  const containerStyle = container === "fixed" ? { maxWidth, margin: "0 auto" as const } : undefined;

  // Variant config only used by nested components (Header/Content/TopBar) that read from context.
  const variantConfig: LayoutVariantConfig = (() => {
    switch (variant) {
      case "fluid":
        return {
          variant,
          // Header is not used as a global fixed bar in fluid; TopBar row is used instead.
          header: { height: 56, variant: "console", sticky: false },
          // No global top offset; TopBar sits in its own row.
          content: { container: "fluid", topOffset: 0, leftWidth: "260px", rightWidth: "320px" },
          chrome: { dashboard: { leftBorder: true, topBarBorder: false } },
        };
      case "dashboard":
        return {
          variant,
          // Header will be rendered inside the left column (not sticky)
          header: { height: 56, variant: "console", sticky: false },
          // Content should be full-bleed and have no global top offset
          content: { container: "fluid", topOffset: 0, leftWidth: "260px", rightWidth: "320px" },
          chrome: {
            dashboard: {
              leftBorder: typeof (dashboardLeftBorder) === "boolean" ? dashboardLeftBorder : true,
              topBarBorder: typeof (dashboardTopBarBorder) === "boolean" ? dashboardTopBarBorder : false,
            },
          },
        };
      case "default":
      default:
        return {
          variant: "default",
          // Header is not used as a global fixed bar in default; TopBar row is used instead.
          header: { height: 56, variant: "default", sticky: false },
          // No global top offset; TopBar sits in its own row.
          content: { container: "fixed", topOffset: 0, leftWidth: "260px", rightWidth: "320px" },
          chrome: { dashboard: { leftBorder: true, topBarBorder: false } },
        };
    }
  })();

  // Parse children into slots
  const arr = Children.toArray(children) as React.ReactElement[];
  let headerChild: React.ReactElement<any> | null = null;
  let topBarChild: React.ReactElement<any> | null = null;
  let navChild: React.ReactElement<any> | null = null;
  let contentChild: React.ReactElement<any> | null = null;

  for (const el of arr) {
    if (!isValidElement(el)) continue;
    const name = getDisplayName(el) || "";
    const lname = name.toLowerCase();
    if (!headerChild && (lname.includes("header") || el.type === HeaderCmp)) {
      headerChild = el;
      continue;
    }
    if (!topBarChild && (lname.includes("topbar") || el.type === TopBarCmp)) {
      topBarChild = el;
      continue;
    }
    const isNav = lname.includes("navpanel") || el.type === NavPanelCmp || (typeof el.type === "function" && (el.type as any).__isNavPanel === true);
    if (!navChild && isNav) {
      navChild = el;
      continue;
    }
    if (!contentChild && (lname.includes("content") || el.type === ContentCmp)) {
      contentChild = el;
      continue;
    }
  }

  // Ensure there is at least a Content element; if not, wrap remaining children (excluding slots) in one.
  if (!contentChild) {
    const contentFallbackChildren = arr.filter((el) => {
      if (!isValidElement(el)) return true;
      const name = getDisplayName(el);
      return !(name === "Header" || name === "TopBar" || name === "NavPanel");
    });
    contentChild = <ContentCmp>{contentFallbackChildren}</ContentCmp>;
  }

  let navNode = navChild ? (navChild.props?.children as React.ReactNode) : undefined;
  // Fallback: if we failed to detect NavPanel (e.g., due to HMR/minification),
  // try to pick the first non-Content/TopBar/Header child and use its children.
  if (!navNode) {
    for (const el of arr) {
      if (!isValidElement(el)) continue;
      const name = (getDisplayName(el) || "").toLowerCase();
      const isKnown =
        name.includes("header") ||
        name.includes("topbar") ||
        name.includes("content") ||
        el.type === HeaderCmp ||
        el.type === TopBarCmp ||
        el.type === ContentCmp;
      if (!isKnown) {
        navNode = (el as any).props?.children as React.ReactNode;
        if (navNode) break;
      }
    }
  }

  // Additional fallback: gather any non-Header/TopBar/Content children as left-rail content
  const leftFallbackChildren = arr
    .filter((el) => {
      if (!isValidElement(el)) return false;
      const n = (getDisplayName(el) || "").toLowerCase();
      const known =
        n.includes("header") ||
        n.includes("topbar") ||
        n.includes("content") ||
        el.type === HeaderCmp ||
        el.type === TopBarCmp ||
        el.type === ContentCmp;
      return !known;
    })
    .map((el) => (isValidElement(el) && (el as any).props?.children ? (el as any).props.children : el));

  // Defaults
  const defaultHeaderForDashboard = <HeaderCmp backgroundClass="bg-transparent" right={null} />;

  // Default top bar used inside the main content for dashboard (actions right-aligned)
  const defaultTopBarDashboard = (
    <TopBarCmp border={variantConfig.chrome?.dashboard?.topBarBorder === true}>
      <div className="flex items-center justify-end gap-4 mr-2">
        <AppGridMenu />
        <ProfileMenu />
      </div>
    </TopBarCmp>
  );

  // Default top row for default/fluid: Header-like left area + right actions
  const defaultTopRow = (
    <TopBarCmp sticky={false}>
      <div className="w-full flex items-center justify-between">
        <div className="flex items-center space-x-2 px-3">
          <a href="/" aria-label="Home">
            <img src="/images/logotype.png" alt="App" className="h-8" />
          </a>
        </div>
        <div className="flex items-center gap-4 mr-2">
          <AppGridMenu />
          <ProfileMenu />
        </div>
      </div>
    </TopBarCmp>
  );

  // Compose per variant
  let composed: React.ReactNode;

  if (variant === "dashboard") {
    // Root: two columns. Left: Header + NavPanel. Right: TopBar + Content.
    const headerForLeft = headerChild ?? defaultHeaderForDashboard;
    const topBarForMain = topBarChild ?? defaultTopBarDashboard;

    const contentProps: any = contentChild.props || {};
    composed = (
      <>
        <style>{`:root{--left-col-width:0px}@media (min-width:768px){:root{--left-col-width:${variantConfig.content.leftWidth}}}`}</style>
        <div className="grid w-full" style={{ gridTemplateColumns: `var(--left-col-width) minmax(0, 1fr)` }}>
          {/* Left rail */}
          <div
            className={`hidden md:block ${variantConfig.chrome?.dashboard?.leftBorder !== false ? "border-r border-gray-200" : ""}`}
            style={{ gridColumn: "1 / 2" }}
          >
            {headerForLeft}
            {navNode ? (
              <div className="mt-2">
                {navNode}
              </div>
            ) : leftFallbackChildren.length ? (
              <div className="mt-2">{leftFallbackChildren}</div>
            ) : null}
          </div>
          {/* Main */}
          <div style={{ gridColumn: "2 / 3" }}>
            {topBarForMain}
            {cloneElement(contentChild as React.ReactElement<any>, {
              ...contentProps,
              container: "fluid",
              topOffset: 0,
              left: undefined,
              leftTop: undefined,
              topBar: undefined,
            })}
          </div>
        </div>
      </>
    );
  } else {
    // Root: two rows. Top row is TopBar (header-left + actions-right). Main row is Content.
    const topRow = topBarChild ?? defaultTopRow;
    const enforcedContainer = variant === "fluid" ? "fluid" : "fixed";

    const contentProps: any = contentChild.props || {};
    const mainContent = cloneElement(contentChild as React.ReactElement<any>, {
      ...contentProps,
      container: enforcedContainer,
      topOffset: 0,
      left: navNode,
    });

    composed = (
      <div className="grid w-full" style={{ gridTemplateRows: "auto minmax(0,1fr)" }}>
        <div style={{ gridRow: "1 / 2" }}>{topRow}</div>
        <div style={{ gridRow: "2 / 3" }}>{mainContent}</div>
      </div>
    );
  }

  return (
    <LayoutConfigProvider value={variantConfig}>
      <div className={cn("min-h-screen bg-background text-foreground", className)} style={containerStyle}>
        {composed}
      </div>
    </LayoutConfigProvider>
  );
}
