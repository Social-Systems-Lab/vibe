import React, { useState, useEffect } from 'react';
import { useAtom } from 'jotai';
import { signInStatusAtom, signedInAccountsAtom } from '../atoms';
import { useAuth } from '../auth/auth-context';
import CreateAccountWizard from './CreateAccountWizard';
import AccountSelect from './AccountSelect';

type OnboardingMode = 'select_account' | 'create_account';

const OnboardingWizard: React.FC = () => {
  const { accounts } = useAuth();
  const [, setSignInStatus] = useAtom(signInStatusAtom);
  const [, setSignedInAccounts] = useAtom(signedInAccountsAtom);
  
  const [mode, setMode] = useState<OnboardingMode>('select_account');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  
  // Determine initial mode based on accounts presence
  useEffect(() => {
    if (accounts.length === 0) {
      setMode('create_account');
    } else {
      setMode('select_account');
    }
  }, [accounts]);
  
  // Handle account login
  const handleLogin = async (accountDid: string, pin?: string) => {
    setLoading(true);
    setError('');
    
    try {
      await window.electron.loginAccount(accountDid, pin);
      setSignInStatus('loggedIn');
      
      // Update signed in accounts atom
      const account = accounts.find(acc => acc.did === accountDid);
      if (account) {
        setSignedInAccounts([{
          id: account.did,
          name: account.name,
          pictureUrl: account.pictureUrl
        }]);
      }
    } catch (error) {
      console.error('Login error:', error);
      setError('Login failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };
  
  // Handle account creation completion
  const handleAccountCreationComplete = () => {
    setSignInStatus('loggedIn');
  };
  
  // Switch to create account mode
  const handleCreateNewAccount = () => {
    setMode('create_account');
  };
  
  return (
    <div className="w-full h-full bg-white">
      {error && (
        <div className="absolute top-4 left-1/2 transform -translate-x-1/2 bg-red-100 border border-red-400 text-red-700 px-4 py-2 rounded z-50">
          {error}
        </div>
      )}
      
      {mode === 'select_account' ? (
        <AccountSelect
          accounts={accounts}
          onSelectAccount={handleLogin}
          onCreateAccount={handleCreateNewAccount}
          loading={loading}
        />
      ) : (
        <CreateAccountWizard onComplete={handleAccountCreationComplete} />
      )}
    </div>
  );
};

export default OnboardingWizard;