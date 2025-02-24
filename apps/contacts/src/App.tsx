// App.tsx
import { AppManifest } from "vibe-sdk";
import { VibeProvider } from "./components/vibe-context";
import Contacts from "./components/contacts";
import packageJson from "../package.json";
import { useEffect } from "react";

const manifest: AppManifest = {
    id: "dev.vibeapp.contacts",
    name: "Contacts",
    description: "Official Contacts App",
    permissions: ["read.contacts", "write.contacts"],
    pictureUrl: "http://192.168.10.204:5201/icon.png",
};

function App() {
    useEffect(() => {
        console.log("%c🔵 Contacts v" + packageJson.version + " 🔵", "background: #4A90E2; color: white; padding: 2px 4px; border-radius: 3px;");
    }, []);

    return (
        <VibeProvider manifest={manifest} autoInit>
            <div>
                <Contacts />
            </div>
        </VibeProvider>
    );
}

export default App;
