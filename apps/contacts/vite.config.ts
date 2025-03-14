import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import tailwindcss from "@tailwindcss/vite";

// https://vite.dev/config/
export default defineConfig({
    base: "/apps/contacts/",
    plugins: [react(), tailwindcss()],
    server: {
        port: 5201,
        host: true,
        allowedHosts: ["39bf-83-188-250-13.ngrok-free.app"], // dev ngrok
    },
});
