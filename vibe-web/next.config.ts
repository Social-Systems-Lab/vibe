import type { NextConfig } from "next";
import { join } from "path";

const nextConfig: NextConfig = {
    output: "standalone",
    outputFileTracingRoot: join(__dirname, ".."),
};

export default nextConfig;
