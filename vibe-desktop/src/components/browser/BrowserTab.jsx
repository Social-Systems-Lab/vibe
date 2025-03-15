import React, { useState, useMemo, useRef, useEffect, useLayoutEffect } from "react";
import { FiLock, FiArrowLeft, FiArrowRight, FiRefreshCw, FiBook, FiBookmark } from "react-icons/fi";
import { MdOutlinePlaylistAddCircle, MdArrowDropDown, MdArrowRight } from "react-icons/md";
import { BsHouseLock, BsHouseLockFill, BsBookmarkPlus, BsBookmarkStar, BsStar, BsBook } from "react-icons/bs";
import { AiOutlinePlusCircle, AiOutlineHeart } from "react-icons/ai";
import { BsFillShieldLockFill, BsPersonFillLock, BsBookmarkHeart } from "react-icons/bs";
import { BiSolidLockAlt, BiBookHeart, BiSolidBookHeart, BiBookmarkHeart } from "react-icons/bi";
import { RiHeartAddLine, RiHeartAddFill } from "react-icons/ri";
import { LuFolderHeart } from "react-icons/lu";
import { Tree } from "react-arborist";
import { FiRss, FiMessageCircle, FiUsers, FiVideo, FiCalendar, FiHome } from "react-icons/fi";
import { MdOutlinePayment, MdOutlinePersonAdd } from "react-icons/md";
import useWindowDimensions from "../useWindowDimensions";
import ContextMenu from "./ContextMenu";
import { defaultPicture } from "../account/AccountManager";
import { useAtom } from "jotai";
import { configAtom } from "../atoms";
import Directory from "../directory/Directory";

const data = [
    {
        id: "1",
        name: "Social Systems Lab",
        favicon: "https://www.socialsystems.io/favicon.ico",
        url: "https://www.socialsystems.io",
        children: [
            { id: "c1", name: "Circles", favicon: "https://codo.earth/codo-logo.svg" },
            { id: "c2", name: "Altruistic Wallet", favicon: "https://codo.earth/codo-logo.svg" },
            { id: "c3", name: "co:do", favicon: "https://codo.earth/codo-logo.svg" },
        ],
    },
    { id: "2", name: "Basinkomstpartiet", favicon: "https://www.basinkomstpartiet.org/favicon.ico", url: "https://www.basinkomstpartiet.org" },
    {
        id: "3",
        name: "Politik",
        favicon:
            "https://ik.imagekit.io/4nfhhm6unw/storage/v0/b/codo-fab51.appspot.com/o/circles%2FC1uSY5I7kbgL0fqXTTIz%2Fpublic%2Fpicture?alt=media&token=938b2237-3ba2-43a2-a937-f1c45f600afb&tr=w-60,h-60",
        children: [{ id: "d1", name: "Test" }],
    },
    {
        id: "4",
        name: "The Truman Show",
        url: "https://www.imdb.com/title/tt0120382/?ref_=nv_sr_srsg_0_tt_8_nm_0_q_the%2520truman%2520show",
        favicon: "https://www.imdb.com/favicon.ico",
    },
];

const FolderArrow = ({ node }) => {
    return (
        <div className="w-4 min-w-4">
            {node.children?.length > 0 && (
                <>
                    {node.isLeaf ? null : node.isOpen ? (
                        <MdArrowDropDown
                            className="cursor-pointer"
                            onMouseDown={(e) => e.stopPropagation()}
                            onClick={(e) => {
                                e.stopPropagation();
                                if (node.isInternal) node.toggle();
                            }}
                        />
                    ) : (
                        <MdArrowRight
                            className="cursor-pointer"
                            onMouseDown={(e) => e.stopPropagation()}
                            onClick={(e) => {
                                e.stopPropagation();
                                if (node.isInternal) node.toggle();
                            }}
                        />
                    )}
                </>
            )}
        </div>
    );
};

const Toolbar = ({ activeSection, onSectionClick }) => {
    return (
        <div className="flex space-x-1 pl-2.5 pb-1.5 pt-1.5">
            <button
                aria-label="Home"
                className={`rounded-full px-2.5 py-1 text-sm font-normal flex items-center ${activeSection === "home" ? 'bg-gray-100' : 'hover:bg-gray-50'}`}
                onClick={() => onSectionClick("home")}
            >
                <FiHome className="mr-1.5" />
                Home
            </button>
            <button
                aria-label="Feed"
                className={`rounded-full px-2.5 py-1 text-sm font-normal flex items-center ${activeSection === "feed" ? 'bg-gray-100' : 'hover:bg-gray-50'}`}
                onClick={() => onSectionClick("feed")}
            >
                <FiRss className="mr-1.5" />
                Feed
            </button>
            <button
                aria-label="Chat"
                className={`rounded-full px-2.5 py-1 text-sm font-normal flex items-center ${activeSection === "chat" ? 'bg-gray-100' : 'hover:bg-gray-50'}`}
                onClick={() => onSectionClick("chat")}
            >
                <FiMessageCircle className="mr-1.5" />
                Chat
            </button>
            <button
                aria-label="Circles"
                className={`rounded-full px-2.5 py-1 text-sm font-normal flex items-center ${activeSection === "circles" ? 'bg-gray-100' : 'hover:bg-gray-50'}`}
                onClick={() => onSectionClick("circles")}
            >
                <LuFolderHeart className="mr-1.5" />
                Links
            </button>
            <button
                aria-label="Video"
                className={`rounded-full px-2.5 py-1 text-sm font-normal flex items-center ${activeSection === "video" ? 'bg-gray-100' : 'hover:bg-gray-50'}`}
                onClick={() => onSectionClick("video")}
            >
                <FiVideo className="mr-1.5" />
                Video
            </button>
            <button
                aria-label="Members"
                className={`rounded-full px-2.5 py-1 text-sm font-normal flex items-center ${activeSection === "members" ? 'bg-gray-100' : 'hover:bg-gray-50'}`}
                onClick={() => onSectionClick("members")}
            >
                <FiUsers className="mr-1.5" />
                Members
            </button>
            <button
                aria-label="Calendar"
                className={`rounded-full px-2.5 py-1 text-sm font-normal flex items-center ${activeSection === "calendar" ? 'bg-gray-100' : 'hover:bg-gray-50'}`}
                onClick={() => onSectionClick("calendar")}
            >
                <FiCalendar className="mr-1.5" />
                Calendar
            </button>
            <button
                aria-label="Donate"
                className="rounded-full px-2.5 py-1 text-sm font-normal flex items-center text-blue-600 hover:bg-blue-50"
            >
                <MdOutlinePayment className="mr-1.5" />
                Donate
            </button>
            <button
                aria-label="Join"
                className="rounded-full px-2.5 py-1 text-sm font-normal flex items-center text-green-600 hover:bg-green-50"
            >
                <MdOutlinePersonAdd className="mr-1.5" />
                Join
            </button>
        </div>
    );
};

const BrowserTab = ({ initialUrl, setTitle, setFavicon, openUrlInNewTab, initialAccount, isActive }) => {
    const [currentAccount, setCurrentAccount] = useState(initialAccount);
    const [config] = useAtom(configAtom);

    const isHomeUrl = (in_url) => {
        return !in_url || in_url.toLowerCase() === "home" || in_url.toLowerCase() === "about:blank";
    };

    const getFormattedUrl = (in_url) => {
        if (isHomeUrl(in_url)) return "about:blank";
        return in_url.startsWith("http") ? in_url : `https://${in_url}`;
    };

    const [url, setUrl] = useState(initialUrl);
    const [activeUrl, setActiveUrl] = useState(initialUrl);
    const [isDomReady, setIsDomReady] = useState(false);
    const webViewRef = useRef(null);
    const inputRef = useRef(null);
    const { windowHeight } = useWindowDimensions();
    const [activeSection, setActiveSection] = useState("home");
    const handleSectionClick = (section) => {
        setActiveSection(section);
    };
    const isHome = useMemo(() => activeUrl === "Home", [activeUrl]);

    const [isCirclesExplorerOpen, setIsCirclesExplorerOpen] = useState(false);
    const circlesExplorerRef = useRef(null);
    const circlesExplorerIconRef = useRef(null);

    const [contextMenuOpen, setContextMenuOpen] = useState(false);
    const [mouseX, setMouseX] = useState(0);
    const [mouseY, setMouseY] = useState(0);
    const [href, setHref] = useState(undefined);
    const [src, setSrc] = useState(undefined);

    const navigateToUrl = (in_url) => {
        let formattedUrl = getFormattedUrl(in_url);
        if (isHomeUrl(in_url)) {
            setUrl("Home");
            setActiveUrl("Home");
        } else {
            setUrl(formattedUrl);
            setActiveUrl(formattedUrl);
        }
        webViewRef.current?.loadURL(formattedUrl);
    };

    useEffect(() => {
        if (!webViewRef.current) return;

        // handle dom ready event
        const handleDomReady = () => {
            setIsDomReady(true);
        };
        webViewRef.current.addEventListener("dom-ready", handleDomReady);

        // handle messages from web view (e.g. new tab, context-menu, etc)
        const handleMessageFromWebView = (event) => {
            console.log("event received: " + JSON.stringify(event));
            if (event.type === "new-tab") {
                openUrlInNewTab(event.href);
            } else if (event.type === "context-menu") {
                setMouseX(event.mouseX);
                setMouseY(event.mouseY);
                setHref(event.href);
                setSrc(event.src);
                setContextMenuOpen(true);
            } else if (event.type === "document-click" || event.type === "window-blur") {
                setIsCirclesExplorerOpen(false);
                setContextMenuOpen(false);
            }
        };
        const listenFromMain = window.electron.on("fromMain", handleMessageFromWebView);

        // handle navigation events from webview
        const handleNavigation = (event) => {
            const webview = event.target;
            let in_url = webview.getURL();
            if (isHomeUrl(in_url)) {
                setUrl("Home");
                setActiveUrl("Home");
            } else {
                setUrl(in_url);
                setActiveUrl(in_url);
            }
        };
        webViewRef.current?.addEventListener("did-navigate", handleNavigation);

        // handle page title updated events
        const handlePageTitleUpdated = (e) => {
            console.log("page-title-updated: " + e.title);
            setTitle(e.title);
        };
        webViewRef.current?.addEventListener("page-title-updated", handlePageTitleUpdated);

        // handle page favicon updated events
        const handlePageFaviconUpdated = (e) => {
            console.log("page-favicon-updated: " + e.favicons[0]);
            setFavicon(e.favicons[0]);
        };
        webViewRef.current?.addEventListener("page-favicon-updated", handlePageFaviconUpdated);

        // handle clicks outside the circles explorer menu
        const handleClickOutside = (event) => {
            if (
                circlesExplorerRef.current &&
                circlesExplorerIconRef.current &&
                !circlesExplorerRef.current.contains(event.target) &&
                !circlesExplorerIconRef.current.contains(event.target)
            ) {
                setIsCirclesExplorerOpen(false);
            }
            setContextMenuOpen(false);
        };
        document.addEventListener("mousedown", handleClickOutside);

        return () => {
            webViewRef.current?.removeEventListener("dom-ready", handleDomReady);
            webViewRef.current?.removeEventListener("did-navigate", handleNavigation);
            webViewRef.current?.removeEventListener("page-title-updated", handlePageTitleUpdated);
            webViewRef.current?.removeEventListener("page-favicon-updated", handlePageFaviconUpdated);
            window.electron.removeListener("fromMain", listenFromMain);
            document.addEventListener("mousedown", handleClickOutside);
        };
    }, []);

    useEffect(() => {
        if (!isDomReady) return;

        console.log("dom ready");

        //webViewRef.current?.openDevTools(); // TODO open dev tools through a button/menu/shortcut
        injectScript();

        setIsDomReady(false);
    }, [isDomReady]);

    const handleUrlChange = (event) => {
        setUrl(event.target.value);
    };

    const handleUrlKeyPress = (event) => {
        if (event.key === "Enter") {
            navigateToUrl(url);
        }
    };

    const handleBackClick = () => {
        webViewRef.current?.goBack();
    };

    const handleForwardClick = () => {
        webViewRef.current?.goForward();
    };

    const handleRefreshClick = () => {
        webViewRef.current?.reload();
    };

    const handleFocus = (event) => event.target.select();

    const handleCirclesExplorerClick = () => {
        console.log("circles explorer");
        setIsCirclesExplorerOpen(!isCirclesExplorerOpen);
    };

    const handleAccountClick = () => {};

    const injectScript = () => {
        const script = `
            console.log("script injected");
            document.addEventListener('auxclick', (event) => {
                if (event.button === 1) {
                    console.log("middle mouse click: " + window.electron);
                    if (!window.electron) return;

                    const { href } = event.target.closest('a') || {};
                    if (href) {
                        event.preventDefault();
                        window.electron.send('toMain', { type: 'new-tab', href });
                    }
                }
            });

            document.addEventListener('contextmenu', (event) => {
                console.log("right click");
                const { href } = event.target.closest('a') || {};
                const { src } = event.target.closest('img') || {};
                event.preventDefault();
                window.electron.send('toMain', { type: 'context-menu', href, src, mouseX: event.clientX, mouseY: event.clientY });
            });

            document.addEventListener('click', () => {
                window.electron.send('toMain', { type: 'document-click' });
            });
        `;

        webViewRef.current?.executeJavaScript(script);
    };

    const CircleTreeNode = ({ node, style }) => {
        return (
            <div
                style={style}
                className={`flex flex-row items-center ${node.data.isSelected ? 'bg-[#c5c5c5]' : 'bg-transparent hover:bg-[#eaeaea]'} cursor-pointer pb-0 select-none`}
                onClick={(e) => {
                    // navigate to circle
                    navigateToUrl(node.data.url);
                    setIsCirclesExplorerOpen(false);
                }}
                onAuxClick={(e) => {
                    if (e.button === 1) {
                        // open circle in new tab
                        openUrlInNewTab(node.data.url);
                        setIsCirclesExplorerOpen(false);
                    }
                }}
            >
                <div className="ml-2.5 flex flex-row items-center">
                    <FolderArrow node={node} />
                    <img src={node.data.favicon} className="text-[#666666] w-[18px] min-w-[18px] h-[18px] mr-1.5" />
                    <span className="text-[#5f5f5f] text-base truncate h-[21px]">
                        {node.data.name}
                    </span>
                </div>
            </div>
        );
    };

    const CustomTooltip = ({ label, children }) => {
        return (
            <div className="group relative">
                {children}
                <div className="absolute z-10 hidden group-hover:block bottom-full left-1/2 transform -translate-x-1/2 mb-1 px-3 py-1 text-xs bg-gray-900 text-white rounded">
                    {label}
                </div>
            </div>
        );
    };

    return (
        <div className="flex flex-col h-full">
            <div className="h-[40px] flex items-center px-2.5 mt-2">
                <div className="flex space-x-0">
                    <button 
                        aria-label="Back" 
                        className="rounded-full p-2 hover:bg-gray-200" 
                        onClick={handleBackClick}
                    >
                        <FiArrowLeft />
                    </button>
                    <button 
                        aria-label="Forward" 
                        className="rounded-full p-2 hover:bg-gray-200" 
                        onClick={handleForwardClick}
                    >
                        <FiArrowRight />
                    </button>
                    <button 
                        aria-label="Refresh" 
                        className="rounded-full p-2 hover:bg-gray-200" 
                        onClick={handleRefreshClick}
                    >
                        <FiRefreshCw />
                    </button>
                </div>
                <div className="flex-grow relative flex items-center">
                    <input
                        type="text"
                        value={url}
                        onChange={handleUrlChange}
                        onKeyDown={handleUrlKeyPress}
                        className="rounded-full border border-gray-300 w-full ml-2.5 pl-4 pr-8 py-1.5 focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                        style={{ paddingLeft: isHome ? '38px' : '16px' }}
                        onFocus={handleFocus}
                        ref={inputRef}
                    />
                    {isHome && (
                        <CustomTooltip label="This is your private circle, everything here is local to your device and not accessible to anyone but you">
                            <button
                                aria-label="Home icon"
                                className="absolute left-[15px] rounded-full p-1 hover:bg-gray-200 w-[32px] h-[32px] z-10"
                                onClick={handleRefreshClick}
                            >
                                <BiSolidLockAlt className="w-full h-full" />
                            </button>
                        </CustomTooltip>
                    )}
                    <button
                        aria-label="Add to circle"
                        className="absolute right-[5px] rounded-full p-1 hover:bg-gray-200 w-[32px] h-[32px] z-10"
                        onClick={handleRefreshClick}
                    >
                        <RiHeartAddLine className="w-full h-full" />
                    </button>
                </div>
                <button
                    ref={circlesExplorerIconRef}
                    aria-label="Circles Explorer"
                    className="rounded-full p-2 hover:bg-gray-200 ml-2.5"
                    onClick={handleCirclesExplorerClick}
                >
                    <LuFolderHeart />
                </button>
                <button
                    aria-label="Current Account"
                    className="rounded-full p-2 hover:bg-gray-200"
                    onClick={handleAccountClick}
                >
                    <img
                        src={`/dist-electron/main/Accounts/${currentAccount.name}/picture.png`}
                        alt={defaultPicture}
                        className="w-[28px] h-[28px] object-cover rounded-full"
                    />
                </button>
            </div>
            
            {!isHome && <Toolbar activeSection={activeSection} onSectionClick={handleSectionClick} />}
            
            <div className="flex-grow relative">
                <webview
                    ref={webViewRef}
                    src={getFormattedUrl(initialUrl)}
                    preload={config.webviewPreloadPath}
                    style={{ width: "100%", height: "100%" }}
                ></webview>

                {activeSection !== "home" && (
                    <div className="w-screen h-screen top-0 left-0 bg-[#a9a9a9] absolute z-10"></div>
                )}
                
                {isHome && (
                    <div className="z-10 absolute top-0 left-0 w-full h-full">
                        <Directory account={currentAccount} />
                    </div>
                )}
            </div>

            {isCirclesExplorerOpen && (
                <div 
                    ref={circlesExplorerRef}
                    className="absolute right-[10px] top-[105px] w-[300px] min-h-[100px] max-h-[calc(100vh-105px)] overflow-y-auto bg-white shadow-md border border-gray-200 rounded-md z-10"
                >
                    <div
                        className="flex flex-row items-center cursor-pointer pb-0 bg-[#f8f8f8] hover:bg-[#eaeaea] select-none h-[44px] pl-2.5 mb-1.5"
                        onClick={(e) => {
                            // TODO navigate to circle
                        }}
                    >
                        <img
                            src="https://ik.imagekit.io/4nfhhm6unw/storage/v0/b/codo-fab51.appspot.com/o/circles%2FCuu0TEAx01WIKOu2iXqBmHV7A2t1%2Fpublic%2Fpicture?alt=media&token=0f46a5a4-b0b2-4bfb-aa47-18e179307dab&tr=w-128,h-128"
                            className="text-[#666666] w-[18px] min-w-[18px] h-[18px] mr-2 rounded-full"
                        />
                        <span className="font-medium text-[#5f5f5f] text-base truncate">
                            Patrik Opacic
                        </span>
                    </div>
                    <Tree data={data} openByDefault={false} width="100%" height={windowHeight - 165} indent={10}>
                        {CircleTreeNode}
                    </Tree>
                </div>
            )}

            {contextMenuOpen && <ContextMenu mouseX={mouseX} mouseY={mouseY} href={href} src={src} />}
        </div>
    );
};

export default BrowserTab;