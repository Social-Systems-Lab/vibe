import type { NextConfig } from "next";

const nextConfig: NextConfig = {
    output: "standalone",
    transpilePackages: ["vibe-react", "vibe-sdk"],
};

export default nextConfig;
