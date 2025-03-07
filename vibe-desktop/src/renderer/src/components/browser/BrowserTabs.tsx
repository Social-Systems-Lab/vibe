import { useState, useEffect, useRef } from 'react'
import { useTabs, Tab } from './TabContext'
import TabBar from './TabBar'
import Browser from './Browser'

const BrowserTabs: React.FC = () => {
  const { tabs, activeTab, addTab } = useTabs()
  const [webviewPreloadPath, setWebviewPreloadPath] = useState<string>('')
  
  // Get the webview preload path on component mount
  useEffect(() => {
    const getPreloadPath = async () => {
      try {
        const path = await window.api.webview.getPreloadPath()
        setWebviewPreloadPath(path)
      } catch (error) {
        console.error('Error getting webview preload path:', error)
      }
    }
    
    getPreloadPath()
  }, [])
  
  // Add a new tab if there are none
  useEffect(() => {
    if (tabs.length === 0) {
      addTab('about:blank')
    }
  }, [tabs.length, addTab])

  return (
    <div className="flex flex-col h-full">
      <TabBar />
      <div className="flex-1 relative overflow-hidden">
        {tabs.map(tab => (
          <div
            key={tab.id}
            className={`absolute inset-0 ${tab.isActive ? 'block' : 'hidden'}`}
          >
            <Browser 
              tab={tab} 
              preloadPath={webviewPreloadPath}
            />
          </div>
        ))}
      </div>
    </div>
  )
}

export default BrowserTabs