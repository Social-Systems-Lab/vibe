/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: ["class"],
  content: [
    "./app/**/*.{ts,tsx,mdx}",
    // Include the library source so utilities used inside it are generated
    "../../packages/vibe-react/src/**/*.{ts,tsx}",
    // Also include built JS from the package so all classnames used at runtime are scanned
    "../../packages/vibe-react/dist/**/*.{js,cjs,mjs}",
  ],
  theme: { extend: {} },
  plugins: [require("tailwindcss-animate")],
};
