import React, { useState, useEffect } from "react";
import { Tree } from "react-arborist";
import useWindowDimensions from "../useWindowDimensions";
import { MdOutlinePlaylistAddCircle, MdArrowDropDown, MdArrowRight } from "react-icons/md";

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

const Directory = ({ account }) => {
    const [treeData, setTreeData] = useState([]);
    const [selectedFile, setSelectedFile] = useState(null);
    const { windowHeight } = useWindowDimensions();

    const DirectoryTreeNode = ({ node, style }) => {
        return (
            <div
                style={style}
                className={`h-8 flex flex-row items-center rounded-md ${
                    node.isSelected ? 'bg-[#bddbee]' : 'bg-transparent hover:bg-[#eaeaea]'
                } cursor-pointer select-none`}
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
                <div className="ml-2.5 flex flex-row items-center">
                    <FolderArrow node={node} />
                    <img src={node.data.icon} className="w-[18px] min-w-[18px] h-[18px] mr-1.5" />
                    <span className="text-[#333] text-base truncate">
                        {node.data.name}
                    </span>
                </div>
            </div>
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
        <div className="flex flex-grow w-full h-full">
            <div className="w-[300px] p-2.5 flex flex-col">
                <Tree 
                    data={treeData} 
                    disableMultiSelection={true} 
                    openByDefault={false} 
                    width="100%" 
                    height={windowHeight - 115} 
                    indent={10} 
                    rowHeight={32}
                >
                    {DirectoryTreeNode}
                </Tree>
            </div>
            <div className="flex-grow flex flex-col">
                {selectedFile && (
                    <webview
                        src={`/dist-electron/main/Accounts/${selectedFile}`}
                        style={{ width: "100%", height: "100%", marginTop: "10px" }}
                    />
                )}
            </div>
        </div>
    );
};

export default Directory;