import React, { useState } from 'react';
import { FiX } from 'react-icons/fi';
import { Tab } from '../atoms';
import { useTabs } from './tab-context';

interface TabSwitcherProps {
  onClose: () => void;
}

const TabSwitcher: React.FC<TabSwitcherProps> = ({ onClose }) => {
  const { tabs, activeTabId, setActiveTabById, closeTab } = useTabs();
  const [highlightedTabId, setHighlightedTabId] = useState<string | null>(activeTabId);

  const handleTabClick = (tabId: string) => {
    setActiveTabById(tabId);
    onClose();
  };

  const handleTabClose = (e: React.MouseEvent, tabId: string) => {
    e.stopPropagation();
    closeTab(tabId);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      onClose();
      return;
    }

    // Arrow key navigation
    if (!highlightedTabId || tabs.length === 0) return;

    const currentIndex = tabs.findIndex(tab => tab.id === highlightedTabId);
    
    if (e.key === 'ArrowRight') {
      const nextIndex = (currentIndex + 1) % tabs.length;
      setHighlightedTabId(tabs[nextIndex].id);
    } else if (e.key === 'ArrowLeft') {
      const prevIndex = (currentIndex - 1 + tabs.length) % tabs.length;
      setHighlightedTabId(tabs[prevIndex].id);
    } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      // Assuming a 3-column grid
      const columnsPerRow = 3;
      const currentRow = Math.floor(currentIndex / columnsPerRow);
      const currentCol = currentIndex % columnsPerRow;
      const totalRows = Math.ceil(tabs.length / columnsPerRow);

      let newRow = currentRow;
      if (e.key === 'ArrowUp') {
        newRow = (currentRow - 1 + totalRows) % totalRows;
      } else {
        newRow = (currentRow + 1) % totalRows;
      }

      const newIndex = (newRow * columnsPerRow) + currentCol;
      if (newIndex < tabs.length) {
        setHighlightedTabId(tabs[newIndex].id);
      } else {
        // If the calculated position doesn't exist (e.g., bottom-right of an incomplete grid)
        // Just use the last tab in that row or the last tab overall
        const lastInRowIndex = Math.min((newRow + 1) * columnsPerRow - 1, tabs.length - 1);
        setHighlightedTabId(tabs[lastInRowIndex].id);
      }
    } else if (e.key === 'Enter') {
      handleTabClick(highlightedTabId);
    }
  };

  return (
    <div 
      className="fixed inset-0 bg-black bg-opacity-75 z-50 flex items-center justify-center"
      onClick={onClose}
      onKeyDown={handleKeyDown}
      tabIndex={0}
    >
      <div 
        className="bg-white rounded-lg p-6 w-4/5 max-w-4xl max-h-[90vh] overflow-auto"
        onClick={e => e.stopPropagation()}
      >
        <h2 className="text-xl font-bold mb-4">Tabs</h2>
        
        <div className="grid grid-cols-3 gap-4">
          {tabs.map(tab => (
            <div 
              key={tab.id} 
              className={`
                cursor-pointer p-2 rounded-lg border-2 transition-all
                ${tab.id === highlightedTabId ? 'border-blue-500 shadow-lg' : 'border-gray-200 hover:border-blue-300'}
                ${tab.id === activeTabId ? 'bg-blue-50' : 'bg-white'}
              `}
              onClick={() => handleTabClick(tab.id)}
              onMouseEnter={() => setHighlightedTabId(tab.id)}
            >
              <div className="relative">
                {/* Tab screenshot or placeholder */}
                <div 
                  className="w-full h-32 bg-gray-100 rounded overflow-hidden mb-2 flex items-center justify-center"
                >
                  {tab.screenshot ? (
                    <img 
                      src={tab.screenshot} 
                      alt={tab.title} 
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="text-gray-400 text-center">
                      <div className="font-medium">{tab.title}</div>
                      <div className="text-xs">{tab.url}</div>
                    </div>
                  )}
                </div>
                
                {/* Close button */}
                <button 
                  className="absolute top-1 right-1 bg-black bg-opacity-50 text-white rounded-full w-6 h-6 flex items-center justify-center hover:bg-opacity-70"
                  onClick={(e) => handleTabClose(e, tab.id)}
                >
                  <FiX size={14} />
                </button>
              </div>
              
              {/* Tab info */}
              <div className="truncate font-medium">{tab.title}</div>
              <div className="text-xs text-gray-500 truncate">{tab.url}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default TabSwitcher;