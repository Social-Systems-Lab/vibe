import { useState, useEffect } from 'react'

/**
 * TitleBar component for the window controls
 * This is used for the frameless window to provide minimize, maximize, and close buttons
 */
const TitleBar: React.FC = () => {
  const [isMaximized, setIsMaximized] = useState(false)

  useEffect(() => {
    // Check if window is maximized on load
    const checkMaximized = async (): Promise<void> => {
      const maximized = await window.api.window.isMaximized()
      setIsMaximized(maximized)
    }
    checkMaximized()
  }, [])

  const handleMinimize = (): void => {
    window.api.window.minimize()
  }

  const handleMaximize = async (): Promise<void> => {
    await window.api.window.maximize()
    // Update state after window is maximized/restored
    const maximized = await window.api.window.isMaximized()
    setIsMaximized(maximized)
  }

  const handleClose = (): void => {
    window.api.window.close()
  }

  return (
    <div className="flex justify-between items-center bg-gray-800 text-white h-10 select-none">
      <div className="px-4 py-2 flex items-center">
        <span className="font-semibold">Vibe Desktop</span>
      </div>
      <div className="flex">
        <button
          className="px-4 py-2 hover:bg-gray-700 focus:outline-none"
          onClick={handleMinimize}
          aria-label="Minimize"
        >
          <svg width="12" height="12" viewBox="0 0 12 12">
            <rect width="10" height="1" x="1" y="6" />
          </svg>
        </button>
        <button
          className="px-4 py-2 hover:bg-gray-700 focus:outline-none"
          onClick={handleMaximize}
          aria-label={isMaximized ? 'Restore' : 'Maximize'}
        >
          {isMaximized ? (
            <svg width="12" height="12" viewBox="0 0 12 12">
              <path d="M3,3 v6 h6 v-6 h-6 M2,2 h8 v8 h-8 v-8 z" />
            </svg>
          ) : (
            <svg width="12" height="12" viewBox="0 0 12 12">
              <path d="M2,2 v8 h8 v-8 h-8 z" />
            </svg>
          )}
        </button>
        <button
          className="px-4 py-2 hover:bg-red-600 focus:outline-none"
          onClick={handleClose}
          aria-label="Close"
        >
          <svg width="12" height="12" viewBox="0 0 12 12">
            <path d="M1,1 l10,10 M1,11 l10,-10" stroke="currentColor" strokeWidth="1.5" />
          </svg>
        </button>
      </div>
    </div>
  )
}

export default TitleBar