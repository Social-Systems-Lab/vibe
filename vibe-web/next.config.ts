import type { NextConfig } from "next";
import { join } from "path";

const nextConfig: NextConfig = {
    /* config options here */
    outputFileTracingRoot: join(__dirname, ".."),
};

export default nextConfig;
