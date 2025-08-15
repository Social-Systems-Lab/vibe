#!/usr/bin/env node
/**
 * Cross-platform cleaner for Next.js build caches.
 * Recursively removes all ".next" and ".swc" directories from the repo.
 */
const fs = require("fs");
const path = require("path");

const root = process.cwd();
const targets = new Set([".next", ".swc"]);
let removed = 0;

function removeDir(dir) {
    try {
        fs.rmSync(dir, { recursive: true, force: true });
        removed++;
        console.log("Removed:", dir);
    } catch (e) {
        console.warn("Failed to remove:", dir, "-", e.message);
    }
}

function walk(dir) {
    let entries;
    try {
        entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch (e) {
        // Ignore unreadable directories
        return;
    }

    for (const entry of entries) {
        if (!entry.isDirectory()) continue;

        // Skip heavy/irrelevant directories
        if (entry.name === "node_modules" || entry.name === ".git" || entry.name === ".pnpm-store") {
            continue;
        }

        if (targets.has(entry.name)) {
            removeDir(path.join(dir, entry.name));
            // do not descend into a just-removed directory
            continue;
        }

        walk(path.join(dir, entry.name));
    }
}

console.log("Cleaning Next.js caches (.next, .swc) under:", root);
walk(root);
console.log(`Done. Removed ${removed} directories.`);
