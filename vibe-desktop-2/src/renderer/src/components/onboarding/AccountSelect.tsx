import React, { useState } from 'react';
import { FiPlus, FiLock } from 'react-icons/fi';
import { BsPersonCircle } from 'react-icons/bs';

interface Account {
  name: string;
  pictureUrl?: string;
}

interface AccountSelectProps {
  accounts: Account[];
  onSelectAccount: (account: Account) => void;
  onCreateAccount: () => void;
}

const AccountSelect: React.FC<AccountSelectProps> = ({ 
  accounts, 
  onSelectAccount, 
  onCreateAccount 
}) => {
  const [password, setPassword] = useState('');
  const [selectedAccount, setSelectedAccount] = useState<Account | null>(
    accounts.length > 0 ? accounts[0] : null
  );
  const [error, setError] = useState('');
  const [loggingIn, setLoggingIn] = useState(false);

  const handleSelectAccount = (account: Account) => {
    setSelectedAccount(account);
    setError('');
    setPassword('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedAccount) return;
    
    setError('');
    setLoggingIn(true);
    
    try {
      // This will be handled by the parent component
      onSelectAccount({
        ...selectedAccount,
        password
      } as any);
    } catch (error) {
      setError('Incorrect password');
      setLoggingIn(false);
    }
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
            key={account.name}
            className={`flex flex-col items-center p-3 rounded-lg cursor-pointer ${
              selectedAccount?.name === account.name ? 'bg-blue-50 border border-blue-300' : 'hover:bg-gray-50'
            }`}
            onClick={() => handleSelectAccount(account)}
          >
            <div className="w-16 h-16 rounded-full overflow-hidden bg-gray-200 mb-2">
              {account.pictureUrl ? (
                <img 
                  src={`file://${account.pictureUrl}`} 
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

      {selectedAccount && (
        <form onSubmit={handleSubmit} className="bg-white rounded-lg p-6 shadow-sm border border-gray-200">
          <div className="flex items-center mb-4">
            <div className="w-10 h-10 rounded-full overflow-hidden bg-gray-200 mr-3">
              {selectedAccount.pictureUrl ? (
                <img 
                  src={`file://${selectedAccount.pictureUrl}`} 
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
              <p className="text-xs text-gray-500">Enter your password to continue</p>
            </div>
          </div>
          
          <div className="mb-4">
            <div className="relative">
              <input
                type="password"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  setError('');
                }}
                placeholder="Password"
                className={`input-field pl-10 ${error ? 'border-red-500' : ''}`}
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
            className="btn-primary w-full py-2"
            disabled={!password || loggingIn}
          >
            {loggingIn ? 'Signing in...' : 'Sign In'}
          </button>
        </form>
      )}
    </div>
  );
};

export default AccountSelect;