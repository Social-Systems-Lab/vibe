import React, { useState, useMemo, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
// Simple password strength estimation (can be replaced with a library like zxcvbn)
import { zxcvbn, zxcvbnOptions } from "@zxcvbn-ts/core";
import zxcvbnCommonPackage from "@zxcvbn-ts/language-common";
import zxcvbnEnPackage from "@zxcvbn-ts/language-en";
import { useEffect } from "react"; // Import useEffect

interface CreatePasswordStepProps {
    onPasswordSet: (password: string) => void;
    isImportFlow?: boolean; // Optional flag to change text slightly for import flow
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
                // Ensure packages are loaded (though direct import usually suffices with bundlers)
                const common = await zxcvbnCommonPackage;
                const en = await zxcvbnEnPackage;

                const options = {
                    translations: en.translations,
                    graphs: common.adjacencyGraphs,
                    dictionary: {
                        ...common.dictionary,
                        ...en.dictionary,
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
    }, [password, zxcvbnLoaded]); // Depend on password and loaded status

    const passwordsMatch = useMemo(() => {
        return password && confirmPassword && password === confirmPassword;
    }, [password, confirmPassword]);

    const canProceed = useMemo(() => {
        // Require a minimum strength (e.g., score >= 2) and matching passwords
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
        switch (score) {
            case 0:
            case 1:
                return "bg-red-500"; // Weak
            case 2:
                return "bg-yellow-500"; // Okay
            case 3:
                return "bg-blue-500"; // Good
            case 4:
                return "bg-green-500"; // Strong
            default:
                return "bg-gray-300"; // No password
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
        <Card className="w-full max-w-md">
            <CardHeader>
                <CardTitle className="text-2xl">{isImportFlow ? "Set New Device Password" : "Set Your Device Password"}</CardTitle>
                <CardDescription>
                    {isImportFlow
                        ? "Create a strong password to encrypt your Vibe data on this new device. This only protects this device."
                        : "Create a strong password to encrypt your Vibe data on this device. This password cannot be recovered if lost."}
                </CardDescription>
            </CardHeader>
            <CardContent>
                <form onSubmit={handleSubmit} className="space-y-4">
                    <div className="space-y-2">
                        <Label htmlFor="password">New Password</Label>
                        <Input
                            id="password"
                            type={showPassword ? "text" : "password"}
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            required
                            autoComplete="new-password"
                        />
                    </div>
                    {/* Strength Indicator */}
                    {password && strength && (
                        <div className="flex items-center space-x-2">
                            <div className="w-full bg-gray-200 rounded-full h-2.5 dark:bg-gray-700">
                                <div
                                    className={`h-2.5 rounded-full ${getStrengthColor(strength.score)}`}
                                    style={{ width: `${((strength.score + 1) / 5) * 100}%` }} // Scale 0-4 score to 20%-100% width
                                ></div>
                            </div>
                            <span className={`text-sm font-medium ${getStrengthColor(strength.score).replace("bg-", "text-")}`}>
                                {getStrengthLabel(strength.score)}
                            </span>
                        </div>
                    )}
                    {strength?.feedback?.warning && <p className="text-xs text-red-600">{strength.feedback.warning}</p>}
                    {strength?.feedback?.suggestions && strength.feedback.suggestions.length > 0 && (
                        <ul className="text-xs text-muted-foreground list-disc list-inside">
                            {strength.feedback.suggestions.map((s, i) => (
                                <li key={i}>{s}</li>
                            ))}
                        </ul>
                    )}
                    <div className="space-y-2">
                        <Label htmlFor="confirm-password">Confirm Password</Label>
                        <Input
                            id="confirm-password"
                            type={showPassword ? "text" : "password"}
                            value={confirmPassword}
                            onChange={(e) => setConfirmPassword(e.target.value)}
                            required
                            autoComplete="new-password"
                        />
                    </div>
                    <div className="flex items-center space-x-2">
                        <input type="checkbox" id="show-password" checked={showPassword} onChange={() => setShowPassword(!showPassword)} />
                        <Label htmlFor="show-password" className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                            Show Password
                        </Label>
                    </div>
                    {error && <p className="text-sm text-red-600">{error}</p>}
                    <Button type="submit" className="w-full" disabled={!canProceed}>
                        {isImportFlow ? "Set Password & Import" : "Set Device Password"}
                    </Button>
                    <div>
                        password: {password}
                        strength: {JSON.stringify(strength)}
                    </div>{" "}
                    {/* Debugging line, can be removed later */}
                </form>
            </CardContent>
            <CardFooter className="text-xs text-muted-foreground">
                <p>This password encrypts your secret phrase locally. It cannot be recovered.</p>
            </CardFooter>
        </Card>
    );
}
