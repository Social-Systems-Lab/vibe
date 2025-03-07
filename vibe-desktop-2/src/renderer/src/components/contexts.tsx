import React from 'react';
import { AuthProvider } from './auth/auth-context';
import { DbProvider } from './db/db-context';
import { P2PProvider } from './p2p/p2p-context';
import { TabsProvider } from './browser/tab-context';
import { WebViewProvider } from './browser/web-view-context';

// VibeContextProvider wraps all the context providers for the app
export const VibeContextProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  return (
    <AuthProvider>
      <DbProvider>
        <P2PProvider>
          <WebViewProvider>
            <TabsProvider>
              {children}
            </TabsProvider>
          </WebViewProvider>
        </P2PProvider>
      </DbProvider>
    </AuthProvider>
  );
};

export default VibeContextProvider;