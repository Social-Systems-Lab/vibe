#!/usr/bin/env bun
import { build, type BuildConfig } from "bun";
import plugin from "bun-plugin-tailwind";
import { existsSync, cpSync } from "fs"; // Added cpSync
import { rm, mkdir } from "fs/promises"; // Added mkdir
import path from "path";

// Print help text if requested
if (process.argv.includes("--help") || process.argv.includes("-h")) {
    console.log(`
🏗️  Bun Build Script

Usage: bun run build.ts [options]

Common Options:
  --outdir <path>          Output directory (default: "dist")
  --minify                 Enable minification (or --minify.whitespace, --minify.syntax, etc)
  --source-map <type>      Sourcemap type: none|linked|inline|external
  --target <target>        Build target: browser|bun|node
  --format <format>        Output format: esm|cjs|iife
  --splitting              Enable code splitting
  --packages <type>        Package handling: bundle|external
  --public-path <path>     Public path for assets
  --env <mode>             Environment handling: inline|disable|prefix*
  --conditions <list>      Package.json export conditions (comma separated)
  --external <list>        External packages (comma separated)
  --banner <text>          Add banner text to output
  --footer <text>          Add footer text to output
  --define <obj>           Define global constants (e.g. --define.VERSION=1.0.0)
  --help, -h               Show this help message

Example:
  bun run build.ts --outdir=dist --minify --source-map=linked --external=react,react-dom
`);
    process.exit(0);
}

// Helper function to convert kebab-case to camelCase
const toCamelCase = (str: string): string => {
    return str.replace(/-([a-z])/g, (g) => g[1].toUpperCase());
};

// Helper function to parse a value into appropriate type
const parseValue = (value: string): any => {
    // Handle true/false strings
    if (value === "true") return true;
    if (value === "false") return false;

    // Handle numbers
    if (/^\d+$/.test(value)) return parseInt(value, 10);
    if (/^\d*\.\d+$/.test(value)) return parseFloat(value);

    // Handle arrays (comma-separated)
    if (value.includes(",")) return value.split(",").map((v) => v.trim());

    // Default to string
    return value;
};

// Magical argument parser that converts CLI args to BuildConfig
function parseArgs(): Partial<BuildConfig> {
    const config: Record<string, any> = {};
    const args = process.argv.slice(2);

    for (let i = 0; i < args.length; i++) {
        const arg = args[i];
        if (!arg.startsWith("--")) continue;

        // Handle --no-* flags
        if (arg.startsWith("--no-")) {
            const key = toCamelCase(arg.slice(5));
            config[key] = false;
            continue;
        }

        // Handle --flag (boolean true)
        if (!arg.includes("=") && (i === args.length - 1 || args[i + 1].startsWith("--"))) {
            const key = toCamelCase(arg.slice(2));
            config[key] = true;
            continue;
        }

        // Handle --key=value or --key value
        let key: string;
        let value: string;

        if (arg.includes("=")) {
            [key, value] = arg.slice(2).split("=", 2);
        } else {
            key = arg.slice(2);
            value = args[++i];
        }

        // Convert kebab-case key to camelCase
        key = toCamelCase(key);

        // Handle nested properties (e.g. --minify.whitespace)
        if (key.includes(".")) {
            const [parentKey, childKey] = key.split(".");
            config[parentKey] = config[parentKey] || {};
            config[parentKey][childKey] = parseValue(value);
        } else {
            config[key] = parseValue(value);
        }
    }

    return config as Partial<BuildConfig>;
}

// Helper function to format file sizes
const formatFileSize = (bytes: number): string => {
    const units = ["B", "KB", "MB", "GB"];
    let size = bytes;
    let unitIndex = 0;

    while (size >= 1024 && unitIndex < units.length - 1) {
        size /= 1024;
        unitIndex++;
    }

    return `${size.toFixed(2)} ${units[unitIndex]}`;
};

console.log("\n🚀 Starting build process...\n");

// Parse CLI arguments with our magical parser
const cliConfig = parseArgs();
const outdir = cliConfig.outdir || path.join(process.cwd(), "dist");
const publicDir = path.join(process.cwd(), "public");

// Clean previous build
if (existsSync(outdir)) {
    console.log(`🗑️ Cleaning previous build at ${outdir}`);
    await rm(outdir, { recursive: true, force: true });
}
await mkdir(outdir, { recursive: true }); // Ensure dist directory exists

const start = performance.now();

// Define explicit entry points
const entrypoints = [
    "src/index.tsx", // For popup (linked from public/index.html)
    "src/setup.tsx", // For setup page (linked from public/setup.html)
    "src/background.ts", // Background service worker
];
console.log(`🔧 Building entry points: ${entrypoints.join(", ")}`);

// Build the entry points
const result = await build({
    entrypoints,
    outdir,
    plugins: [plugin],
    minify: true,
    target: "browser",
    sourcemap: "linked", // Use 'none' for production builds if preferred
    define: {
        "process.env.NODE_ENV": JSON.stringify("production"),
        // Add other defines if needed
    },
    ...cliConfig, // Merge in any CLI-provided options
});

// Print the build results
const end = performance.now();
const buildTime = (end - start).toFixed(2);

if (result.success) {
    console.log(`\n✅ Build successful in ${buildTime}ms`);

    const outputTable = result.outputs.map((output) => ({
        File: path.relative(process.cwd(), output.path),
        Type: output.kind,
        Size: formatFileSize(output.size),
    }));
    console.table(outputTable);

    // Copy static assets
    console.log("\n📦 Copying static assets...");
    const assetsToCopy = [
        "manifest.json",
        "icon.png",
        "icon-dev.png",
        // Add other static assets here if needed
    ];
    assetsToCopy.forEach((asset) => {
        const srcPath = path.join(process.cwd(), asset);
        const destPath = path.join(outdir, asset);
        if (existsSync(srcPath)) {
            cpSync(srcPath, destPath);
            console.log(`  - Copied ${asset}`);
        } else {
            console.warn(`  - Warning: Asset not found ${asset}`);
        }
    });

    // Copy public directory contents (HTML files)
    if (existsSync(publicDir)) {
        const publicFiles = [...new Bun.Glob("**/*").scanSync({ cwd: publicDir })];
        publicFiles.forEach((file) => {
            const srcPath = path.join(publicDir, file);
            const destPath = path.join(outdir, file);
            cpSync(srcPath, destPath);
            console.log(`  - Copied public/${file}`);
        });
    } else {
        console.warn(`  - Warning: Public directory not found at ${publicDir}`);
    }

    console.log("\n✨ Build process complete.\n");
} else {
    console.error("\n❌ Build failed:");
    console.error(result.logs.join("\n"));
    process.exit(1);
}
