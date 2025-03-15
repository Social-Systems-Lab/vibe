import React, { useState, useEffect } from "react";
import { VscChromeMaximize, VscChromeMinimize, VscChromeClose } from "react-icons/vsc";
import { CreateAccountForm } from "./CreateAccountForm";
import { LoginForm } from "./LoginForm";
import { useAtom } from "jotai";
import { signInStatusAtom, accountsAtom, signedInAccountsAtom } from "../atoms";

import defaultPicture from "../../assets/default-picture10.png";

export { defaultPicture };

export const AccountManager = () => {
    const [accounts, setAccounts] = useAtom(accountsAtom);
    const [signInStatus, setSignInStatus] = useAtom(signInStatusAtom);
    const [, setSignedInAccounts] = useAtom(signedInAccountsAtom);

    useEffect(() => {
        window.electron.getAccounts().then((accounts) => {
            console.log(accounts);
            setAccounts(accounts);
            if (accounts && accounts.length > 0) {
                setSignInStatus("loggingIn");
            } else {
                setSignInStatus("creatingAccount");
            }
        });
    }, []);

    const onCreateAccount = (name, password, picture) => {
        window.electron.createAccount(name, password, picture).then(() => {
            console.log("Account created successfully");
            window.electron.getAccounts().then((accounts) => {
                console.log(accounts);
                setAccounts(accounts);
            });
            onLogin(name, password);
        });
    };

    const onLogin = (name, password) => {
        window.electron.login(name, password).then((account) => {
            console.log("Account logged in successfully");
            console.log("Logged in account: ", JSON.stringify(account));

            setSignedInAccounts((x) => {
                console.log("Setting signed in accounts");
                if (!x.find((y) => y.name === name)) {
                    // get logged in account from accounts
                    return [...x, account];
                }
                return x;
            });
            setSignInStatus("loggedIn");
        }, console.error);
    };

    if (signInStatus === "loggedIn") return null;

    return (
        <>
            <div className="flex flex-col h-full">
                <div className="title-bar">
                    <div className="flex-grow"></div>
                    <div className="flex [app-region:none]">
                        <button 
                            className="window-control-btn"
                            aria-label="Minimize Window"
                            onClick={() => window.electron.minimizeWindow()}
                        >
                            <VscChromeMinimize />
                        </button>

                        <button
                            className="window-control-btn"
                            aria-label="Maximize Window"
                            onClick={() => window.electron.maximizeWindow()}
                        >
                            <VscChromeMaximize />
                        </button>

                        <button
                            className="window-close-btn"
                            aria-label="Close Window"
                            onClick={() => window.electron.closeWindow()}
                        >
                            <VscChromeClose />
                        </button>
                    </div>
                </div>
                <div className="flex flex-col items-center">
                    <div className="flex flex-col p-10 pt-24 max-w-lg">
                        {signInStatus === "loggingIn" && <LoginForm accounts={accounts} onLogin={onLogin} />}
                        {signInStatus === "creatingAccount" && <CreateAccountForm onCreateAccount={onCreateAccount} />}
                    </div>
                </div>
            </div>
        </>
    );
};