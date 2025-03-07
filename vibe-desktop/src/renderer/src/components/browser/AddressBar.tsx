import { useState, useEffect, useRef } from 'react'
import { useTabs } from './TabContext'

const AddressBar: React.FC = () => {
  const { activeTab, updateTabUrl, reloadTab } = useTabs()
  const [url, setUrl] = useState<string>('')
  const [isEditing, setIsEditing] = useState<boolean>(false)
  const inputRef = useRef<HTMLInputElement>(null)
  
  // Update the URL input when the active tab changes
  useEffect(() => {
    if (activeTab) {
      setUrl(activeTab.url)
    } else {
      setUrl('')
    }
  }, [activeTab])
  
  const handleUrlChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setUrl(event.target.value)
  }
  
  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault()
    
    // Process the URL
    let processedUrl = url.trim()
    
    // Add https:// if no protocol is specified
    if (processedUrl && !processedUrl.match(/^[a-zA-Z]+:\/\//)) {
      // Check if it's a valid URL or domain
      const domainRegex = /^([a-zA-Z0-9]([a-zA-Z0-9\-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}$/i
      
      if (domainRegex.test(processedUrl)) {
        processedUrl = `https://${processedUrl}`
      } else if (!processedUrl.startsWith('about:')) {
        // If not a domain and not an internal URL, try a search
        processedUrl = `https://www.google.com/search?q=${encodeURIComponent(processedUrl)}`
      }
    }
    
    if (activeTab) {
      updateTabUrl(activeTab.id, processedUrl)
    }
    
    setIsEditing(false)
  }
  
  const handleFocus = () => {
    setIsEditing(true)
    // Select all text when focusing
    inputRef.current?.select()
  }
  
  const handleBlur = () => {
    // Only leave edit mode if there's no active typing
    setIsEditing(false)
    
    // Reset URL to tab's URL if user didn't submit
    if (activeTab) {
      setUrl(activeTab.url)
    }
  }
  
  const handleReload = () => {
    if (activeTab) {
      reloadTab(activeTab.id)
    }
  }

  return (
    <div className="flex items-center px-2 py-1">
      <div className="flex items-center space-x-2 mr-2">
        <button 
          className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-200"
          onClick={handleReload}
          title="Reload"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path 
              d="M14 8.00001C14 11.3137 11.3137 14 8 14C4.68629 14 2 11.3137 2 8.00001C2 4.6863 4.68629 2 8 2C9.5 2 10.5 2.5 11.5 3.5" 
              stroke="currentColor" 
              strokeWidth="1.5" 
              strokeLinecap="round" 
            />
            <path d="M12 1V4H15" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </div>
      
      <form 
        className="flex-1 bg-white rounded-full border border-gray-300 overflow-hidden focus-within:border-blue-500 focus-within:ring-1 focus-within:ring-blue-500"
        onSubmit={handleSubmit}
      >
        <div className="flex items-center px-3 py-1">
          {/* Site info / lock icon */}
          <div className="mr-2 text-gray-500">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path 
                d="M4 7V5C4 2.79086 5.79086 1 8 1V1C10.2091 1 12 2.79086 12 5V7" 
                stroke="currentColor" 
                strokeWidth="1.5" 
                strokeLinecap="round" 
              />
              <rect 
                x="3" 
                y="7" 
                width="10" 
                height="8" 
                rx="1" 
                stroke="currentColor" 
                strokeWidth="1.5" 
              />
            </svg>
          </div>
          
          {/* URL input */}
          <input
            ref={inputRef}
            type="text"
            className="flex-1 py-1 outline-none"
            value={url}
            onChange={handleUrlChange}
            onFocus={handleFocus}
            onBlur={handleBlur}
            placeholder="Search or enter website name"
          />
        </div>
      </form>
      
      <div className="ml-2 space-x-1">
        {/* Additional buttons like bookmarks can go here */}
      </div>
    </div>
  )
}

export default AddressBar