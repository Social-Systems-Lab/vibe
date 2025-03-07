import { Box, Menu, Text, MenuButton, MenuItem, MenuList } from "@chakra-ui/react";
import { MouseEventHandler } from "react";
import { RiHeartAddLine, RiHeartAddFill } from "react-icons/ri";
import { MdCompare } from "react-icons/md";
import { GrInspect } from "react-icons/gr";

const ContextMenu = ({ href, src, mouseX, mouseY }) => {
    return (
        <Menu isOpen>
            <MenuButton as={Box} position="absolute" top={mouseY + 120} left={mouseX} />
            <MenuList maxWidth="200px">
                {/* {href && (
                    <Text paddingLeft="10px" noOfLines={1}>
                        {href}
                    </Text>
                )} */}
                {src && (
                    <Text paddingLeft="10px" noOfLines={1} fontWeight="500">
                        Image
                    </Text>
                )}
                <MenuItem icon={<RiHeartAddLine size="18px" />} onClick={() => console.log("Add to circle...")}>
                    Add to circle...
                </MenuItem>
                <MenuItem icon={<MdCompare size="18px" />} onClick={() => console.log("Find similar")}>
                    Find similar
                </MenuItem>
                {/* Other cool options */}
                <MenuItem icon={<GrInspect size="18px" />} onClick={() => console.log("Inspect Element")}>
                    Inspect Element
                </MenuItem>
            </MenuList>
        </Menu>
    );
};

export default ContextMenu;
