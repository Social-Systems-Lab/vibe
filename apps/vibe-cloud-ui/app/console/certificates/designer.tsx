"use client";

import { useState } from "react";
import { Button, ImagePicker } from "vibe-react";

export default function CertificateDesigner({
    onClose,
    onSave,
}: {
    onClose: () => void;
    onSave: (template: any) => void;
}) {
    const [template, setTemplate] = useState<any>({});
    const [pickerOpen, setPickerOpen] = useState(false);
    const [pickerMode, setPickerMode] = useState<"background" | "badge">("background");

    const onPickerSelect = (files: any[]) => {
        const f = Array.isArray(files) ? files[0] : null;
        if (!f) {
            setPickerOpen(false);
            return;
        }
        setTemplate((prev: any) => ({
            ...prev,
            [pickerMode === "background" ? "backgroundImage" : "badge"]: f.storageKey,
        }));
        setPickerOpen(false);
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center">
            <div className="bg-white rounded-lg p-8 w-full max-w-4xl">
                <h1 className="text-2xl font-bold mb-4">Certificate Designer</h1>
                <div className="grid grid-cols-3 gap-8">
                    <div className="col-span-2">
                        <div className="bg-gray-200 h-96 flex items-center justify-center">
                            <p>Certificate Preview</p>
                        </div>
                    </div>
                    <div>
                        <h2 className="text-lg font-semibold mb-4">Customize</h2>
                        <div>
                            <Button onClick={() => setPickerOpen(true)}>Select Background</Button>
                        </div>
                        <div>
                            <Button onClick={() => setPickerOpen(true)}>Select Badge</Button>
                        </div>
                    </div>
                </div>
                <div className="flex justify-end gap-4 mt-8">
                    <Button variant="outline" onClick={onClose}>
                        Close
                    </Button>
                    <Button onClick={() => onSave(template)}>Save</Button>
                </div>
            </div>
            <ImagePicker
                open={pickerOpen}
                onOpenChange={setPickerOpen}
                onSelect={onPickerSelect}
                accept="image/*"
                selectionMode="single"
                title={pickerMode === "background" ? "Choose background image" : "Choose badge"}
                allowUpload={true}
            />
        </div>
    );
}
