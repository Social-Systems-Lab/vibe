import React, { useState, useMemo, useRef, useEffect, useLayoutEffect } from "react";
import { Box, Image, Button, Text, Input, Portal, HStack, InputGroup, InputLeftElement, InputRightElement, IconButton, Flex, Tooltip } from "@chakra-ui/react";
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
        <Box width="16px" minWidth="16px">
            {node.children?.length > 0 && (
                <>
                    {node.isLeaf ? null : node.isOpen ? (
                        <MdArrowDropDown
                            cursor="pointer"
                            onMouseDown={(e) => e.stopPropagation()}
                            onClick={(e) => {
                                e.stopPropagation();
                                if (node.isInternal) node.toggle();
                            }}
                        />
                    ) : (
                        <MdArrowRight
                            cursor="pointer"
                            onMouseDown={(e) => e.stopPropagation()}
                            onClick={(e) => {
                                e.stopPropagation();
                                if (node.isInternal) node.toggle();
                            }}
                        />
                    )}
                </>
            )}
        </Box>
    );
};

const Toolbar = ({ activeSection, onSectionClick }) => {
    const borderRadius = "107px";
    const size = "xs";
    const variant = "ghost";
    const showIcon = true;
    const fontWeight = "400";
    return (
        <HStack spacing="4px" paddingLeft="10px" paddingBottom="5px" paddingTop="5px">
            <Button
                aria-label="Home"
                variant={variant}
                leftIcon={showIcon ? <FiHome /> : undefined}
                borderRadius={borderRadius}
                size={size}
                fontWeight={fontWeight}
                onClick={() => onSectionClick("home")}
                backgroundColor={activeSection === "home" ? "gray.100" : undefined}
            >
                Home
            </Button>
            <Button
                aria-label="Feed"
                variant={variant}
                leftIcon={showIcon ? <FiRss /> : undefined}
                borderRadius={borderRadius}
                size={size}
                fontWeight={fontWeight}
                onClick={() => onSectionClick("feed")}
                backgroundColor={activeSection === "feed" ? "gray.100" : undefined}
            >
                Feed
            </Button>
            <Button
                aria-label="Chat"
                variant={variant}
                leftIcon={showIcon ? <FiMessageCircle /> : undefined}
                borderRadius={borderRadius}
                size={size}
                fontWeight={fontWeight}
                onClick={() => onSectionClick("chat")}
                backgroundColor={activeSection === "chat" ? "gray.100" : undefined}
            >
                Chat
            </Button>
            <Button
                aria-label="Circles"
                variant={variant}
                leftIcon={showIcon ? <LuFolderHeart /> : undefined}
                borderRadius={borderRadius}
                size={size}
                fontWeight={fontWeight}
                onClick={() => onSectionClick("circles")}
                backgroundColor={activeSection === "circles" ? "gray.100" : undefined}
            >
                Links
            </Button>
            <Button
                aria-label="Video"
                variant={variant}
                leftIcon={showIcon ? <FiVideo /> : undefined}
                borderRadius={borderRadius}
                size={size}
                fontWeight={fontWeight}
                onClick={() => onSectionClick("video")}
                backgroundColor={activeSection === "video" ? "gray.100" : undefined}
            >
                Video
            </Button>
            <Button
                aria-label="Members"
                variant={variant}
                leftIcon={showIcon ? <FiUsers /> : undefined}
                borderRadius={borderRadius}
                size={size}
                fontWeight={fontWeight}
                onClick={() => onSectionClick("members")}
                backgroundColor={activeSection === "members" ? "gray.100" : undefined}
            >
                Members
            </Button>
            <Button
                aria-label="Calendar"
                variant={variant}
                leftIcon={showIcon ? <FiCalendar /> : undefined}
                borderRadius={borderRadius}
                size={size}
                fontWeight={fontWeight}
                onClick={() => onSectionClick("calendar")}
                backgroundColor={activeSection === "calendar" ? "gray.100" : undefined}
            >
                Calendar
            </Button>
            <Button
                leftIcon={showIcon ? <MdOutlinePayment /> : undefined}
                variant={variant}
                colorScheme="blue"
                borderRadius={borderRadius}
                size={size}
                fontWeight={fontWeight}
            >
                Donate
            </Button>
            <Button
                leftIcon={showIcon ? <MdOutlinePersonAdd /> : undefined}
                variant={variant}
                colorScheme="green"
                borderRadius={borderRadius}
                size={size}
                fontWeight={fontWeight}
            >
                Join
            </Button>
        </HStack>
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
            <Flex
                style={style}
                flexDirection="row"
                alignItems="center"
                backgroundColor={node.data.isSelected ? "#c5c5c5" : "transparent"}
                cursor="pointer"
                paddingBottom="0px"
                _hover={{
                    backgroundColor: "#eaeaea",
                }}
                userSelect="none"
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
                <Flex marginLeft="10px" flexDirection="row" align="center">
                    <FolderArrow node={node} />
                    <Image src={node.data.favicon} color="#666666" width="18px" minWidth="18px" height="18px" marginRight="5px" />
                    <Text color={"#5f5f5f"} fontSize={"16px"} noOfLines={1} height="21px">
                        {node.data.name}
                    </Text>
                </Flex>
            </Flex>
        );
    };

    return (
        <Flex flexDirection="column" height="100%">
            <Flex height="40px" align="center" paddingLeft="10px" paddingRight="10px" marginTop="8px">
                <HStack spacing="0px">
                    <IconButton aria-label="Back" icon={<FiArrowLeft />} isRound variant="ghost" onClick={handleBackClick} />
                    <IconButton aria-label="Forward" icon={<FiArrowRight />} isRound variant="ghost" onClick={handleForwardClick} />
                    <IconButton aria-label="Refresh" icon={<FiRefreshCw />} isRound variant="ghost" onClick={handleRefreshClick} />
                </HStack>
                <Flex flexGrow="1" position="relative" align="center">
                    <Input
                        type="text"
                        value={url}
                        onChange={handleUrlChange}
                        onKeyDown={handleUrlKeyPress}
                        borderRadius="100px"
                        marginLeft="10px"
                        paddingLeft={isHome ? "38px" : "16px"}
                        onFocus={handleFocus}
                        ref={inputRef}
                    />
                    {isHome && (
                        <Tooltip
                            label="This is your private circle, everything here is local to your device and not accessible to anyone but you"
                            aria-label="Home"
                        >
                            <IconButton
                                aria-label="Home icon"
                                icon={<BiSolidLockAlt />}
                                isRound
                                variant="ghost"
                                onClick={handleRefreshClick}
                                position="absolute"
                                left="15px"
                                width="32px"
                                minWidth="32px"
                                height="32px"
                                padding="0"
                                zIndex="1"
                            />
                        </Tooltip>
                    )}
                    <IconButton
                        aria-label="Add to circle"
                        icon={<RiHeartAddLine />}
                        // icon={<RiHeartAddFill />}
                        //icon={<AiOutlineHeart />}
                        // icon={<BsBookmarkStar />}
                        // icon={<FiBookmark />}
                        // icon={<BsBookmarkPlus />}
                        // icon={<BsStar />}
                        // icon={<AiOutlinePlusCircle />}
                        isRound
                        variant="ghost"
                        onClick={handleRefreshClick}
                        position="absolute"
                        right="5px"
                        width="32px"
                        minWidth="32px"
                        height="32px"
                        padding="0"
                        zIndex="1"
                    />
                </Flex>
                <IconButton
                    ref={circlesExplorerIconRef}
                    aria-label="Circles Explorer"
                    // icon={<BiBookHeart size="22px" />}
                    icon={<LuFolderHeart />}
                    // icon={<FiBook />}
                    // icon={<BsBook />}
                    isRound
                    variant="ghost"
                    onClick={handleCirclesExplorerClick}
                    marginLeft="10px"
                />
                <IconButton
                    aria-label="Current Account"
                    icon={
                        <Image
                            src={`/dist-electron/main/Accounts/${currentAccount.name}/picture.png`}
                            alt={defaultPicture}
                            width="28px"
                            height="28px"
                            objectFit="cover"
                            borderRadius="50%"
                        />
                    }
                    isRound
                    variant="ghost"
                    onClick={handleAccountClick}
                />
            </Flex>
            {!isHome && <Toolbar activeSection={activeSection} onSectionClick={handleSectionClick} />}
            {/* {isHome && <Toolbar activeSection={activeSection} onSectionClick={handleSectionClick} />} */}
            <Box flexGrow="1" position="relative">
                <webview
                    ref={webViewRef}
                    src={getFormattedUrl(initialUrl)}
                    preload={config.webviewPreloadPath}
                    style={{ width: "100%", height: "100%" }}
                ></webview>

                {activeSection !== "home" && (
                    <Flex width="100vw" height="100vh" top="0" left="0" backgroundColor="#a9a9a9" position="absolute" zIndex="1"></Flex>
                )}
                {isHome && (
                    <Flex zIndex="1" position="absolute" top="0" left="0" width="100%" height="100%">
                        <Directory account={currentAccount} />
                    </Flex>
                )}
            </Box>

            {isCirclesExplorerOpen && (
                <Portal>
                    <Box
                        ref={circlesExplorerRef}
                        position="absolute"
                        right="10px" // position it next to the Circles Explorer button
                        top="105px" // height of the top bar + a little margin
                        width="300px" // fixed width as you mentioned
                        minHeight="100px"
                        maxHeight="calc(100vh - 105px)" // take the remaining vertical space
                        overflowY="auto" // make it scrollable if the content is larger
                        bg="white"
                        boxShadow="md"
                        border="1px solid"
                        borderColor="gray.200"
                        borderRadius="md"
                        zIndex="10"
                        // padding="10px"
                    >
                        <Flex
                            flexDirection="row"
                            align="center"
                            cursor="pointer"
                            paddingBottom="0px"
                            backgroundColor="#f8f8f8"
                            _hover={{
                                backgroundColor: "#eaeaea",
                            }}
                            userSelect="none"
                            onClick={(e) => {
                                // TODO navigate to circle
                            }}
                            height="44px"
                            paddingLeft="10px"
                            marginBottom="5px"
                        >
                            <Image
                                src={
                                    "https://ik.imagekit.io/4nfhhm6unw/storage/v0/b/codo-fab51.appspot.com/o/circles%2FCuu0TEAx01WIKOu2iXqBmHV7A2t1%2Fpublic%2Fpicture?alt=media&token=0f46a5a4-b0b2-4bfb-aa47-18e179307dab&tr=w-128,h-128"
                                }
                                color="#666666"
                                width="18px"
                                minWidth="18px"
                                height="18px"
                                marginRight="8px"
                                borderRadius="50%"
                            />
                            <Text fontWeight="500" color={"#5f5f5f"} fontSize={"16px"} noOfLines={1}>
                                Patrik Opacic
                            </Text>
                        </Flex>
                        <Tree data={data} openByDefault={false} width="100%" height={windowHeight - 165} indent={10}>
                            {CircleTreeNode}
                        </Tree>

                        {/* Your menu content goes here */}
                    </Box>
                </Portal>
            )}

            {contextMenuOpen && <ContextMenu mouseX={mouseX} mouseY={mouseY} href={href} src={src} />}
        </Flex>
    );
};

export default BrowserTab;
