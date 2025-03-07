import { useState } from 'react'
import { useTabs } from '../browser/TabContext'

interface Account {
  did: string
  name: string
  pictureUrl?: string
}

interface InstalledApp {
  appId: string
  name: string
  description: string
  pictureUrl?: string
  url: string
  hidden?: boolean
  pinned?: boolean
}

interface SidebarProps {
  account: Account
  collapsed: boolean
  onToggle: () => void
  installedApps: InstalledApp[]
  onLogout: () => void
}

const Sidebar: React.FC<SidebarProps> = ({ 
  account, 
  collapsed, 
  onToggle,
  installedApps,
  onLogout
}) => {
  const { addTab } = useTabs()
  const [showAccountMenu, setShowAccountMenu] = useState<boolean>(false)
  
  const handleOpenApp = (app: InstalledApp) => {
    addTab(app.url)
  }
  
  const visibleApps = installedApps.filter(app => !app.hidden)
  const pinnedApps = visibleApps.filter(app => app.pinned)
  const unpinnedApps = visibleApps.filter(app => !app.pinned)
  
  const toggleAccountMenu = () => {
    setShowAccountMenu(!showAccountMenu)
  }
  
  const handleLogout = () => {
    setShowAccountMenu(false)
    onLogout()
  }

  return (
    <div className={`bg-gray-800 text-white flex flex-col ${collapsed ? 'w-16' : 'w-64'} transition-all duration-300 ease-in-out`}>
      {/* Header with account info */}
      <div className="relative">
        <div 
          className="p-4 flex items-center cursor-pointer hover:bg-gray-700"
          onClick={toggleAccountMenu}
        >
          <div className="w-8 h-8 rounded-full bg-blue-500 overflow-hidden mr-3 flex-shrink-0">
            {account.pictureUrl ? (
              <img 
                src={account.pictureUrl} 
                alt={account.name} 
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center">
                {account.name.charAt(0).toUpperCase()}
              </div>
            )}
          </div>
          
          {!collapsed && (
            <div className="truncate">
              <div className="font-medium">{account.name}</div>
              <div className="text-xs text-gray-400 truncate">{account.did}</div>
            </div>
          )}
        </div>
        
        {/* Account dropdown menu */}
        {showAccountMenu && (
          <div className="absolute top-full left-0 w-full z-50 bg-gray-700 shadow-lg">
            <button 
              className="w-full text-left px-4 py-2 hover:bg-gray-600 text-sm"
              onClick={handleLogout}
            >
              Logout
            </button>
          </div>
        )}
      </div>
      
      {/* Collapse button */}
      <div className="p-2 border-b border-gray-700">
        <button 
          onClick={onToggle}
          className="w-full flex items-center justify-center p-2 hover:bg-gray-700 rounded"
        >
          {collapsed ? (
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M10 3L15 8L10 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M1 8H15" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          ) : (
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M6 13L1 8L6 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M15 8H1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          )}
        </button>
      </div>
      
      {/* App list */}
      <div className="flex-1 overflow-y-auto">
        {/* Pinned apps section */}
        {pinnedApps.length > 0 && (
          <div className="pt-2">
            {!collapsed && (
              <div className="px-4 py-1 text-xs font-semibold text-gray-400 uppercase">
                Pinned Apps
              </div>
            )}
            
            <div className="px-2">
              {pinnedApps.map(app => (
                <button
                  key={app.appId}
                  className={`flex items-center w-full rounded p-2 my-1 hover:bg-gray-700 text-left ${
                    collapsed ? 'justify-center' : ''
                  }`}
                  onClick={() => handleOpenApp(app)}
                >
                  <div className="w-8 h-8 rounded bg-gray-600 flex items-center justify-center overflow-hidden">
                    {app.pictureUrl ? (
                      <img src={app.pictureUrl} alt={app.name} className="w-full h-full object-cover" />
                    ) : (
                      <span>{app.name.charAt(0).toUpperCase()}</span>
                    )}
                  </div>
                  
                  {!collapsed && (
                    <div className="ml-3 truncate">
                      {app.name}
                    </div>
                  )}
                </button>
              ))}
            </div>
          </div>
        )}
        
        {/* Other apps section */}
        {unpinnedApps.length > 0 && (
          <div className="pt-4">
            {!collapsed && (
              <div className="px-4 py-1 text-xs font-semibold text-gray-400 uppercase">
                Apps
              </div>
            )}
            
            <div className="px-2">
              {unpinnedApps.map(app => (
                <button
                  key={app.appId}
                  className={`flex items-center w-full rounded p-2 my-1 hover:bg-gray-700 text-left ${
                    collapsed ? 'justify-center' : ''
                  }`}
                  onClick={() => handleOpenApp(app)}
                >
                  <div className="w-8 h-8 rounded bg-gray-600 flex items-center justify-center overflow-hidden">
                    {app.pictureUrl ? (
                      <img src={app.pictureUrl} alt={app.name} className="w-full h-full object-cover" />
                    ) : (
                      <span>{app.name.charAt(0).toUpperCase()}</span>
                    )}
                  </div>
                  
                  {!collapsed && (
                    <div className="ml-3 truncate">
                      {app.name}
                    </div>
                  )}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
      
      {/* Footer actions */}
      <div className="p-2 border-t border-gray-700">
        <button 
          className={`flex items-center w-full rounded p-2 hover:bg-gray-700 ${
            collapsed ? 'justify-center' : ''
          }`}
          onClick={() => addTab('about:blank')}
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path d="M8 1V15" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            <path d="M1 8H15" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
          
          {!collapsed && (
            <span className="ml-3">New Tab</span>
          )}
        </button>
      </div>
    </div>
  )
}

export default Sidebar