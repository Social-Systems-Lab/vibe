import { useState, useEffect, useRef } from 'react'
import { useTabs, Tab } from './TabContext'

interface BrowserProps {
  tab: Tab
  preloadPath: string
}

const Browser: React.FC<BrowserProps> = ({ tab, preloadPath }) => {
  const { updateTab } = useTabs()
  const webviewRef = useRef<Electron.WebviewTag | null>(null)
  const [isLoading, setIsLoading] = useState<boolean>(true)
  
  // Handle WebView events
  useEffect(() => {
    const webview = webviewRef.current
    if (!webview) return
    
    const handleDidStartLoading = () => {
      setIsLoading(true)
      updateTab(tab.id, { isLoading: true })
    }
    
    const handleDidStopLoading = () => {
      setIsLoading(false)
      updateTab(tab.id, { isLoading: false })
    }
    
    const handlePageTitleUpdated = (e: Electron.PageTitleUpdatedEvent) => {
      updateTab(tab.id, { title: e.title })
    }
    
    const handlePageFaviconUpdated = (e: Electron.PageFaviconUpdatedEvent) => {
      if (e.favicons && e.favicons.length > 0) {
        updateTab(tab.id, { favicon: e.favicons[0] })
      }
    }
    
    const handleDidNavigate = (e: Electron.DidNavigateEvent) => {
      updateTab(tab.id, { url: e.url })
    }
    
    // Register event listeners
    webview.addEventListener('did-start-loading', handleDidStartLoading)
    webview.addEventListener('did-stop-loading', handleDidStopLoading)
    webview.addEventListener('page-title-updated', handlePageTitleUpdated)
    webview.addEventListener('page-favicon-updated', handlePageFaviconUpdated)
    webview.addEventListener('did-navigate', handleDidNavigate)
    webview.addEventListener('did-navigate-in-page', handleDidNavigate)
    
    // Set up Vibe SDK permissions handling here...
    // This would include handling webview-init-request, webview-read-request, etc.
    
    // Clean up event listeners on unmount
    return () => {
      webview.removeEventListener('did-start-loading', handleDidStartLoading)
      webview.removeEventListener('did-stop-loading', handleDidStopLoading)
      webview.removeEventListener('page-title-updated', handlePageTitleUpdated)
      webview.removeEventListener('page-favicon-updated', handlePageFaviconUpdated)
      webview.removeEventListener('did-navigate', handleDidNavigate)
      webview.removeEventListener('did-navigate-in-page', handleDidNavigate)
    }
  }, [tab.id, updateTab])
  
  // Watch for tab URL changes
  useEffect(() => {
    const webview = webviewRef.current
    if (!webview) return
    
    if (tab.url && webview.src !== tab.url) {
      webview.src = tab.url
    }
  }, [tab.url])
  
  // Watch for tab reload
  useEffect(() => {
    const webview = webviewRef.current
    if (!webview) return
    
    if (tab.reload) {
      webview.reload()
    }
  }, [tab.reload])
  
  return (
    <div className="h-full relative bg-white">
      {/* Loading indicator */}
      {isLoading && (
        <div className="absolute top-0 left-0 right-0 h-0.5 overflow-hidden">
          <div className="h-full bg-blue-500 animate-pulse w-full"></div>
        </div>
      )}
      
      {/* WebView */}
      <webview
        ref={webviewRef}
        src={tab.url}
        className="w-full h-full border-none"
        preload={preloadPath}
        allowpopups="true"
        webpreferences="contextIsolation=yes"
      ></webview>
    </div>
  )
}

export default Browser