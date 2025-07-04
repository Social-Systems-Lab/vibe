import { readFile, writeFile } from "fs/promises";
import path from "path";

const filePath = path.join("./dist", "index.js");
const directive = '"use client";';

async function addUseClientDirective() {
    try {
        const content = await readFile(filePath, "utf-8");
        if (!content.trim().startsWith(directive)) {
            const newContent = `${directive}\n${content}`;
            await writeFile(filePath, newContent, "utf-8");
            console.log(`Added "use client" to ${filePath}`);
        } else {
            console.log(`"use client" already exists in ${filePath}`);
        }
    } catch (error) {
        console.error(`Error processing file ${filePath}:`, error);
        process.exit(1);
    }
}

addUseClientDirective();
