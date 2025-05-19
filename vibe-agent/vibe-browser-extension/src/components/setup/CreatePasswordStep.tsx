import React, { useState, useMemo, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
// Removed Card components
import { zxcvbn, zxcvbnOptions } from "@zxcvbn-ts/core";
import * as zxcvbnCommonPackage from "@zxcvbn-ts/language-common";
import * as zxcvbnEnPackage from "@zxcvbn-ts/language-en";
import { useEffect } from "react";

interface CreatePasswordStepProps {
    onPasswordSet: (password: string) => void;
    isImportFlow?: boolean;
}

export function CreatePasswordStep({ onPasswordSet, isImportFlow = false }: CreatePasswordStepProps) {
    const [password, setPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [showPassword, setShowPassword] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [zxcvbnLoaded, setZxcvbnLoaded] = useState(false); // State to track loading

    // Load zxcvbn options asynchronously on mount
    useEffect(() => {
        const loadOptions = async () => {
            try {
                // Using named imports directly
                const options = {
                    translations: zxcvbnEnPackage.translations,
                    graphs: zxcvbnCommonPackage.adjacencyGraphs,
                    dictionary: {
                        ...zxcvbnCommonPackage.dictionary,
                        ...zxcvbnEnPackage.dictionary,
                    },
                };
                zxcvbnOptions.setOptions(options);
                setZxcvbnLoaded(true);
                console.log("ZXCVBN options loaded.");
            } catch (err) {
                console.error("Failed to load zxcvbn options:", err);
                // Handle error appropriately, maybe disable strength check
            }
        };
        loadOptions();
    }, []); // Empty dependency array ensures this runs only once on mount

    const strength = useMemo(() => {
        // Only calculate strength if options are loaded and password exists
        if (!zxcvbnLoaded || !password) return null;
        try {
            return zxcvbn(password);
        } catch (err) {
            console.error("Error calculating password strength:", err);
            return null; // Return null or a default weak score on error
        }
    }, [password, zxcvbnLoaded]);

    const passwordsMatch = useMemo(() => {
        return password && confirmPassword && password === confirmPassword;
    }, [password, confirmPassword]);

    const canProceed = useMemo(() => {
        return passwordsMatch && strength && strength.score >= 2;
    }, [passwordsMatch, strength]);

    const handleSubmit = useCallback(
        (e: React.FormEvent) => {
            e.preventDefault();
            setError(null);
            if (!password || !confirmPassword) {
                setError("Please enter and confirm your password.");
                return;
            }
            if (!passwordsMatch) {
                setError("Passwords do not match.");
                return;
            }
            if (!strength || strength.score < 2) {
                setError("Password is too weak. Please choose a stronger one.");
                return;
            }
            onPasswordSet(password);
        },
        [password, confirmPassword, passwordsMatch, strength, onPasswordSet]
    );

    const getStrengthColor = (score: number | undefined | null): string => {
        // Using orange for "Okay" as per image, others can be adjusted
        switch (score) {
            case 0:
            case 1:
                return "bg-red-500"; // Weak
            case 2:
                return "bg-orange-500"; // Okay (as per image)
            case 3:
                return "bg-blue-500"; // Good
            case 4:
                return "bg-green-500"; // Strong
            default:
                return "bg-gray-300";
        }
    };

    const getStrengthLabel = (score: number | undefined | null): string => {
        switch (score) {
            case 0:
            case 1:
                return "Weak";
            case 2:
                return "Okay";
            case 3:
                return "Good";
            case 4:
                return "Strong";
            default:
                return "";
        }
    };

    return (
        <div className="flex flex-col items-center justify-start h-full p-6 space-y-6 text-center">
            <img src="/icon-dev.png" alt="Vibe Logo" className="w-16 h-16 mb-4" /> {/* Logo */}
            <div className="space-y-2">
                <h1 className="text-2xl font-semibold">{isImportFlow ? "Set New Device Password" : "Set your device password"}</h1>
                <p className="text-sm text-muted-foreground">
                    {isImportFlow ? "Create a password to secure your Vibe vault on this new device." : "Create a password to secure your Vibe vault"}
                </p>
            </div>
            <form onSubmit={handleSubmit} className="w-full max-w-sm space-y-4 text-left">
                <div className="space-y-1">
                    <Label htmlFor="password">New Password</Label>
                    <Input
                        id="password"
                        type={showPassword ? "text" : "password"}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        required
                        autoComplete="new-password"
                        className="text-sm" // Match image style
                    />
                </div>

                {/* Strength Indicator */}
                {password && strength && (
                    <div className="space-y-1">
                        <div className="w-full bg-gray-200 rounded-full h-1.5 dark:bg-gray-700">
                            <div
                                className={`h-1.5 rounded-full ${getStrengthColor(strength.score)}`}
                                style={{ width: `${((strength.score + 1) / 5) * 100}%` }}
                            ></div>
                        </div>
                        {/* Optional: text label for strength, image doesn't show it prominently next to bar */}
                        {/* <span className={`text-xs font-medium ${getStrengthColor(strength.score).replace("bg-", "text-")}`}>
                            {getStrengthLabel(strength.score)}
                        </span> */}
                    </div>
                )}
                {/* {strength?.feedback?.warning && <p className="text-xs text-red-600">{strength.feedback.warning}</p>}
                {strength?.feedback?.suggestions && strength.feedback.suggestions.length > 0 && (
                    <ul className="text-xs text-muted-foreground list-disc list-inside">
                        {strength.feedback.suggestions.map((s, i) => (
                            <li key={i}>{s}</li>
                        ))}
                    </ul>
                )} */}

                <div className="space-y-1">
                    <Label htmlFor="confirm-password">Confirm Password</Label>
                    <Input
                        id="confirm-password"
                        type={showPassword ? "text" : "password"}
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        required
                        autoComplete="new-password"
                        className="text-sm" // Match image style
                    />
                </div>

                <div className="flex items-center space-x-2 pt-2">
                    <input
                        type="checkbox"
                        id="show-password"
                        checked={showPassword}
                        onChange={() => setShowPassword(!showPassword)}
                        className="form-checkbox h-4 w-4 text-violet-500 border-gray-300 rounded focus:ring-violet-400"
                    />
                    <Label htmlFor="show-password" className="text-sm font-medium text-gray-700 dark:text-gray-300">
                        Show password
                    </Label>
                </div>

                {error && <p className="text-sm text-red-600 pt-1">{error}</p>}

                <Button
                    type="submit"
                    className="w-full bg-violet-500 hover:bg-violet-600 text-white font-semibold py-3 text-base" // Purple button, full width, larger text
                    disabled={!canProceed}
                >
                    {isImportFlow ? "Set Password & Import" : "Set Password"}
                </Button>
            </form>
            <p className="text-xs text-muted-foreground text-center max-w-xs pt-2">
                This password encrypts your secret phrase locally. It cannot be recovered.
            </p>
        </div>
    );
}
