import React, { useState } from 'react';
import { BiServer, BiCheckCircle } from 'react-icons/bi';
import { FaServer } from 'react-icons/fa';

interface ServerSetupProps {
  onNext: (server: { url: string; name: string }) => void;
  onBack: () => void;
}

const ServerSetup: React.FC<ServerSetupProps> = ({ onNext, onBack }) => {
  const [serverOption, setServerOption] = useState<'official' | 'custom'>('official');
  const [customServerUrl, setCustomServerUrl] = useState('');
  const [customServerName, setCustomServerName] = useState('');
  const [urlError, setUrlError] = useState('');
  
  const handleContinue = () => {
    if (serverOption === 'official') {
      onNext({
        url: 'https://api.vibeapp.dev',
        name: 'Vibe Cloud',
      });
    } else {
      // Validate URL
      if (!customServerUrl) {
        setUrlError('Server URL is required');
        return;
      }
      
      try {
        const url = new URL(customServerUrl);
        if (url.protocol !== 'http:' && url.protocol !== 'https:') {
          setUrlError('URL must use http or https protocol');
          return;
        }
        
        onNext({
          url: customServerUrl,
          name: customServerName || 'Custom Server',
        });
      } catch (e) {
        setUrlError('Please enter a valid URL');
      }
    }
  };

  return (
    <div className="flex flex-col h-full max-w-md mx-auto px-6 py-10">
      <div className="mb-8">
        <button 
          onClick={onBack}
          className="text-blue-600 hover:text-blue-800 flex items-center"
        >
          ← Back
        </button>
        <h1 className="text-2xl font-bold mt-4 mb-2">Choose Your Server</h1>
        <p className="text-gray-600">
          Vibe needs a server to connect with others. You can use the official Vibe Cloud or your own server.
        </p>
      </div>

      <div className="space-y-4 mb-8">
        <div 
          className={`border rounded-lg p-4 cursor-pointer flex items-start ${
            serverOption === 'official' ? 'border-blue-500 bg-blue-50' : 'border-gray-200'
          }`}
          onClick={() => setServerOption('official')}
        >
          <div className="flex-shrink-0 w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center mr-3">
            <BiServer className="text-blue-600 w-5 h-5" />
          </div>
          <div className="flex-1">
            <div className="flex justify-between">
              <h3 className="font-semibold text-gray-900">Vibe Cloud</h3>
              {serverOption === 'official' && (
                <BiCheckCircle className="text-blue-600 w-5 h-5" />
              )}
            </div>
            <p className="text-sm text-gray-600 mt-1">
              The official Vibe server. Easy to use and ready to go.
            </p>
          </div>
        </div>

        <div 
          className={`border rounded-lg p-4 cursor-pointer flex items-start ${
            serverOption === 'custom' ? 'border-blue-500 bg-blue-50' : 'border-gray-200'
          }`}
          onClick={() => setServerOption('custom')}
        >
          <div className="flex-shrink-0 w-10 h-10 bg-purple-100 rounded-full flex items-center justify-center mr-3">
            <FaServer className="text-purple-600 w-4 h-4" />
          </div>
          <div className="flex-1">
            <div className="flex justify-between">
              <h3 className="font-semibold text-gray-900">Custom Server</h3>
              {serverOption === 'custom' && (
                <BiCheckCircle className="text-blue-600 w-5 h-5" />
              )}
            </div>
            <p className="text-sm text-gray-600 mt-1">
              Connect to your own server or a trusted provider.
            </p>
          </div>
        </div>
      </div>

      {serverOption === 'custom' && (
        <div className="space-y-4 mb-8 bg-gray-50 p-4 rounded-lg">
          <div>
            <label htmlFor="serverUrl" className="block text-sm font-medium text-gray-700 mb-1">
              Server URL
            </label>
            <input
              id="serverUrl"
              type="text"
              value={customServerUrl}
              onChange={(e) => {
                setCustomServerUrl(e.target.value);
                setUrlError('');
              }}
              placeholder="https://my-vibe-server.com"
              className={`input-field ${urlError ? 'border-red-500' : ''}`}
            />
            {urlError && (
              <div className="text-red-500 text-sm mt-1">{urlError}</div>
            )}
          </div>
          
          <div>
            <label htmlFor="serverName" className="block text-sm font-medium text-gray-700 mb-1">
              Server Name (Optional)
            </label>
            <input
              id="serverName"
              type="text"
              value={customServerName}
              onChange={(e) => setCustomServerName(e.target.value)}
              placeholder="My Server"
              className="input-field"
            />
          </div>
        </div>
      )}
      
      <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-6">
        <p className="text-sm text-yellow-800">
          <strong>Note:</strong> You can change your server settings later in the app preferences.
        </p>
      </div>

      <div className="mt-auto">
        <button 
          onClick={handleContinue}
          className="btn-primary w-full py-3"
        >
          Continue
        </button>
      </div>
    </div>
  );
};

export default ServerSetup;