// App.tsx
import React from "react";
import { AppManifest } from "vibe-sdk";
import { VibeProvider } from "./components/vibe-context";
import Contacts from "./components/contacts";

const manifest: AppManifest = {
    id: "dev.vibeapp.contacts",
    name: "Contacts",
    description: "Official Contacts App",
    permissions: ["read.contacts", "write.contacts"],
    pictureUrl: "http://192.168.10.204:5201/icon.png",
};

function App() {
    return (
        <VibeProvider manifest={manifest} autoInit>
            <div>
                <Contacts />
            </div>
        </VibeProvider>
    );
}

export default App;
