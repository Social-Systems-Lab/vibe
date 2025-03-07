import React, { useEffect } from 'react';
import { useAtom } from 'jotai';
import { signInStatusAtom, configAtom } from './components/atoms';
import MainScreen from './components/MainScreen';
import TitleBar from './components/TitleBar';
import { OnboardingWizard } from './components/onboarding';

function App() {
  const [signInStatus] = useAtom(signInStatusAtom);
  const [config, setConfig] = useAtom(configAtom);

  useEffect(() => {
    const initializeApp = async () => {
      try {
        const appConfig = await window.electron.getConfig();
        setConfig(appConfig);
      } catch (error) {
        console.error('Failed to initialize app:', error);
      }
    };

    initializeApp();
  }, []);

  if (!config) {
    return <div className="w-full h-full flex items-center justify-center">Loading...</div>;
  }

  return (
    <div className="w-full h-full flex flex-col">
      <TitleBar />
      <div className="flex-1 overflow-hidden">
        {signInStatus === 'loggedIn' ? <MainScreen /> : <OnboardingWizard />}
      </div>
    </div>
  );
}

export default App;