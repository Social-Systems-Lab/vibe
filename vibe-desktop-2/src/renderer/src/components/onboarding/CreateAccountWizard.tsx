// CreateAccountWizard.tsx - Wizard for creating a new account
// For vibe-desktop-2, adaptation of vibe-app/app/accounts/create-account-wizard.tsx

import React, { useState, useEffect } from 'react';
import { 
  FiUser, FiCloud, FiServer, FiGrid, FiCheck,
  FiArrowLeft, FiArrowRight, FiUpload, FiLock, FiDatabase 
} from 'react-icons/fi';
import { useAuth } from '../auth/auth-context';
import { useDb } from '../db/db-context';
import { ServerConfig, InstalledApp } from '../auth/auth-context';

// Define the wizard steps
type WizardStep = 
  | 'intro-welcome' 
  | 'intro-privacy' 
  | 'intro-data' 
  | 'profile-setup' 
  | 'server-setup' 
  | 'app-selection' 
  | 'complete';

// Force showing welcome screens during development
const FORCE_ALWAYS_SHOW_WELCOME = false;

interface CreateAccountWizardProps {
  onComplete: () => void;
  onBack?: () => void;
}

export const CreateAccountWizard: React.FC<CreateAccountWizardProps> = ({ onComplete, onBack }) => {
  const { createAccount, accounts, addOrUpdateApp } = useAuth();
  const { write } = useDb();

  // State variables
  const [initialStep, setInitialStep] = useState<WizardStep>('intro-welcome');
  const [currentStep, setCurrentStep] = useState<WizardStep | null>(null);
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [profilePicture, setProfilePicture] = useState<string | undefined>(undefined);
  const [loading, setLoading] = useState(false);
  const [selectedApps, setSelectedApps] = useState<string[]>(['dev.vibeapp.contacts']);
  
  // Server configuration options
  const [serverOption, setServerOption] = useState<'official' | 'custom'>('official');
  const [serverUrl, setServerUrl] = useState('');
  const [serverName, setServerName] = useState('');
  const [checkingServer, setCheckingServer] = useState(false);
  const [serverConnected, setServerConnected] = useState(false);
  
  // Official server details
  const OFFICIAL_SERVER_URL = 'https://cloud.vibeapp.dev';
  const OFFICIAL_SERVER_NAME = 'Official Vibe Cloud';

  // Predefined apps
  const availableApps: InstalledApp[] = [
    {
      appId: 'dev.vibeapp.contacts',
      name: 'Contacts',
      description: 'Manage your contacts with self-sovereign storage',
      pictureUrl: 'https://vibeapp.dev/apps/contacts/icon.png',
      url: 'https://vibeapp.dev/apps/contacts',
      permissions: {
        'read.contacts': 'always',
        'write.contacts': 'always',
      },
      hidden: false,
    },
  ];

  // Profile picture selection
  const handleProfilePictureSelect = async () => {
    try {
      const result = await window.electron.selectImage();
      if (result) {
        setProfilePicture(result);
      }
    } catch (error) {
      console.error('Error selecting image:', error);
    }
  };

  // Validate profile step inputs
  const validateProfileStep = () => {
    if (!name.trim()) {
      return false;
    }

    // Only validate password if we're using password authentication
    if (name && password && confirmPassword !== password) {
      setPasswordError('Passwords do not match');
      return false;
    } else {
      setPasswordError(null);
    }

    return true;
  };

  // Go to next step
  const handleNext = () => {
    const allSteps: WizardStep[] = [
      'intro-welcome', 
      'intro-privacy', 
      'intro-data', 
      'profile-setup', 
      'server-setup', 
      'app-selection', 
      'complete'
    ];
    
    // For non-first accounts or when not forced, skip the intro steps
    const steps = FORCE_ALWAYS_SHOW_WELCOME || accounts.length === 0 
      ? allSteps 
      : allSteps.filter(step => !step.startsWith('intro-'));

    if (!currentStep) return;
    
    // Profile step validation
    if (currentStep === 'profile-setup') {
      if (!validateProfileStep()) {
        return;
      }
    }
    
    // Server setup step validation
    if (currentStep === 'server-setup' && serverOption === 'custom') {
      // Validate custom server configuration
      if (!serverUrl.trim()) {
        alert('Please enter a server URL');
        return;
      }
      
      // If not connected, ask if they want to proceed anyway
      if (!serverConnected) {
        if (!window.confirm('Server connection not verified. Continue anyway?')) {
          return;
        }
      }
    }
    
    const currentIndex = steps.indexOf(currentStep);
    if (currentIndex < steps.length - 1) {
      setCurrentStep(steps[currentIndex + 1]);
    }
  };

  // Go to previous step
  const handleBack = () => {
    const allSteps: WizardStep[] = [
      'intro-welcome', 
      'intro-privacy', 
      'intro-data', 
      'profile-setup', 
      'server-setup', 
      'app-selection', 
      'complete'
    ];
    
    // For non-first accounts or when not forced, skip the intro steps
    const steps = FORCE_ALWAYS_SHOW_WELCOME || accounts.length === 0 
      ? allSteps 
      : allSteps.filter(step => !step.startsWith('intro-'));

    if (!currentStep) return;
    
    // If we're at the first step and onBack is provided, use it
    if (currentStep === steps[0] && onBack) {
      onBack();
      return;
    }
    
    const currentIndex = steps.indexOf(currentStep);
    if (currentIndex > 0) {
      setCurrentStep(steps[currentIndex - 1]);
    }
  };

  // Toggle app selection
  const toggleApp = (appId: string) => {
    if (selectedApps.includes(appId)) {
      setSelectedApps(selectedApps.filter(id => id !== appId));
    } else {
      setSelectedApps([...selectedApps, appId]);
    }
  };

  // Check server connection
  const checkServer = async () => {
    // If using official server, we assume it's connected
    if (serverOption === 'official') {
      setServerConnected(true);
      return true;
    }
    
    // For custom server, check the connection
    if (!serverUrl) {
      alert('Please enter a server URL');
      return false;
    }
    
    setCheckingServer(true);
    try {
      // This would be a real API call in a production app
      const response = await fetch(`${serverUrl}/health`);
      const data = await response.json();
      const isConnected = data.status === 'healthy';
      setServerConnected(isConnected);
      setCheckingServer(false);
      
      if (isConnected) {
        alert('Connected to server successfully');
      } else {
        alert('Server responded but health check failed');
      }
      
      return isConnected;
    } catch (error) {
      console.error('Error checking server:', error);
      setServerConnected(false);
      setCheckingServer(false);
      alert('Could not connect to the server');
      return false;
    }
  };

  // Create account and finish
  const handleFinish = async () => {
    setLoading(true);

    try {
      // Create the account
      const finalName = name.trim() !== '' ? name.trim() : `User${Math.floor(Math.random() * 10000)}`;
      
      // Set up server configuration based on selected option
      const serverConfig: ServerConfig = {
        url: serverOption === 'official' ? OFFICIAL_SERVER_URL : serverUrl,
        name: serverOption === 'official' ? OFFICIAL_SERVER_NAME : (serverName || 'Custom Vibe Cloud'),
        isConnected: serverOption === 'official' ? true : serverConnected,
        lastConnected: serverOption === 'official' || serverConnected ? Date.now() : undefined
      };
      
      // Determine authentication type
      const authType = password ? 'PASSWORD' : 'NONE';
      
      const account = await createAccount(finalName, authType, profilePicture, password, serverConfig);
      console.log('Account created:', account);

      // Install selected apps
      for (const appId of selectedApps) {
        const app = availableApps.find(a => a.appId === appId);
        if (app) {
          try {
            console.log('Installing app:', app.appId);
            await addOrUpdateApp(app, account);
          } catch (appError) {
            console.error(`Error installing app ${app.appId}:`, appError);
          }
        }
      }

      // Complete and navigate to main screen
      onComplete();
    } catch (error) {
      console.error('Account creation failed:', error);
      alert(`Account creation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setLoading(false);
    }
  };

  // Determine initial step based on whether this is the first account
  useEffect(() => {
    const shouldShowIntro = FORCE_ALWAYS_SHOW_WELCOME || accounts.length === 0;
    const startingStep = shouldShowIntro ? 'intro-welcome' : 'profile-setup';
    setInitialStep(startingStep);
    setCurrentStep(startingStep);
  }, [accounts]);

  // Render the current step
  const renderStep = () => {
    switch (currentStep) {
      case 'intro-welcome':
        return (
          <div className="flex flex-col items-center justify-center text-center">
            <div className="mb-8 p-4 rounded-full bg-blue-100 text-blue-600">
              <FiUser size={48} />
            </div>
            <h2 className="text-2xl font-bold mb-4">Welcome to Vibe</h2>
            <p className="text-gray-600 max-w-md mb-6">
              Vibe gives you full control over your digital identity and data. Let's get you set up with your own self-sovereign identity.
            </p>
          </div>
        );

      case 'intro-privacy':
        return (
          <div className="flex flex-col items-center justify-center text-center">
            <div className="mb-8 p-4 rounded-full bg-blue-100 text-blue-600">
              <FiLock size={48} />
            </div>
            <h2 className="text-2xl font-bold mb-4">Your Privacy Matters</h2>
            <p className="text-gray-600 max-w-md mb-6">
              With Vibe, your data stays with you. No centralized storage or third-party intermediaries can access your information without your explicit permission.
            </p>
          </div>
        );

      case 'intro-data':
        return (
          <div className="flex flex-col items-center justify-center text-center">
            <div className="mb-8 p-4 rounded-full bg-blue-100 text-blue-600">
              <FiDatabase size={48} />
            </div>
            <h2 className="text-2xl font-bold mb-4">Your Data, Your Rules</h2>
            <p className="text-gray-600 max-w-md mb-6">
              You decide which apps can access your data and when. Revoke access at any time. It's your digital identity, on your terms.
            </p>
          </div>
        );

      case 'profile-setup':
        return (
          <div className="flex flex-col items-center justify-center">
            <h2 className="text-2xl font-bold mb-6">Create Your Profile</h2>
            
            <div className="mb-6 w-full max-w-sm">
              <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-1">
                Your Name
              </label>
              <input
                type="text"
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                placeholder="Enter your name"
              />
            </div>
            
            <div className="mb-6 w-full max-w-sm">
              <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">
                Password (Optional)
              </label>
              <input
                type="password"
                id="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                placeholder="Create a password"
              />
              {password && (
                <div className="mt-4">
                  <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-700 mb-1">
                    Confirm Password
                  </label>
                  <input
                    type="password"
                    id="confirmPassword"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                    placeholder="Confirm your password"
                  />
                  {passwordError && (
                    <p className="text-red-500 text-sm mt-1">{passwordError}</p>
                  )}
                </div>
              )}
              {password && (
                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mt-4">
                  <p className="text-sm text-yellow-800">
                    <strong>Important:</strong> Your password protects your account on this device. 
                    There's no password reset option, so be sure to remember it!
                  </p>
                </div>
              )}
            </div>
            
            <div className="mb-6 flex flex-col items-center">
              <label className="block text-sm font-medium text-gray-700 mb-3">
                Profile Picture
              </label>
              
              {profilePicture ? (
                <div className="relative mb-4">
                  <img 
                    src={profilePicture} 
                    alt="Profile" 
                    className="w-32 h-32 rounded-full object-cover border-2 border-gray-200"
                  />
                  <button 
                    onClick={() => setProfilePicture(undefined)}
                    className="absolute -top-2 -right-2 bg-red-500 text-white p-1 rounded-full"
                  >
                    ×
                  </button>
                </div>
              ) : (
                <div className="w-32 h-32 rounded-full bg-gray-200 flex items-center justify-center mb-4">
                  <FiUser size={48} className="text-gray-400" />
                </div>
              )}
              
              <button
                onClick={handleProfilePictureSelect}
                className="flex items-center px-4 py-2 bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200"
              >
                <FiUpload className="mr-2" />
                {profilePicture ? 'Change Picture' : 'Upload Picture'}
              </button>
            </div>
          </div>
        );

      case 'server-setup':
        return (
          <div className="flex flex-col items-center justify-center">
            <div className="mb-8 p-4 rounded-full bg-blue-100 text-blue-600">
              <FiCloud size={48} />
            </div>
            <h2 className="text-2xl font-bold mb-4">Choose Vibe Cloud</h2>
            <p className="text-gray-600 mb-6 text-center max-w-md">
              Where would you like to securely store and sync your data?
            </p>
            
            <div className="w-full max-w-md space-y-4 mb-6">
              {/* Official option */}
              <div 
                className={`p-4 border-2 rounded-lg cursor-pointer ${
                  serverOption === 'official' ? 'border-blue-500 bg-blue-50' : 'border-gray-200'
                }`}
                onClick={() => setServerOption('official')}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center">
                    <FiCloud className={`mr-3 ${serverOption === 'official' ? 'text-blue-500' : 'text-gray-500'}`} size={20} />
                    <div>
                      <h3 className={`font-medium ${serverOption === 'official' ? 'text-blue-600' : 'text-gray-700'}`}>
                        Official Vibe Cloud
                      </h3>
                      <p className="text-sm text-gray-500">Secure syncing provided by Vibe</p>
                    </div>
                  </div>
                  {serverOption === 'official' && <FiCheck className="text-blue-500" size={20} />}
                </div>
              </div>
              
              {/* Custom option */}
              <div 
                className={`p-4 border-2 rounded-lg cursor-pointer ${
                  serverOption === 'custom' ? 'border-blue-500 bg-blue-50' : 'border-gray-200'
                }`}
                onClick={() => setServerOption('custom')}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center">
                    <FiServer className={`mr-3 ${serverOption === 'custom' ? 'text-blue-500' : 'text-gray-500'}`} size={20} />
                    <div>
                      <h3 className={`font-medium ${serverOption === 'custom' ? 'text-blue-600' : 'text-gray-700'}`}>
                        Self-hosted / Third party
                      </h3>
                      <p className="text-sm text-gray-500">Use a self-hosted or third-party vibe cloud service</p>
                    </div>
                  </div>
                  {serverOption === 'custom' && <FiCheck className="text-blue-500" size={20} />}
                </div>
              </div>
            </div>
            
            {/* Custom server configuration */}
            {serverOption === 'custom' && (
              <div className="w-full max-w-md bg-gray-50 p-4 rounded-lg border border-gray-200">
                <div className="mb-4">
                  <label htmlFor="serverName" className="block text-sm font-medium text-gray-700 mb-1">
                    Server Name (Optional)
                  </label>
                  <input
                    type="text"
                    id="serverName"
                    value={serverName}
                    onChange={(e) => setServerName(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                    placeholder="Give this server a name"
                  />
                </div>
                
                <div className="mb-4">
                  <label htmlFor="serverUrl" className="block text-sm font-medium text-gray-700 mb-1">
                    Server URL
                  </label>
                  <input
                    type="text"
                    id="serverUrl"
                    value={serverUrl}
                    onChange={(e) => setServerUrl(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                    placeholder="e.g. https://my-vibe-cloud.com"
                  />
                </div>
                
                <div className="flex items-center justify-between bg-gray-100 p-3 rounded-md">
                  <div className="flex items-center">
                    <div className={`w-3 h-3 rounded-full mr-2 ${serverConnected ? 'bg-green-500' : 'bg-red-500'}`}></div>
                    <span className="text-sm text-gray-600">
                      {checkingServer ? 'Checking connection...' : serverConnected ? 'Connected' : 'Not connected'}
                    </span>
                  </div>
                  <button
                    onClick={checkServer}
                    disabled={checkingServer || !serverUrl}
                    className={`px-3 py-1 text-sm rounded-md ${
                      checkingServer || !serverUrl 
                        ? 'bg-gray-300 text-gray-500 cursor-not-allowed' 
                        : 'bg-blue-500 text-white hover:bg-blue-600'
                    }`}
                  >
                    {checkingServer ? 'Checking...' : 'Check Connection'}
                  </button>
                </div>
              </div>
            )}
          </div>
        );

      case 'app-selection':
        return (
          <div className="flex flex-col items-center justify-center">
            <div className="mb-8 p-4 rounded-full bg-blue-100 text-blue-600">
              <FiGrid size={48} />
            </div>
            <h2 className="text-2xl font-bold mb-2">Select Base Apps</h2>
            <p className="text-gray-600 mb-6 text-center max-w-md">
              Choose the apps you want to install to get started with Vibe.
            </p>
            
            <div className="w-full max-w-md">
              <h3 className="font-medium mb-3 text-gray-700">Base Apps</h3>
              
              <div className="space-y-3">
                {availableApps.map(app => (
                  <div 
                    key={app.appId} 
                    className="flex items-center justify-between p-3 border border-gray-200 rounded-lg"
                  >
                    <div className="flex-1">
                      <h4 className="font-medium text-gray-800">{app.name}</h4>
                      <p className="text-sm text-gray-600">{app.description}</p>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={selectedApps.includes(app.appId)}
                        onChange={() => toggleApp(app.appId)}
                        className="sr-only peer"
                      />
                      <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                    </label>
                  </div>
                ))}
              </div>
            </div>
          </div>
        );

      case 'complete':
        return (
          <div className="flex flex-col items-center justify-center text-center">
            <div className="mb-8 p-4 rounded-full bg-green-100 text-green-600">
              <FiCheck size={48} />
            </div>
            <h2 className="text-2xl font-bold mb-4">All Set!</h2>
            <p className="text-gray-600 max-w-md mb-6">
              Your Vibe account is ready to use. Tap Finish to start using your self-sovereign identity and take control of your digital life.
            </p>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div className="h-full flex flex-col bg-white">
      {/* Progress dots */}
      <div className="flex justify-center py-6">
        {['intro-welcome', 'intro-privacy', 'intro-data', 'profile-setup', 'server-setup', 'app-selection', 'complete'].map((step, index) => (
          <div 
            key={step} 
            className={`w-2 h-2 mx-1 rounded-full ${
              currentStep === step 
                ? 'bg-blue-600 w-3 h-3' 
                : 'bg-gray-300'
            }`}
          />
        ))}
      </div>
      
      {/* Content */}
      <div className="flex-1 flex items-center justify-center p-6">
        {renderStep()}
      </div>
      
      {/* Navigation buttons */}
      <div className="flex justify-between p-6 border-t border-gray-200">
        <button
          onClick={handleBack}
          disabled={loading}
          className="flex items-center px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50"
        >
          <FiArrowLeft className="mr-2" />
          Back
        </button>
        
        <button
          onClick={currentStep === 'complete' ? handleFinish : handleNext}
          disabled={loading}
          className="flex items-center px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
        >
          {loading ? (
            'Processing...'
          ) : (
            <>
              {currentStep === 'complete' ? 'Finish' : 'Next'}
              {currentStep !== 'complete' && <FiArrowRight className="ml-2" />}
            </>
          )}
        </button>
      </div>
    </div>
  );
};

export default CreateAccountWizard;