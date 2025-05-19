import React, { useState, useMemo, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { zxcvbn, zxcvbnOptions } from "@zxcvbn-ts/core";
import * as zxcvbnCommonPackage from "@zxcvbn-ts/language-common";
import * as zxcvbnEnPackage from "@zxcvbn-ts/language-en";
import { useEffect } from "react";
import { Lock } from "lucide-react"; // Import Lock icon

interface CreatePasswordStepProps {
    onPasswordSet: (password: string) => void;
    isImportFlow?: boolean;
}

export function CreatePasswordStep({ onPasswordSet, isImportFlow = false }: CreatePasswordStepProps) {
    const [password, setPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [showPassword, setShowPassword] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [zxcvbnLoaded, setZxcvbnLoaded] = useState(false);

    useEffect(() => {
        const loadOptions = async () => {
            try {
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
            }
        };
        loadOptions();
    }, []);

    const strength = useMemo(() => {
        if (!zxcvbnLoaded || !password) return null;
        try {
            return zxcvbn(password);
        } catch (err) {
            console.error("Error calculating password strength:", err);
            return null;
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
        switch (score) {
            case 0:
            case 1:
                return "bg-red-500";
            case 2:
                return "bg-orange-500"; // As per image
            case 3:
                return "bg-blue-500";
            case 4:
                return "bg-green-500";
            default:
                return "bg-gray-300";
        }
    };

    // const getStrengthLabel = (score: number | undefined | null): string => { ... }; // Not used in current design

    return (
        <div className="flex flex-col items-center justify-start h-full space-y-5 w-full">
            <img src="/icon-dev.png" alt="Vibe Logo" className="w-16 h-16 mt-2 mb-3" />
            <div className="space-y-1 text-center">
                <h1 className="text-2xl font-semibold">{isImportFlow ? "Set New Device Password" : "Set your device password"}</h1>
                <p className="text-sm text-muted-foreground max-w-xs">
                    {isImportFlow ? "Create a password to secure your Vibe vault on this new device." : "Create a password to secure your Vibe vault"}
                </p>
            </div>
            <form onSubmit={handleSubmit} className="w-full max-w-sm space-y-3 text-left">
                <div className="space-y-1">
                    <Label htmlFor="password">New Password</Label>
                    <div className="relative">
                        <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input
                            id="password"
                            type={showPassword ? "text" : "password"}
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            required
                            autoComplete="new-password"
                            className="text-sm pl-10"
                        />
                    </div>
                </div>

                <div className="space-y-1">
                    <Label htmlFor="confirm-password">Confirm Password</Label>
                    <div className="relative">
                        <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input
                            id="confirm-password"
                            type={showPassword ? "text" : "password"}
                            value={confirmPassword}
                            onChange={(e) => setConfirmPassword(e.target.value)}
                            required
                            autoComplete="new-password"
                            className="text-sm pl-10"
                        />
                    </div>
                </div>

                {password &&
                    strength && ( // Strength indicator moved here
                        <div className="space-y-1 pt-1">
                            <div className="w-full bg-gray-200 rounded-full h-1.5 dark:bg-gray-700">
                                <div
                                    className={`h-1.5 rounded-full ${getStrengthColor(strength.score)}`}
                                    style={{ width: `${((strength.score + 1) / 5) * 100}%` }}
                                ></div>
                            </div>
                        </div>
                    )}

                <div className="flex items-center space-x-2 pt-1">
                    <input
                        type="checkbox"
                        id="show-password"
                        checked={showPassword}
                        onChange={() => setShowPassword(!showPassword)}
                        className="form-checkbox h-4 w-4 text-violet-500 border-gray-300 rounded focus:ring-violet-400"
                    />
                    <Label htmlFor="show-password" className="text-sm font-medium text-gray-700 dark:text-gray-300 select-none">
                        Show password
                    </Label>
                </div>

                {error && <p className="text-sm text-red-600 pt-1">{error}</p>}

                <Button
                    type="submit"
                    className="w-full bg-violet-500 hover:bg-violet-600 text-primary-foreground font-semibold py-3 text-base"
                    disabled={!canProceed}
                >
                    {isImportFlow ? "Set Password & Import" : "Set Password"}
                </Button>
            </form>
            <p className="text-xs text-muted-foreground text-center max-w-xs pt-1">
                This password encrypts your secret phrase locally. It cannot be recovered.
            </p>
        </div>
    );
}
