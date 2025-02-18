// App.tsx - Contacts app main entry point
import "./App.css";
import VibeClientComponent from "./components/vibe-client-component";

function App() {
    return (
        <div className="flex flex-col items-center w-full">
            <div className="font-bold text-3xl">Contacts</div>
            <p className="read-the-docs">Click on the Vite and React logos to learn more</p>
            <VibeClientComponent />
        </div>
    );
}

export default App;
