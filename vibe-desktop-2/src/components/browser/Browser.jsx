import React, { useState, useRef, useEffect, useLayoutEffect } from "react";
import { FiArrowLeft, FiArrowRight, FiRefreshCw, FiX, FiPlus } from "react-icons/fi";
import BrowserTab from "./BrowserTab";
import { VscChromeMaximize, VscChromeMinimize, VscChromeClose } from "react-icons/vsc";
import { useAtom } from "jotai";
import { signedInAccountsAtom } from "../atoms";
import { defaultPicture } from "../account/AccountManager";

export const tabPanelBackgroundColor = "#f4f4f4"; //"#f7f7f7";

const LeftCurve = ({ fillColor, size }) => {
    return (
        <svg width={size} height={size} viewBox="0 0 1200 1200">
            <path
                d="m1200 0v1200c0.058594-235.95-69.441-466.67-199.8-663.33-130.37-196.66-315.81-350.52-533.16-442.35-147.77-62.453-306.61-94.531-467.04-94.32z"
                fill={fillColor}
            />
        </svg>
    );
};

const BrowserTabHeader= ({ title, favicon, isActive, onClick, onClose }) => {
    const handleAuxClick = (e) => {
        if (e.button === 1) {
            onClose();
        }
    };

    return (
        <div
            onClick={onClick}
            onAuxClick={handleAuxClick}
            className={`flex items-center cursor-pointer mt-2.5 rounded-t-lg ${isActive ? 'bg-white' : 'bg-[#f4f4f4] hover:bg-[#fcfcfc]'} max-w-[210px] h-[40px] px-2.5 [app-region:none] relative z-${isActive ? '2' : '1'}`}
        >
            {isActive && (
                <>
                    <div className="absolute bottom-0 left-[-15px] w-[15px] h-[15px] rotate-90">
                        <LeftCurve fillColor="white" size="15px" />
                    </div>
                    <div className="absolute bottom-0 right-[-15px] w-[15px] h-[15px] rotate-90 scale-y-[-1]">
                        <LeftCurve fillColor="white" size="15px" />
                    </div>
                </>
            )}

            {favicon && <img src={favicon} className="w-[18px] h-[18px] mr-1.5 rounded-full object-cover" />}
            <span className="truncate">{title}</span>
            <button
                aria-label="Close"
                className="rounded-full p-0.5 hover:bg-gray-200 ml-0.5 w-[18px] h-[18px] min-w-[18px]"
                onMouseDown={(e) => e.stopPropagation()}
                onClick={(e) => {
                    e.stopPropagation();
                    onClose();
                }}
            >
                <FiX className="w-full h-full" />
            </button>
        </div>
    );
};

const Browser = () => {
    const [signedInAccounts] = useAtom(signedInAccountsAtom);
    const [tabs, setTabs] = useState([]);
    const [activeTabIndex, setActiveTabIndex] = useState(0);
    const [isInitialized, setIsInitialized] = useState(false);

    useEffect(() => {
        if (isInitialized) return;
        if (!signedInAccounts || signedInAccounts.length <= 0) return;

        console.log("signedInAccounts", JSON.stringify(signedInAccounts, null, 2));
        addTab("Home");
        setIsInitialized(true);
    }, [isInitialized, signedInAccounts]);

    const addTab = (url = "Home", activateTab = true) => {
        let initialAccount = signedInAccounts[0];
        let newTab = {
            url,
            initialAccount,
        };
        if (url === "Home") {
            newTab.title = "Home";
            newTab.favicon = initialAccount ? `/dist-electron/main/Accounts/${initialAccount.name}/picture.png` : defaultPicture;
        }

        setTabs((prevTabs) => [...prevTabs, newTab]);
        if (activateTab) {
            setActiveTabIndex(tabs.length); // set the new tab as active 
        }
    };

    const closeTab = (index) => {
        console.log("Closing tab");
        const updatedTabs = [...tabs];
        let newActiveIndex = activeTabIndex;
        updatedTabs.splice(index, 1);

        // 1. closed tab is the active one
        if (index === activeTabIndex) {
            // is it last tab?
            if (index === updatedTabs.length) {
                newActiveIndex = updatedTabs.length - 1; // activate the previous tab
            } // else: activate the next tab (which now has the same index as the closed one)
        }
        // 2. a tab to the left of the active one is closed
        else if (index < activeTabIndex) {
            newActiveIndex = activeTabIndex - 1;
        } // else: 3. a tab to the right of the active one is closed, no changes needed

        setTabs(updatedTabs);
        setActiveTabIndex(newActiveIndex);
    };

    const updateTabTitle = (index, newTitle) => {
        setTabs((prevTabs) => {
            const updatedTabs = [...prevTabs];
            if (updatedTabs[index]) {
                updatedTabs[index].title = newTitle;
            }
            return updatedTabs;
        });
    };

    const updateTabFavicon = (index, newFavicon) => {
        setTabs((prevTabs) => {
            const updatedTabs = [...prevTabs];
            if (updatedTabs[index]) {
                updatedTabs[index].favicon = newFavicon;
            }
            return updatedTabs;
        });
    };

    const openUrlInNewTab = (url) => {
        addTab(url, false);
    };

    return (
        <div className="flex flex-col h-full">
            <div
                className="flex items-center bg-[#f4f4f4] h-[50px] [app-region:drag] pl-2.5"
            >
                {tabs.map((tab, index) => (
                    <BrowserTabHeader
                        key={index}
                        title={tab.title}
                        favicon={tab.favicon}
                        isActive={index === activeTabIndex}
                        onClick={() => setActiveTabIndex(index)}
                        onClose={() => closeTab(index)}
                    />
                ))}
                <button
                    aria-label="Add Tab"
                    className="rounded-full p-1.5 hover:bg-gray-200 mt-2.5 ml-1.5 w-[30px] h-[30px] min-w-[30px] [app-region:none]"
                    onClick={() => addTab()}
                >
                    <FiPlus className="w-full h-full" />
                </button>
                <div className="flex-grow"></div>
                <div
                    className="flex [app-region:none] self-start"
                >
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
            {tabs.map((tab, index) => (
                <div key={index} className={`${index === activeTabIndex ? 'block' : 'hidden'} flex-grow`}>
                    <BrowserTab
                        initialUrl={tab.url}
                        initialAccount={tab.initialAccount}
                        setTitle={(title) => updateTabTitle(index, title)}
                        setFavicon={(favicon) => updateTabFavicon(index, favicon)}
                        openUrlInNewTab={openUrlInNewTab}
                        isActive={index === activeTabIndex}
                    />
                </div>
            ))}
        </div>
    );
};

export default Browser;