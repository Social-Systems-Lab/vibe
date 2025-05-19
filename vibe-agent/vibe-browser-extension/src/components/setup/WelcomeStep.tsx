import React from "react";
import { User, Smartphone } from "lucide-react";
// Removed Card components
// Removed VibeLogo import, will use direct img tag

interface WelcomeStepProps {
    onCreateNew: () => void;
    onImportExisting: () => void;
}

export function WelcomeStep({ onCreateNew, onImportExisting }: WelcomeStepProps) {
    return (
        <div className="flex flex-col items-center justify-start h-full space-y-6 w-full">
            {" "}
            {/* Removed p-6, adjusted space-y */}
            <img src="/icon-dev.png" alt="Vibe Logo" className="w-20 h-20 mt-2 mb-3" /> {/* Adjusted margin */}
            <h1 className="text-3xl font-bold">Set up Vibe</h1>
            <div className="w-full max-w-sm space-y-4">
                <button
                    onClick={onCreateNew}
                    className="w-full p-4 bg-violet-500 hover:bg-violet-600 text-white rounded-lg transition-colors flex items-center gap-4 group text-left shadow-md"
                >
                    <User className="w-10 h-10 opacity-80" /> {/* Adjusted icon size and opacity */}
                    <div className="flex-1">
                        <h3 className="text-lg font-semibold">I'm new to Vibe</h3>
                        <p className="text-sm opacity-90">Create a new vault and identity.</p>
                    </div>
                </button>

                <button
                    onClick={onImportExisting}
                    className="w-full p-4 bg-violet-500 hover:bg-violet-600 text-white rounded-lg transition-colors flex items-center gap-4 group text-left shadow-md"
                >
                    <Smartphone className="w-10 h-10 opacity-80" /> {/* Adjusted icon size and opacity */}
                    <div className="flex-1">
                        <h3 className="text-lg font-semibold">I have Vibe on another device</h3>
                        <p className="text-sm opacity-90">Import an existing vault using your seed phrase.</p>
                    </div>
                </button>
            </div>
        </div>
    );
}
