import type { NextConfig } from "next";
import { join } from "path";
import fs from "fs";
const packageJson = JSON.parse(fs.readFileSync("./package.json", "utf8"));
const version = packageJson.version;

const nextConfig: NextConfig = {
    output: "standalone",
    outputFileTracingRoot: join(__dirname, ".."),
    env: {
        version,
    },
};

export default nextConfig;
