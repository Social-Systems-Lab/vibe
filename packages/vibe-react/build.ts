import dts from "bun-plugin-dts";

console.log("Starting custom build for vibe-react...");

const result = await Bun.build({
    entrypoints: ["./src/index.tsx"],
    outdir: "./dist",
    external: ["react", "react-dom", "react/jsx-runtime"],
    plugins: [
        dts({
            // options
        }),
    ],
});

if (!result.success) {
    console.error("Build failed");
    for (const message of result.logs) {
        console.error(message);
    }
    process.exit(1);
}

console.log("Bun build successful. Post-processing files...");

// Post-build step to fix "use client" directive
for (const output of result.outputs) {
    const buffer = await output.arrayBuffer();
    let text = new TextDecoder().decode(buffer);

    const hasUseClient = text.includes(`"use client";`);
    if (hasUseClient) {
        console.log(`Found "use client" in ${output.path}, hoisting to top.`);
        // Remove all instances and add one to the top
        text = text.replaceAll(`"use client";`, "");
        text = `"use client";\n` + text;

        // Write the modified file
        await Bun.write(output.path, text);
    }
}

console.log("Build and post-processing complete.");
