import React from 'react';
import { FiCheck } from 'react-icons/fi';

interface CompletionProps {
  accountName: string;
  onComplete: () => void;
}

const Completion: React.FC<CompletionProps> = ({ accountName, onComplete }) => {
  return (
    <div className="flex flex-col items-center justify-center h-full max-w-md mx-auto px-6 py-10">
      <div className="w-24 h-24 rounded-full bg-green-100 flex items-center justify-center mb-6">
        <FiCheck className="w-12 h-12 text-green-600" />
      </div>
      
      <h1 className="text-3xl font-bold mb-4 text-center">Welcome, {accountName}!</h1>
      
      <p className="text-gray-600 text-center mb-8">
        Your Vibe account has been created successfully. You're ready to start exploring.
      </p>
      
      <div className="w-full bg-blue-50 border border-blue-200 rounded-lg p-5 mb-8">
        <h2 className="text-lg font-semibold mb-2 text-blue-800">Getting Started</h2>
        <ul className="space-y-2 text-sm text-blue-700">
          <li className="flex items-start">
            <span className="flex-shrink-0 w-5 h-5 bg-blue-200 rounded-full flex items-center justify-center text-blue-600 font-bold mr-2">•</span>
            <span>Browse the web privately and securely</span>
          </li>
          <li className="flex items-start">
            <span className="flex-shrink-0 w-5 h-5 bg-blue-200 rounded-full flex items-center justify-center text-blue-600 font-bold mr-2">•</span>
            <span>Your data stays on your device</span>
          </li>
          <li className="flex items-start">
            <span className="flex-shrink-0 w-5 h-5 bg-blue-200 rounded-full flex items-center justify-center text-blue-600 font-bold mr-2">•</span>
            <span>Connect with friends through circles</span>
          </li>
        </ul>
      </div>
      
      <button 
        onClick={onComplete}
        className="btn-primary w-full py-3"
      >
        Start Using Vibe
      </button>
    </div>
  );
};

export default Completion;