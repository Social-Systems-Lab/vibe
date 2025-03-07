import React, { useState, useEffect } from "react";
import { Tree } from "react-arborist";
import { Box, Image, Button, Text, Input, Portal, HStack, InputGroup, InputLeftElement, InputRightElement, IconButton, Flex, Tooltip } from "@chakra-ui/react";
import useWindowDimensions from "../useWindowDimensions";
import { MdOutlinePlaylistAddCircle, MdArrowDropDown, MdArrowRight } from "react-icons/md";

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

const Directory = ({ account }) => {
    const [treeData, setTreeData] = useState([]);
    const [selectedFile, setSelectedFile] = useState(null);
    const { windowHeight } = useWindowDimensions();

    const DirectoryTreeNode = ({ node, style }) => {
        return (
            <Flex
                style={style}
                height="32px"
                flexDirection="row"
                alignItems="center"
                borderRadius="7px"
                backgroundColor={node.isSelected ? "#bddbee" : "transparent"}
                cursor="pointer"
                paddingBottom="0px"
                _hover={{
                    backgroundColor: "#eaeaea",
                }}
                userSelect="none"
                onClick={(e) => {
                    // select node (and deselect all others)
                    node.select();

                    // If it's a file, set it as the selected file
                    if (!node.children || node.children.length === 0) {
                        setSelectedFile(node.id);
                    } else {
                        setSelectedFile(null); // deselect any previously selected file if a folder is clicked
                    }
                }}
                onAuxClick={(e) => {
                    if (e.button === 1) {
                        // open in new tab
                    }
                }}
            >
                <Flex marginLeft="10px" flexDirection="row" align="center">
                    <FolderArrow node={node} />
                    <Image src={node.data.icon} width="18px" minWidth="18px" height="18px" marginRight="5px" />
                    <Text color={"#333"} fontSize={"16px"} noOfLines={1}>
                        {node.data.name}
                    </Text>
                </Flex>
            </Flex>
        );
    };

    useEffect(() => {
        const updateTreeData = async () => {
            window.electron.getAccountsDirectoryData().then((data) => {
                // get the account data for the current account
                const accountData = data.find((x) => x.name === account.name);

                // console.log("getting tree data", JSON.stringify(data, null, 2));
                setTreeData(accountData.children);
            });
        };

        // Initial load
        updateTreeData();

        // Set up the listener for directory changes
        window.electron.on("accounts-directory-changed", updateTreeData);

        // Clean up listener on component unmount
        return () => {
            window.electron.removeListener("accounts-directory-changed", updateTreeData);
        };
    }, [account]);

    return (
        <Flex flexGrow="1" width="100%" height="100%">
            <Flex width="300px" padding="10px" flexDirection="column">
                {/* <Text fontSize="20px" marginLeft="28px">
                    Explorer
                </Text> */}
                <Tree data={treeData} disableMultiSelection={true} openByDefault={false} width="100%" height={windowHeight - 115} indent={10} rowHeight={32}>
                    {DirectoryTreeNode}
                </Tree>
            </Flex>
            <Flex flexGrow="1" flexDirection="column">
                {/* <Text fontSize="20px" marginLeft="28px">
                    Details
                </Text> */}
                {selectedFile && (
                    <webview
                        src={`/dist-electron/main/Accounts/${selectedFile}`}
                        style={{ width: "100%", height: "100%", marginTop: "10px" }} // Adjust as needed
                    />
                )}
            </Flex>
        </Flex>
    );
};

export default Directory;
