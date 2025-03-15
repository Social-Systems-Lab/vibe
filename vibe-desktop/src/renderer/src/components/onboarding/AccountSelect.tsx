import React, { useState, useEffect } from 'react';
import { FiPlus, FiLock } from 'react-icons/fi';
import { BsPersonCircle } from 'react-icons/bs';
import { Account } from '../auth/auth-context';

interface AccountSelectProps {
  accounts: Account[];
  onSelectAccount: (accountDid: string, pin?: string) => void;
  onCreateAccount: () => void;
  loading?: boolean;
}

const AccountSelect: React.FC<AccountSelectProps> = ({ 
  accounts, 
  onSelectAccount, 
  onCreateAccount,
  loading = false
}) => {
  const [pin, setPin] = useState('');
  const [selectedAccount, setSelectedAccount] = useState<Account | null>(
    accounts.length > 0 ? accounts[0] : null
  );
  const [error, setError] = useState('');
  const [requiresPin, setRequiresPin] = useState(false);

  // When accounts change, update selected account
  useEffect(() => {
    if (accounts.length > 0 && !selectedAccount) {
      setSelectedAccount(accounts[0]);
    }
  }, [accounts, selectedAccount]);

  // Check if selected account requires a PIN
  useEffect(() => {
    if (selectedAccount) {
      setRequiresPin(selectedAccount.requireAuthentication === 'PIN');
      
      // If account doesn't require PIN, auto-login
      if (selectedAccount.requireAuthentication !== 'PIN' && !loading) {
        handleLogin();
      }
    }
  }, [selectedAccount]);

  const handleSelectAccount = (account: Account) => {
    setSelectedAccount(account);
    setError('');
    setPin('');
  };

  const handleLogin = () => {
    if (!selectedAccount) return;
    
    setError('');
    
    try {
      // If PIN is required but not provided, don't proceed
      if (requiresPin && !pin) {
        setError('PIN is required');
        return;
      }
      
      // Login with the selected account
      onSelectAccount(
        selectedAccount.did,
        requiresPin ? pin : undefined
      );
    } catch (error) {
      setError('Login failed');
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    handleLogin();
  };

  // Handle image source safely
  const getImageSource = (path?: string) => {
    if (!path) return undefined;
    return path.startsWith('http') || path.startsWith('data:') ? path : `file://${path}`;
  };

  return (
    <div className="flex flex-col h-full max-w-md mx-auto px-6 py-10">
      <div className="mb-8 text-center">
        <h1 className="text-3xl font-bold mb-4">Welcome Back</h1>
        <p className="text-gray-600">
          Choose your account to continue
        </p>
      </div>

      <div className="grid grid-cols-3 gap-4 mb-8">
        {accounts.map((account) => (
          <div
            key={account.did}
            className={`flex flex-col items-center p-3 rounded-lg cursor-pointer ${
              selectedAccount?.did === account.did ? 'bg-blue-50 border border-blue-300' : 'hover:bg-gray-50'
            }`}
            onClick={() => handleSelectAccount(account)}
          >
            <div className="w-16 h-16 rounded-full overflow-hidden bg-gray-200 mb-2">
              {account.pictureUrl ? (
                <img 
                  src={getImageSource(account.pictureUrl)} 
                  alt={account.name} 
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <BsPersonCircle className="w-12 h-12 text-gray-400" />
                </div>
              )}
            </div>
            <span className="text-sm font-medium text-center truncate w-full">
              {account.name}
            </span>
          </div>
        ))}
        
        <div
          className="flex flex-col items-center p-3 rounded-lg cursor-pointer hover:bg-gray-50"
          onClick={onCreateAccount}
        >
          <div className="w-16 h-16 rounded-full bg-blue-100 flex items-center justify-center mb-2">
            <FiPlus className="w-8 h-8 text-blue-600" />
          </div>
          <span className="text-sm font-medium text-blue-600">
            Add Account
          </span>
        </div>
      </div>

      {selectedAccount && requiresPin && (
        <form onSubmit={handleSubmit} className="bg-white rounded-lg p-6 shadow-sm border border-gray-200">
          <div className="flex items-center mb-4">
            <div className="w-10 h-10 rounded-full overflow-hidden bg-gray-200 mr-3">
              {selectedAccount.pictureUrl ? (
                <img 
                  src={getImageSource(selectedAccount.pictureUrl)} 
                  alt={selectedAccount.name} 
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <BsPersonCircle className="w-8 h-8 text-gray-400" />
                </div>
              )}
            </div>
            <div>
              <h3 className="font-semibold">{selectedAccount.name}</h3>
              <p className="text-xs text-gray-500">Enter your PIN to continue</p>
            </div>
          </div>
          
          <div className="mb-4">
            <div className="relative">
              <input
                type="password"
                value={pin}
                onChange={(e) => {
                  setPin(e.target.value);
                  setError('');
                }}
                placeholder="PIN"
                className={`w-full pl-10 pr-3 py-2 border ${error ? 'border-red-500' : 'border-gray-300'} rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500`}
                autoFocus
              />
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <FiLock className="text-gray-400" />
              </div>
            </div>
            {error && (
              <p className="text-red-500 text-sm mt-1">{error}</p>
            )}
          </div>
          
          <button 
            type="submit"
            className="w-full py-2 px-4 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
            disabled={!pin || loading}
          >
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>
      )}
    </div>
  );
};

export default AccountSelect;