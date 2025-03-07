import React, { useState, useEffect } from 'react';
import { useAtom } from 'jotai';
import { accountsAtom, signInStatusAtom, signedInAccountsAtom } from '../../components/atoms';
import Welcome from './Welcome';
import ProfileSetup from './ProfileSetup';
import ServerSetup from './ServerSetup';
import Completion from './Completion';
import AccountSelect from './AccountSelect';

enum OnboardingStep {
  Welcome = 'welcome',
  ProfileSetup = 'profile',
  ServerSetup = 'server',
  Completion = 'completion',
  AccountSelect = 'select',
}

const OnboardingWizard: React.FC = () => {
  const [accounts, setAccounts] = useAtom(accountsAtom);
  const [, setSignInStatus] = useAtom(signInStatusAtom);
  const [, setSignedInAccounts] = useAtom(signedInAccountsAtom);
  
  const [currentStep, setCurrentStep] = useState<OnboardingStep>(OnboardingStep.Welcome);
  const [creatingAccount, setCreatingAccount] = useState(false);
  const [error, setError] = useState('');
  
  // Form data
  const [profileData, setProfileData] = useState({ name: '', password: '', picturePath: '' });
  const [serverData, setServerData] = useState({ url: '', name: '' });
  
  // Fetch accounts
  useEffect(() => {
    const loadAccounts = async () => {
      try {
        const fetchedAccounts = await window.electron.getAccounts();
        setAccounts(fetchedAccounts);
        
        // Determine initial step based on accounts presence
        if (fetchedAccounts.length === 0) {
          setCurrentStep(OnboardingStep.Welcome);
        } else {
          setCurrentStep(OnboardingStep.AccountSelect);
        }
      } catch (error) {
        console.error('Error loading accounts:', error);
        setError('Failed to load accounts');
      }
    };
    
    loadAccounts();
  }, []);
  
  const handleCreateAccount = async () => {
    setCreatingAccount(true);
    setError('');
    
    try {
      const newAccount = await window.electron.createAccount(
        profileData.name,
        profileData.password,
        profileData.picturePath
      );
      
      // Update server config if provided
      if (serverData.url) {
        await window.electron.updateServerConfig(profileData.name, serverData);
      }
      
      // Login with the new account
      await handleLogin({
        name: profileData.name,
        password: profileData.password,
      });
      
      setCreatingAccount(false);
    } catch (error) {
      console.error('Error creating account:', error);
      setError('Failed to create account');
      setCreatingAccount(false);
    }
  };
  
  const handleLogin = async (account) => {
    try {
      const loggedInAccount = await window.electron.login(account.name, account.password);
      
      setSignedInAccounts(prev => {
        // Only add if not already in the list
        if (!prev.find(acc => acc.name === account.name)) {
          return [...prev, loggedInAccount];
        }
        return prev;
      });
      
      // Open the database for this account
      if (loggedInAccount.did) {
        const dbName = await window.electron.dbGetNameFromDid(loggedInAccount.did);
        await window.electron.dbOpen(dbName);
      }
      
      setSignInStatus('loggedIn');
    } catch (error) {
      console.error('Login error:', error);
      throw new Error('Login failed');
    }
  };
  
  // Navigation handlers
  const goToNext = () => {
    switch (currentStep) {
      case OnboardingStep.Welcome:
        setCurrentStep(OnboardingStep.ProfileSetup);
        break;
      case OnboardingStep.ProfileSetup:
        setCurrentStep(OnboardingStep.ServerSetup);
        break;
      case OnboardingStep.ServerSetup:
        setCurrentStep(OnboardingStep.Completion);
        break;
      case OnboardingStep.Completion:
        handleCreateAccount();
        break;
    }
  };
  
  const goToBack = () => {
    switch (currentStep) {
      case OnboardingStep.ProfileSetup:
        setCurrentStep(OnboardingStep.Welcome);
        break;
      case OnboardingStep.ServerSetup:
        setCurrentStep(OnboardingStep.ProfileSetup);
        break;
      case OnboardingStep.Completion:
        setCurrentStep(OnboardingStep.ServerSetup);
        break;
    }
  };
  
  // Step-specific handlers
  const handleWelcomeNext = () => {
    goToNext();
  };
  
  const handleProfileNext = (data) => {
    setProfileData(data);
    goToNext();
  };
  
  const handleServerNext = (data) => {
    setServerData(data);
    goToNext();
  };
  
  const handleCompletion = () => {
    handleCreateAccount();
  };
  
  const handleSelectAccount = (account) => {
    handleLogin(account).catch((error) => {
      setError('Login failed: Incorrect password');
    });
  };
  
  const handleCreateNewAccount = () => {
    setCurrentStep(OnboardingStep.Welcome);
  };
  
  // Render the current step
  const renderStep = () => {
    switch (currentStep) {
      case OnboardingStep.Welcome:
        return <Welcome onNext={handleWelcomeNext} />;
      
      case OnboardingStep.ProfileSetup:
        return <ProfileSetup onNext={handleProfileNext} onBack={goToBack} />;
      
      case OnboardingStep.ServerSetup:
        return <ServerSetup onNext={handleServerNext} onBack={goToBack} />;
      
      case OnboardingStep.Completion:
        return <Completion accountName={profileData.name} onComplete={handleCompletion} />;
      
      case OnboardingStep.AccountSelect:
        return (
          <AccountSelect
            accounts={accounts}
            onSelectAccount={handleSelectAccount}
            onCreateAccount={handleCreateNewAccount}
          />
        );
      
      default:
        return <div>Loading...</div>;
    }
  };
  
  return (
    <div className="w-full h-full bg-gray-50">
      {error && (
        <div className="absolute top-4 left-1/2 transform -translate-x-1/2 bg-red-100 border border-red-400 text-red-700 px-4 py-2 rounded z-50">
          {error}
        </div>
      )}
      {renderStep()}
    </div>
  );
};

export default OnboardingWizard;