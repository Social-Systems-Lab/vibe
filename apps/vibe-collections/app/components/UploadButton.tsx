"use client";

import React from "react";

export function UploadButton() {
    return (
        <button
            onClick={() => document.querySelector<HTMLInputElement>("#collections-hidden-file")?.click()}
            className="w-full rounded-lg bg-blue-600 text-white py-2.5 font-medium hover:bg-blue-700 transition"
        >
            Upload
        </button>
    );
}
