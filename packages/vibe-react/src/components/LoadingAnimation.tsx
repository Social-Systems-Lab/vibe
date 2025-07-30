"use client";

import React from "react";
import { DotLottieReact } from "@lottiefiles/dotlottie-react";
import animationData from "../assets/loader.json";

const LoadingAnimation = () => {
    return <DotLottieReact data={animationData} loop autoplay style={{ width: 150, height: 150 }} />;
};

export default LoadingAnimation;
