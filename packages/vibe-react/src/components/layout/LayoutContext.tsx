"use client";

import React, { createContext, useContext, PropsWithChildren } from "react";

export type LayoutVariant = "default" | "fluid" | "dashboard";

export type LayoutVariantConfig = {
  variant: LayoutVariant;
  header: {
    height: number;
    variant: "default" | "console";
    backgroundClass?: string;
    sticky: boolean;
  };
  content: {
    container: "fixed" | "fluid";
    topOffset: number;
    leftWidth: string;
    rightWidth: string;
  };
  /**
   * Misc chrome/config for variants
   */
  chrome?: {
    dashboard?: {
      /**
       * Should the left rail show a right border? (md+)
       * Default: true
       */
      leftBorder: boolean;
      /**
       * Should the TopBar show a bottom border?
       * Default: false for dashboard
       */
      topBarBorder: boolean;
    };
  };
};

const defaultConfig: LayoutVariantConfig = {
  variant: "default",
  header: { height: 56, variant: "default", sticky: true },
  content: {
    container: "fixed",
    topOffset: 56,
    leftWidth: "260px",
    rightWidth: "320px",
  },
  chrome: {
    dashboard: {
      leftBorder: true,
      topBarBorder: false,
    },
  },
};

const LayoutConfigContext = createContext<LayoutVariantConfig>(defaultConfig);

export function useLayoutConfig() {
  return useContext(LayoutConfigContext);
}

export function LayoutConfigProvider({
  value,
  children,
}: PropsWithChildren<{ value: LayoutVariantConfig }>) {
  return (
    <LayoutConfigContext.Provider value={value}>
      {children}
    </LayoutConfigContext.Provider>
  );
}
