"use client";

import React, { createContext, useContext, useState, ReactNode } from "react";

type Ctx = {
  content: ReactNode | null;
  setContent: (node: ReactNode | null) => void;
};

const PageTopBarContext = createContext<Ctx>({
  content: null,
  setContent: () => {},
});

export function PageTopBarProvider({ children }: { children: ReactNode }) {
  const [content, setContent] = useState<ReactNode | null>(null);
  return (
    <PageTopBarContext.Provider value={{ content, setContent }}>
      {children}
    </PageTopBarContext.Provider>
  );
}

export function usePageTopBar() {
  return useContext(PageTopBarContext);
}
