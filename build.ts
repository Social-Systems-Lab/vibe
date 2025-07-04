import { $ } from "bun";

console.log("Starting monorepo build...");

// Build vibe-cloud-api
console.log("Building vibe-cloud-api...");
await $`bun --cwd apps/vibe-cloud-api run build`;

// Build vibe-sdk
console.log("Building vibe-sdk...");
await $`bun --cwd packages/vibe-sdk run build`;

// Build vibe-react
console.log("Building vibe-react...");
await $`bun --cwd packages/vibe-react run build`;

console.log("Monorepo build complete.");
