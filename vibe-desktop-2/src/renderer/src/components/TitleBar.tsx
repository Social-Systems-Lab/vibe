import React from 'react';
import { VscChromeMaximize, VscChromeMinimize, VscChromeClose } from 'react-icons/vsc';

const TitleBar: React.FC = () => {
  const handleMinimize = () => {
    window.electron.minimizeWindow();
  };

  const handleMaximize = () => {
    window.electron.maximizeWindow();
  };

  const handleClose = () => {
    window.electron.closeWindow();
  };

  return (
    <div className="title-bar">
      <div className="flex-grow">
        <span className="ml-2 text-sm font-medium text-gray-700">Vibe</span>
      </div>
      
      <div className="flex [app-region:none] self-start">
        <button 
          className="window-control-btn"
          aria-label="Minimize Window"
          onClick={handleMinimize}
        >
          <VscChromeMinimize />
        </button>

        <button
          className="window-control-btn"
          aria-label="Maximize Window"
          onClick={handleMaximize}
        >
          <VscChromeMaximize />
        </button>

        <button
          className="window-close-btn"
          aria-label="Close Window"
          onClick={handleClose}
        >
          <VscChromeClose />
        </button>
      </div>
    </div>
  );
};

export default TitleBar;