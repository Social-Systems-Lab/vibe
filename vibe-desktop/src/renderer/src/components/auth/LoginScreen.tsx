import { useState, useEffect } from 'react'
import CreateAccount from './CreateAccount'

interface Account {
  did: string
  name: string
  pictureUrl?: string
  requireAuthentication: string
}

interface LoginScreenProps {
  onLogin: (account: Account) => void
}

const LoginScreen: React.FC<LoginScreenProps> = ({ onLogin }) => {
  const [accounts, setAccounts] = useState<Account[]>([])
  const [loading, setLoading] = useState<boolean>(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedAccount, setSelectedAccount] = useState<Account | null>(null)
  const [pin, setPin] = useState<string>('')
  const [loginError, setLoginError] = useState<string | null>(null)
  const [showCreateAccount, setShowCreateAccount] = useState<boolean>(false)
  
  // Load accounts on mount
  useEffect(() => {
    const loadAccounts = async () => {
      setLoading(true)
      try {
        const accountsList = await window.api.accounts.getAll()
        setAccounts(accountsList || [])
      } catch (err) {
        console.error('Error loading accounts:', err)
        setError('Failed to load accounts. Please try again.')
      } finally {
        setLoading(false)
      }
    }
    
    loadAccounts()
  }, [])
  
  const handleSelectAccount = (account: Account) => {
    setSelectedAccount(account)
    setPin('')
    setLoginError(null)
  }
  
  const handleLogin = async () => {
    if (!selectedAccount) return
    
    setLoginError(null)
    setLoading(true)
    
    try {
      const loggedInAccount = await window.api.accounts.login(
        selectedAccount.did,
        selectedAccount.requireAuthentication === 'PIN' ? pin : undefined
      )
      
      onLogin(loggedInAccount)
    } catch (err) {
      console.error('Login failed:', err)
      setLoginError('Login failed. Please check your PIN and try again.')
    } finally {
      setLoading(false)
    }
  }
  
  const handleCreateAccount = () => {
    setShowCreateAccount(true)
  }
  
  const handleAccountCreated = (newAccount: Account) => {
    setAccounts([...accounts, newAccount])
    setSelectedAccount(newAccount)
    setShowCreateAccount(false)
    
    // Auto-login to the new account
    onLogin(newAccount)
  }
  
  const handleCancelCreate = () => {
    setShowCreateAccount(false)
  }
  
  if (showCreateAccount) {
    return <CreateAccount onAccountCreated={handleAccountCreated} onCancel={handleCancelCreate} />
  }
  
  return (
    <div className="flex flex-col items-center justify-center h-full bg-gray-100">
      <div className="bg-white rounded-lg shadow-lg p-8 max-w-md w-full">
        <h1 className="text-2xl font-bold mb-6 text-center">Welcome to Vibe</h1>
        
        {loading && !showCreateAccount ? (
          <div className="text-center">Loading accounts...</div>
        ) : error ? (
          <div className="text-red-500 text-center">{error}</div>
        ) : accounts.length === 0 ? (
          <div className="text-center">
            <p className="mb-4">No accounts found. Create a new account to get started.</p>
            <button
              onClick={handleCreateAccount}
              className="bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded"
            >
              Create Account
            </button>
          </div>
        ) : (
          <>
            <div className="mb-6">
              <h2 className="text-lg font-semibold mb-2">Select an account</h2>
              <div className="grid grid-cols-1 gap-2">
                {accounts.map((account) => (
                  <div
                    key={account.did}
                    className={`flex items-center p-3 border rounded cursor-pointer ${
                      selectedAccount?.did === account.did
                        ? 'border-blue-500 bg-blue-50'
                        : 'border-gray-300 hover:bg-gray-50'
                    }`}
                    onClick={() => handleSelectAccount(account)}
                  >
                    <div className="w-10 h-10 bg-gray-200 rounded-full overflow-hidden mr-3">
                      {account.pictureUrl ? (
                        <img
                          src={account.pictureUrl}
                          alt={account.name}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-gray-500">
                          {account.name.charAt(0).toUpperCase()}
                        </div>
                      )}
                    </div>
                    <div className="flex-grow">
                      <div className="font-medium">{account.name}</div>
                      <div className="text-sm text-gray-500 truncate">{account.did}</div>
                    </div>
                  </div>
                ))}
              </div>
              
              <button
                onClick={handleCreateAccount}
                className="mt-4 text-blue-500 hover:text-blue-700 text-sm"
              >
                + Create a new account
              </button>
            </div>
            
            {selectedAccount && selectedAccount.requireAuthentication === 'PIN' && (
              <div className="mb-6">
                <label htmlFor="pin" className="block text-sm font-medium text-gray-700 mb-1">
                  Enter PIN
                </label>
                <input
                  type="password"
                  id="pin"
                  value={pin}
                  onChange={(e) => setPin(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Enter your PIN"
                  maxLength={6}
                />
              </div>
            )}
            
            {loginError && (
              <div className="text-red-500 text-sm mb-4">{loginError}</div>
            )}
            
            <button
              onClick={handleLogin}
              disabled={!selectedAccount || (selectedAccount.requireAuthentication === 'PIN' && !pin)}
              className={`w-full py-2 px-4 rounded font-medium ${
                !selectedAccount || (selectedAccount.requireAuthentication === 'PIN' && !pin)
                  ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                  : 'bg-blue-500 hover:bg-blue-600 text-white'
              }`}
            >
              {loading ? 'Logging in...' : 'Login'}
            </button>
          </>
        )}
      </div>
    </div>
  )
}

export default LoginScreen