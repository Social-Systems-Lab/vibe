// squircle.tsx
import React from "react";
import { Image, StyleSheet, ViewStyle } from "react-native";
import MaskedView from "@react-native-masked-view/masked-view";
import Svg, { Path } from "react-native-svg";

interface SquircleIconProps {
    uri: string;
    size?: number;
    style?: ViewStyle;
}

export function SquircleIcon({ uri, size = 60, style }: SquircleIconProps) {
    return (
        <MaskedView
            style={[{ width: size, height: size }, style]}
            maskElement={
                <Svg
                    // We'll fit the original 160x160 path into our box:
                    viewBox="0 0 160 160"
                    width="100%"
                    height="100%"
                >
                    <Path
                        fill="white"
                        d="M 0 80
               C 0 20, 20 0, 80 0
               S 160 20, 160 80, 140 160
               80 160, 0 140, 0 80"
                    />
                </Svg>
            }
        >
            <Image source={{ uri }} style={{ width: size, height: size, resizeMode: "cover" }} />
        </MaskedView>
    );
}

/** Minimal interface for the squircle shape */
interface SquircleMaskProps {
    size: number;
    children: React.ReactNode;
    style?: ViewStyle;
}

export function SquircleMask({ size, children, style }: SquircleMaskProps) {
    return (
        <MaskedView
            style={[{ width: size, height: size }, style]}
            maskElement={
                <Svg width="100%" height="100%" viewBox="0 0 160 160">
                    {/* Your squircle path */}
                    <Path
                        fill="white"
                        d="M 0 80
               C 0 20, 20 0, 80 0
               S 160 20, 160 80, 140 160
               80 160, 0 140, 0 80"
                    />
                </Svg>
            }
        >
            {children}
        </MaskedView>
    );
}
