import { useState, useEffect } from 'react'
import TitleBar from './components/TitleBar'
import LoginScreen from './components/auth/LoginScreen'
import MainScreen from './components/MainScreen'

function App(): JSX.Element {
  const [isLoggedIn, setIsLoggedIn] = useState<boolean>(false)
  const [currentAccount, setCurrentAccount] = useState<any>(null)

  // Check if there's a logged in account on startup
  useEffect(() => {
    // This would typically load from session storage or similar
    // For now, we'll just check if there are accounts
    const checkAccounts = async () => {
      try {
        const accounts = await window.api.accounts.getAll()
        if (accounts && accounts.length > 0) {
          // We have accounts, but not logged in yet
          console.log(`Found ${accounts.length} accounts`)
        }
      } catch (error) {
        console.error('Error checking accounts:', error)
      }
    }

    checkAccounts()
  }, [])

  const handleLogin = (account: any) => {
    setCurrentAccount(account)
    setIsLoggedIn(true)
  }

  const handleLogout = () => {
    setCurrentAccount(null)
    setIsLoggedIn(false)
  }

  return (
    <div className="flex flex-col h-full">
      <TitleBar />
      <div className="flex-1 overflow-hidden">
        {isLoggedIn ? (
          <MainScreen account={currentAccount} onLogout={handleLogout} />
        ) : (
          <LoginScreen onLogin={handleLogin} />
        )}
      </div>
    </div>
  )
}

export default App
