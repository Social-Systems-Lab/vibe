import React from 'react';
import { useAtom } from 'jotai';
import { signedInAccountsAtom } from './atoms';
import Browser from './browser/Browser';

const MainScreen: React.FC = () => {
  const [signedInAccounts] = useAtom(signedInAccountsAtom);
  
  return (
    <div className="flex w-full h-full">
      {/* Sidebar could go here in the future */}
      
      {/* Main content area */}
      <div className="flex-1 overflow-hidden">
        <Browser />
      </div>
    </div>
  );
};

export default MainScreen;