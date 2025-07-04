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
    if (!output.path.endsWith(".js")) {
        continue;
    }

    const buffer = await output.arrayBuffer();
    let text = new TextDecoder().decode(buffer);

    if (text.includes('"use client";')) {
        console.log(`Found "use client" in ${output.path}, hoisting to top.`);

        // Remove all "use client" directives
        text = text.replaceAll(/"use client";/g, "");

        // Remove blank lines from the start
        const lines = text.split("\n");
        while (lines.length > 0 && lines[0].trim() === "") {
            lines.shift();
        }
        text = lines.join("\n");

        // Add the directive at the very top
        text = '"use client";\n' + text;

        await Bun.write(output.path, text);
    }
}

console.log("Build and post-processing complete.");
