import { useEffect, useState } from "react";
import Browser from "./components/browser/Browser";
import { AccountManager } from "./components/account/AccountManager";
import { useAtom } from "jotai";
import { signInStatusAtom, configAtom } from "./components/atoms";

function App() {
    const [signInStatus] = useAtom(signInStatusAtom);
    const [config, setConfig] = useAtom(configAtom);
    useEffect(() => {
        window.electron.getConfig().then((config) => {
            setConfig(config);
        });
    }, []);

    if (!config) return null;

    return (
        <div className="w-full h-full">
            <AccountManager />
            {signInStatus === "loggedIn" && <Browser />}
        </div>
    );
}

export default App;