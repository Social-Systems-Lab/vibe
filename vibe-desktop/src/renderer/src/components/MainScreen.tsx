import { useState, useEffect, useRef } from 'react'
import BrowserTabs from './browser/BrowserTabs'
import Sidebar from './sidebar/Sidebar'
import { TabProvider } from './browser/TabContext'

interface Account {
  did: string
  name: string
  pictureUrl?: string
  requireAuthentication: string
}

interface MainScreenProps {
  account: Account
  onLogout: () => void
}

const MainScreen: React.FC<MainScreenProps> = ({ account, onLogout }) => {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [installedApps, setInstalledApps] = useState<any[]>([])

  // Load installed apps
  useEffect(() => {
    const loadApps = async () => {
      try {
        const apps = await window.api.apps.getInstalledApps(account.did)
        setInstalledApps(apps || [])
      } catch (error) {
        console.error('Error loading apps:', error)
      }
    }

    loadApps()
  }, [account.did])

  // Set up database connection
  useEffect(() => {
    const setupDatabase = async () => {
      try {
        // Get the database name for this account
        const dbName = await window.api.db.getDbNameFromDid(account.did)
        
        // Open the database
        const result = await window.api.db.open(dbName)
        
        if (!result.success) {
          console.error('Failed to open database:', result.error)
        }
      } catch (error) {
        console.error('Error setting up database:', error)
      }
    }

    setupDatabase()

    // Clean up database connection when unmounting
    return () => {
      window.api.db.close().catch(console.error)
    }
  }, [account.did])

  const toggleSidebar = () => {
    setSidebarCollapsed(!sidebarCollapsed)
  }

  return (
    <TabProvider>
      <div className="flex h-full">
        <Sidebar 
          account={account} 
          collapsed={sidebarCollapsed} 
          onToggle={toggleSidebar}
          installedApps={installedApps}
          onLogout={onLogout}
        />
        <div className="flex-1 overflow-hidden">
          <BrowserTabs />
        </div>
      </div>
    </TabProvider>
  )
}

export default MainScreen