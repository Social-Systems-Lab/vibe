#!/usr/bin/env node
const { spawn } = require("child_process");
const concurrently = require("concurrently");

// Parse command-line arguments
const args = process.argv.slice(2);
const apps = args.length ? args : ["web", "contacts"]; // Default to all apps if no args

// Add this to the top of dev.js
if (args.includes("--help") || args.includes("-h")) {
    console.log(`
  Development script for Vibe monorepo
  
  Usage:
    npm run dev [app1] [app2] ...
  
  Available apps:
    web        - vibe-web developer portal
    contacts   - contacts application
    
  Examples:
    npm run dev              - Runs watches + all apps (default)
    npm run dev contacts     - Runs watches + contacts app
    npm run dev web contacts - Runs watches + both apps
    `);
    process.exit(0);
}

// Map app names to npm scripts
const appScripts = {
    web: "start-vibe-web",
    contacts: "start-app-contacts",
    // Add more apps here as they're added to your monorepo
};

// Build the commands array
const commands = [
    { command: "npm run watch-vibe-sdk", name: "sdk", prefixColor: "blue" },
    { command: "npm run watch-vibe-react", name: "react", prefixColor: "magenta" },
];

// Add requested apps
apps.forEach((app) => {
    const scriptName = appScripts[app];
    if (!scriptName) {
        console.error(`Unknown app: ${app}`);
        process.exit(1);
    }
    commands.push({
        command: `npm run ${scriptName}`,
        name: app,
        prefixColor: "green",
    });
});

// Run all commands concurrently
concurrently(commands, {
    prefix: "name",
    timestampFormat: "HH:mm:ss",
}).catch((err) => {
    console.error(err);
    process.exit(1);
});
