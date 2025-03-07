import { useState } from 'react'
import { useTabs } from './TabContext'
import AddressBar from './AddressBar'

const TabBar: React.FC = () => {
  const { tabs, activeTab, addTab, closeTab, activateTab } = useTabs()
  const [showTabContextMenu, setShowTabContextMenu] = useState<string | null>(null)
  
  const handleAddTab = () => {
    addTab('about:blank')
  }
  
  const handleCloseTab = (tabId: string, event?: React.MouseEvent) => {
    if (event) {
      event.stopPropagation()
    }
    closeTab(tabId)
  }
  
  const handleContextMenu = (tabId: string, event: React.MouseEvent) => {
    event.preventDefault()
    setShowTabContextMenu(tabId)
    
    // Add a click handler to the document to close the context menu
    const clickHandler = () => {
      setShowTabContextMenu(null)
      document.removeEventListener('click', clickHandler)
    }
    document.addEventListener('click', clickHandler)
  }

  return (
    <div className="flex flex-col bg-gray-100 border-b border-gray-300">
      <div className="flex items-center">
        {/* Tabs list */}
        <div className="flex-1 flex overflow-x-auto no-scrollbar">
          {tabs.map(tab => (
            <div
              key={tab.id}
              className={`flex items-center min-w-[180px] max-w-[240px] h-10 px-3 relative 
                ${tab.isActive ? 'bg-white border-b-2 border-blue-500' : 'bg-gray-100 hover:bg-gray-200'}
                cursor-pointer`}
              onClick={() => activateTab(tab.id)}
              onContextMenu={(e) => handleContextMenu(tab.id, e)}
            >
              {/* Favicon */}
              <div className="w-4 h-4 mr-2 flex-shrink-0">
                {tab.favicon ? (
                  <img src={tab.favicon} alt="" className="w-full h-full" />
                ) : (
                  <div className="w-full h-full bg-gray-300 rounded-full"></div>
                )}
              </div>
              
              {/* Tab title */}
              <div className="flex-1 truncate text-sm">
                {tab.title || 'New Tab'}
              </div>
              
              {/* Close button */}
              <button
                className="ml-2 w-5 h-5 flex items-center justify-center rounded-full hover:bg-gray-300"
                onClick={(e) => handleCloseTab(tab.id, e)}
              >
                <svg width="12" height="12" viewBox="0 0 12 12">
                  <path
                    d="M 1,1 L 11,11 M 1,11 L 11,1"
                    stroke="currentColor"
                    strokeWidth="1.5"
                  />
                </svg>
              </button>
              
              {/* Tab context menu */}
              {showTabContextMenu === tab.id && (
                <div className="absolute top-full left-0 z-50 bg-white shadow-lg rounded py-1 w-48">
                  <button 
                    className="w-full text-left px-4 py-2 hover:bg-gray-100"
                    onClick={() => handleCloseTab(tab.id)}
                  >
                    Close Tab
                  </button>
                  <button 
                    className="w-full text-left px-4 py-2 hover:bg-gray-100"
                  >
                    Close Other Tabs
                  </button>
                </div>
              )}
            </div>
          ))}
          
          {/* New tab button */}
          <button
            className="flex items-center justify-center w-8 h-10 min-w-[32px] bg-gray-100 hover:bg-gray-200"
            onClick={handleAddTab}
          >
            <svg width="16" height="16" viewBox="0 0 16 16">
              <path d="M 8,2 L 8,14 M 2,8 L 14,8" stroke="currentColor" strokeWidth="1.5" />
            </svg>
          </button>
        </div>
      </div>
      
      {/* Address bar */}
      <AddressBar />
    </div>
  )
}

export default TabBar