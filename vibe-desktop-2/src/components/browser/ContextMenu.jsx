import { MouseEventHandler } from "react";
import { RiHeartAddLine, RiHeartAddFill } from "react-icons/ri";
import { MdCompare } from "react-icons/md";
import { GrInspect } from "react-icons/gr";

const ContextMenu = ({ href, src, mouseX, mouseY }) => {
    return (
        <div className="relative">
            <div className="absolute" style={{ top: mouseY + 120, left: mouseX }}></div>
            <div className="bg-white rounded shadow-lg border border-gray-200 max-w-[200px] py-2 absolute z-50" style={{ top: mouseY + 120, left: mouseX }}>
                {src && (
                    <p className="px-2.5 font-medium truncate">
                        Image
                    </p>
                )}
                <button 
                    className="w-full text-left px-2.5 py-1.5 hover:bg-gray-100 flex items-center"
                    onClick={() => console.log("Add to circle...")}
                >
                    <RiHeartAddLine size="18px" className="mr-2" />
                    Add to circle...
                </button>
                <button 
                    className="w-full text-left px-2.5 py-1.5 hover:bg-gray-100 flex items-center"
                    onClick={() => console.log("Find similar")}
                >
                    <MdCompare size="18px" className="mr-2" />
                    Find similar
                </button>
                <button 
                    className="w-full text-left px-2.5 py-1.5 hover:bg-gray-100 flex items-center"
                    onClick={() => console.log("Inspect Element")}
                >
                    <GrInspect size="18px" className="mr-2" />
                    Inspect Element
                </button>
            </div>
        </div>
    );
};

export default ContextMenu;