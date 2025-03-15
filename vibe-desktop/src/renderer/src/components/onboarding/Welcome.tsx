import React from 'react';

interface WelcomeProps {
  onNext: () => void;
}

const Welcome: React.FC<WelcomeProps> = ({ onNext }) => {
  return (
    <div className="flex flex-col items-center justify-center h-full max-w-2xl mx-auto px-6 py-10">
      <div className="text-center mb-10">
        <h1 className="text-4xl font-bold mb-6">Welcome to Vibe</h1>
        <p className="text-lg text-gray-600 mb-8">
          Your personal, private, digital space that puts you in control.
        </p>
        <div className="bg-white rounded-xl shadow-lg p-8 mb-6">
          <h2 className="text-xl font-semibold mb-4">What makes Vibe different?</h2>
          <ul className="space-y-4 text-left">
            <li className="flex items-start">
              <div className="flex-shrink-0 w-6 h-6 bg-blue-500 rounded-full flex items-center justify-center text-white font-bold mr-2">1</div>
              <div>
                <span className="font-semibold">Your data lives on your device</span>
                <p className="text-sm text-gray-600">Unlike traditional platforms, your account lives on this device, not on some distant server.</p>
              </div>
            </li>
            <li className="flex items-start">
              <div className="flex-shrink-0 w-6 h-6 bg-blue-500 rounded-full flex items-center justify-center text-white font-bold mr-2">2</div>
              <div>
                <span className="font-semibold">Built for privacy</span>
                <p className="text-sm text-gray-600">End-to-end encryption means your private data stays private.</p>
              </div>
            </li>
            <li className="flex items-start">
              <div className="flex-shrink-0 w-6 h-6 bg-blue-500 rounded-full flex items-center justify-center text-white font-bold mr-2">3</div>
              <div>
                <span className="font-semibold">Connect your way</span>
                <p className="text-sm text-gray-600">Choose who to connect with and what to share, without algorithms deciding for you.</p>
              </div>
            </li>
          </ul>
        </div>
      </div>
      <button 
        onClick={onNext}
        className="btn-primary w-full max-w-md py-3 text-lg"
      >
        Get Started
      </button>
      <p className="text-sm text-gray-500 mt-4">
        By continuing, you agree to our Terms of Service and Privacy Policy.
      </p>
    </div>
  );
};

export default Welcome;